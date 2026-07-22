import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Carnet, CarnetStatut } from './entities/carnet.entity';
import { BonManuel } from './entities/bon-manuel.entity';
import { Portefeuille } from '@modules/financier/entities/portefeuille.entity';
import { LedgerService } from './ledger.service';
import { AuthorizationService } from '@modules/security/authorization.service';
import { CreateCarnetDto } from './dto/create-carnet.dto';
import { CreateBonManuelDto } from './dto/create-bon-manuel.dto';

@Injectable()
export class BonsManuelsService {
  constructor(
    @InjectRepository(Carnet)
    private readonly carnetRepo: Repository<Carnet>,
    @InjectRepository(BonManuel)
    private readonly bonManuelRepo: Repository<BonManuel>,
    private readonly dataSource: DataSource,
    private readonly ledger: LedgerService,
    private readonly authz: AuthorizationService,
  ) {}

  // ========================= CARNETS =========================

  /** Création d'un carnet : réservée aux admins (assigne caisse + caissier + plage). */
  async createCarnet(dto: CreateCarnetDto, userId: string): Promise<Carnet> {
    if (!(await this.authz.isAdmin(userId))) {
      throw new ForbiddenException('Seul un administrateur peut créer un carnet.');
    }
    if (dto.numeroFin < dto.numeroDebut) {
      throw new BadRequestException('Le numéro de fin doit être ≥ au numéro de début.');
    }
    // Anti-chevauchement : la plage [début, fin] ne doit recouvrir AUCUN carnet
    // existant — deux plages se chevauchent si début ≤ autre.fin ET fin ≥ autre.début.
    // Garantit qu'un même numéro n'appartient jamais à deux carnets.
    const conflit = await this.carnetRepo
      .createQueryBuilder('c')
      .where('c.numero_debut <= :fin', { fin: dto.numeroFin })
      .andWhere('c.numero_fin >= :debut', { debut: dto.numeroDebut })
      .getOne();
    if (conflit) {
      throw new BadRequestException(
        `La plage ${dto.numeroDebut}–${dto.numeroFin} chevauche le carnet ` +
          `${conflit.libelle ? `« ${conflit.libelle} » ` : ''}(${conflit.numeroDebut}–${conflit.numeroFin}). ` +
          `Choisissez une plage qui ne recouvre aucun numéro déjà attribué.`,
      );
    }
    const carnet = this.carnetRepo.create({
      uuid: uuidv4(),
      libelle: dto.libelle?.trim() || null,
      caisseId: dto.caisseId as any,
      caissierId: dto.caissierId as any,
      numeroDebut: dto.numeroDebut,
      numeroFin: dto.numeroFin,
      prochainNumero: dto.numeroDebut,
      statut: 'ACTIF',
      createdById: userId as any,
    });
    return this.carnetRepo.save(carnet);
  }

  /** Carnets visibles : tous pour un admin, sinon ceux du caissier connecté. */
  async findCarnets(userId: string, statut?: CarnetStatut): Promise<Carnet[]> {
    const isAdmin = await this.authz.isAdmin(userId);
    const where: Record<string, unknown> = {};
    if (!isAdmin) where.caissierId = userId;
    if (statut) where.statut = statut;
    return this.carnetRepo.find({ where: where as any, order: { createdAt: 'DESC' } });
  }

  async findCarnet(id: string): Promise<Carnet> {
    const carnet = await this.carnetRepo.findOne({ where: { id } });
    if (!carnet) throw new NotFoundException(`Carnet ${id} introuvable`);
    return carnet;
  }

  /** Clôture manuelle d'un carnet (admin). */
  async cloturerCarnet(id: string, userId: string): Promise<Carnet> {
    if (!(await this.authz.isAdmin(userId))) {
      throw new ForbiddenException('Seul un administrateur peut clôturer un carnet.');
    }
    const carnet = await this.findCarnet(id);
    carnet.statut = 'CLOTURE';
    carnet.updatedById = userId as any;
    return this.carnetRepo.save(carnet);
  }

  // ========================= BONS MANUELS =========================

  /**
   * Whitelist des colonnes triables côté BD (défaut : date_decaissement DESC).
   * Le donneur d'ordre (user OU nom libre) n'est pas exposé au tri car mixte.
   */
  private static readonly BON_MANUEL_SORT_MAP: Record<string, string> = {
    numero: 'bm.numero',
    numeroManuel: 'bm.numero_manuel',
    montant: 'bm.montant',
    beneficiaireNom: 'bm.beneficiaire_nom',
    dateDecaissement: 'bm.date_decaissement',
  };

  async findBonsManuels(
    userId: string,
    opts: { search?: string; sortBy?: string; sortDir?: 'asc' | 'desc' } = {},
  ): Promise<BonManuel[]> {
    const isAdmin = await this.authz.isAdmin(userId);
    const qb = this.bonManuelRepo.createQueryBuilder('bm');
    if (!isAdmin) qb.where('bm.caissier_id = :uid', { uid: userId });
    if (opts.search) {
      // Recherche BD : n° système / n° carnet / bénéficiaire / montant + donneur d'ordre
      // (nom libre OU nom de l'utilisateur via join sec_user).
      qb.leftJoin('sec_user', 'du', 'du.id = bm.donneur_ordre_user_id').andWhere(
        "(bm.numero LIKE :q OR CAST(bm.numero_manuel AS nvarchar(20)) LIKE :q " +
          "OR bm.beneficiaire_nom LIKE :q OR bm.donneur_ordre_nom LIKE :q " +
          "OR CAST(bm.montant AS nvarchar(50)) LIKE :q " +
          "OR (du.prenom + ' ' + du.nom) LIKE :q OR (du.nom + ' ' + du.prenom) LIKE :q)",
        { q: `%${opts.search}%` },
      );
    }
    const column = BonsManuelsService.BON_MANUEL_SORT_MAP[opts.sortBy ?? ''];
    const direction: 'ASC' | 'DESC' = opts.sortDir === 'asc' ? 'ASC' : 'DESC';
    if (column) qb.orderBy(column, direction);
    else qb.orderBy('bm.date_decaissement', 'DESC');
    return qb.getMany();
  }

  /**
   * Crée un bon manuel : décaissement direct (statut DECAISSE) hors circuit,
   * + opération comptable (DECAISSEMENT), + avancement du carnet.
   */
  async createBonManuel(dto: CreateBonManuelDto, caissierId: string): Promise<BonManuel> {
    // Rôle requis : caissier (admins/DAF passent).
    await this.authz.assertAnyRole(caissierId, ['CAISSIER'], 'créer un bon manuel');
    const isAdmin = await this.authz.isAdmin(caissierId);

    return this.dataSource.transaction(async (manager) => {
      const carnetRepo = manager.getRepository(Carnet);
      const bmRepo = manager.getRepository(BonManuel);

      const carnet = await carnetRepo.findOne({ where: { id: dto.carnetId } });
      if (!carnet) throw new NotFoundException('Carnet introuvable.');
      if (carnet.statut !== 'ACTIF') {
        throw new BadRequestException(`Carnet non actif (statut ${carnet.statut}).`);
      }
      if (!isAdmin && String(carnet.caissierId) !== String(caissierId)) {
        throw new ForbiddenException("Ce carnet n'est pas le vôtre.");
      }
      if (dto.numeroManuel < carnet.numeroDebut || dto.numeroManuel > carnet.numeroFin) {
        throw new BadRequestException(
          `Numéro ${dto.numeroManuel} hors de la plage du carnet (${carnet.numeroDebut}–${carnet.numeroFin}).`,
        );
      }
      const deja = await bmRepo.findOne({
        where: { carnetId: dto.carnetId as any, numeroManuel: dto.numeroManuel },
      });
      if (deja) {
        throw new ConflictException(`Le numéro ${dto.numeroManuel} de ce carnet est déjà utilisé.`);
      }

      // Caisse + devise déduites du portefeuille.
      const pf = await manager.getRepository(Portefeuille).findOne({ where: { id: dto.portefeuilleId } });
      if (!pf) throw new NotFoundException('Portefeuille introuvable.');
      if (String(pf.caisseSourceId) !== String(carnet.caisseId)) {
        throw new BadRequestException('Le portefeuille doit appartenir à la caisse du carnet.');
      }

      if (!dto.donneurOrdreUserId && !dto.donneurOrdreNom?.trim()) {
        throw new BadRequestException("Précisez le donneur d'ordre (utilisateur ou nom).");
      }

      const now = new Date();
      const numero = await this.generateNumero(bmRepo);

      const bon = await bmRepo.save(
        bmRepo.create({
          uuid: uuidv4(),
          numero,
          carnetId: dto.carnetId as any,
          numeroManuel: dto.numeroManuel,
          caissierId: caissierId as any,
          caisseId: pf.caisseSourceId as any,
          portefeuilleId: pf.id as any,
          deviseId: pf.deviseId as any,
          montant: dto.montant,
          typeBonId: dto.typeBonId as any,
          libelle: dto.libelle.trim(),
          partenaireId: dto.partenaireId ? (dto.partenaireId as any) : null,
          numeroBl: dto.numeroBl?.trim() || '',
          codeManutention: dto.codeManutention.trim(),
          costCenterId: dto.costCenterId as any,
          numeroClient: dto.numeroClient?.trim() || null,
          description: dto.description?.trim() || null,
          donneurOrdreUserId: dto.donneurOrdreUserId ? (dto.donneurOrdreUserId as any) : null,
          donneurOrdreNom: dto.donneurOrdreNom?.trim() || null,
          beneficiaireNom: dto.beneficiaireNom.trim(),
          motif: dto.motif?.trim() || null,
          statut: 'DECAISSE',
          dateDecaissement: now,
          createdById: caissierId as any,
        }),
      );

      // Opération comptable (visible dans Opérations).
      const operation = await this.ledger.createOperation(
        {
          typeOperation: 'DECAISSEMENT',
          caisseId: pf.caisseSourceId,
          portefeuilleId: pf.id,
          montant: dto.montant,
          deviseId: pf.deviseId,
          userId: caissierId,
          reference: `MANUEL-${numero}`,
        },
        manager,
      );

      // Garde budgétaire : refuse si le budget mensuel du centre de coût serait dépassé.
      await this.ledger.assertCostCenterMonthlyBudget(String(dto.costCenterId), dto.montant, manager);

      // Écritures en partie double (cf. Dossier) : DÉBIT portefeuille (le solde baisse,
      // solde = Σcrédit − Σdébit) / CRÉDIT compte de CHARGE imputé au centre de coût.
      await this.ledger.createPairedEcritures(
        { compteId: pf.id, typeCompte: 'PORTEFEUILLE', deviseId: pf.deviseId, costCenterId: dto.costCenterId },
        { compteId: dto.costCenterId, typeCompte: 'CHARGE', deviseId: pf.deviseId, costCenterId: dto.costCenterId },
        dto.montant,
        operation.transactionUuid,
        manager,
      );

      // Avancement du carnet (épuisé au dernier numéro).
      if (dto.numeroManuel >= carnet.prochainNumero) {
        carnet.prochainNumero = dto.numeroManuel + 1;
      }
      if (carnet.prochainNumero > carnet.numeroFin) {
        carnet.statut = 'EPUISE';
      }
      carnet.updatedById = caissierId as any;
      await carnetRepo.save(carnet);

      return bon;
    });
  }

  private async generateNumero(repo: Repository<BonManuel>): Promise<string> {
    const count = await repo.count();
    return `BM-${String(count + 1).padStart(5, '0')}`;
  }
}
