import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  DemandeTransfert,
  DemandeTransfertStatut,
} from './entities/demande-transfert.entity';
import {
  CreateDemandeTransfertDto,
  DecisionDemandeTransfertDto,
} from './dto/create-demande-transfert.dto';
import { LedgerService } from '@modules/transactionnel/ledger.service';
import { AuthorizationService } from '@modules/security/authorization.service';

// Habilitations désormais portées par des permissions (migration 0040) :
//   TRANSFERT_INITIER  → caissier + gestionnaire de portefeuille
//   TRANSFERT_VALIDER  → gestionnaire de portefeuille
//   TRANSFERT_EXECUTER → caissier + gestionnaire de portefeuille
// Les admins passent toujours (bypass géré dans AuthorizationService).

@Injectable()
export class DemandesTransfertService {
  constructor(
    @InjectRepository(DemandeTransfert)
    private readonly repo: Repository<DemandeTransfert>,
    private readonly ledger: LedgerService,
    private readonly authz: AuthorizationService,
  ) {}

  /** Vérifie que la source (caisse ou portefeuille) est dans le périmètre de l'utilisateur. */
  private async assertSourceInPerimeter(
    userId: string,
    sourceType: string,
    sourceId: string,
  ): Promise<void> {
    if (sourceType === 'CAISSE') {
      await this.authz.assertCaisseInPerimeter(userId, sourceId);
    } else {
      await this.authz.assertPortefeuilleInPerimeter(userId, sourceId);
    }
  }

  /** Numéro lisible : DT-YYYYMMDD-000XX */
  private async generateNumero(): Promise<string> {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    const prefix = `DT-${yyyy}${mm}${dd}`;
    const count = await this.repo
      .createQueryBuilder('dt')
      .where('dt.numero LIKE :p', { p: `${prefix}%` })
      .getCount();
    return `${prefix}-${String(count + 1).padStart(5, '0')}`;
  }

  async create(dto: CreateDemandeTransfertDto, userId: string): Promise<DemandeTransfert> {
    if (Number(dto.montant) <= 0) {
      throw new BadRequestException('Le montant doit être strictement positif');
    }
    if (dto.sourceType === dto.destinationType && dto.sourceId === dto.destinationId) {
      throw new BadRequestException('Source et destination doivent être différentes');
    }

    // Autorisation : TRANSFERT_INITIER (caissier / gestionnaire + admins), source dans son périmètre.
    await this.authz.assertPermission(userId, 'TRANSFERT_INITIER', 'créer un transfert');
    await this.assertSourceInPerimeter(userId, dto.sourceType, dto.sourceId);

    const dt = this.repo.create({
      numero: await this.generateNumero(),
      demandeurId: userId as any,
      sourceType: dto.sourceType,
      sourceId: dto.sourceId as any,
      destinationType: dto.destinationType,
      destinationId: dto.destinationId as any,
      montant: dto.montant,
      deviseId: dto.deviseId as any,
      motif: dto.motif ?? null,
      statut: 'CREE',
      createdById: userId as any,
    });
    return this.repo.save(dt);
  }

  async findOne(id: string): Promise<DemandeTransfert> {
    const dt = await this.repo.findOne({ where: { id } });
    if (!dt) throw new NotFoundException(`Demande de transfert ${id} introuvable`);
    return dt;
  }

  private static readonly DT_SORT_MAP: Record<string, string> = {
    numero: 'dt.numero',
    statut: 'dt.statut',
    montant: 'dt.montant',
    createdAt: 'dt.created_at',
  };

  findAll(opts: {
    statut?: DemandeTransfertStatut;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
  } = {}): Promise<DemandeTransfert[]> {
    const qb = this.repo.createQueryBuilder('dt').where('dt.deleted_at IS NULL');
    if (opts.statut) qb.andWhere('dt.statut = :statut', { statut: opts.statut });
    // Bornes de dates EN BASE sur la date de création (jour inclus des deux côtés).
    if (opts.dateFrom) qb.andWhere('dt.created_at >= :df', { df: `${opts.dateFrom}T00:00:00.000` });
    if (opts.dateTo) qb.andWhere('dt.created_at <= :dt2', { dt2: `${opts.dateTo}T23:59:59.997` });
    if (opts.search) {
      // Recherche BD : numéro / motif / montant + nom du demandeur (join sec_user).
      qb.leftJoin('sec_user', 'u', 'u.id = dt.demandeur_id').andWhere(
        "(dt.numero LIKE :q OR dt.motif LIKE :q OR CAST(dt.montant AS nvarchar(50)) LIKE :q " +
          "OR (u.prenom + ' ' + u.nom) LIKE :q OR (u.nom + ' ' + u.prenom) LIKE :q)",
        { q: `%${opts.search}%` },
      );
    }
    const column = DemandesTransfertService.DT_SORT_MAP[opts.sortBy ?? ''];
    const direction: 'ASC' | 'DESC' = opts.sortDir === 'asc' ? 'ASC' : 'DESC';
    if (column) qb.orderBy(column, direction);
    else qb.orderBy('dt.created_at', 'DESC');
    return qb.getMany();
  }

  /**
   * Compteurs par statut (GROUP BY en base), calculés en appliquant la recherche et
   * les bornes de dates mais PAS le filtre de statut : les onglets doivent afficher
   * le total de chaque statut, y compris ceux qui ne sont pas sélectionnés.
   */
  async statsParStatut(
    opts: { search?: string; dateFrom?: string; dateTo?: string } = {},
  ): Promise<{ total: number; parStatut: Record<string, number> }> {
    const qb = this.repo
      .createQueryBuilder('dt')
      .select('dt.statut', 'statut')
      .addSelect('COUNT(*)', 'n')
      .where('dt.deleted_at IS NULL');
    if (opts.dateFrom) qb.andWhere('dt.created_at >= :df', { df: `${opts.dateFrom}T00:00:00.000` });
    if (opts.dateTo) qb.andWhere('dt.created_at <= :dt2', { dt2: `${opts.dateTo}T23:59:59.997` });
    if (opts.search) {
      qb.leftJoin('sec_user', 'u', 'u.id = dt.demandeur_id').andWhere(
        "(dt.numero LIKE :q OR dt.motif LIKE :q OR CAST(dt.montant AS nvarchar(50)) LIKE :q " +
          "OR (u.prenom + ' ' + u.nom) LIKE :q OR (u.nom + ' ' + u.prenom) LIKE :q)",
        { q: `%${opts.search}%` },
      );
    }
    const rows: Array<{ statut: string; n: string | number }> = await qb
      .groupBy('dt.statut')
      .getRawMany();

    const parStatut: Record<string, number> = {};
    let total = 0;
    for (const r of rows) {
      const n = Number(r.n);
      parStatut[r.statut] = n;
      total += n;
    }
    return { total, parStatut };
  }

  async decision(
    id: string,
    dto: DecisionDemandeTransfertDto,
    validateurId: string,
  ): Promise<DemandeTransfert> {
    const dt = await this.findOne(id);
    if (dt.statut !== 'CREE') {
      throw new BadRequestException(
        `Décision impossible : la demande est déjà ${dt.statut.toLowerCase()}.`,
      );
    }
    // Autorisation : TRANSFERT_VALIDER (gestionnaire de portefeuille + admins).
    await this.authz.assertPermission(validateurId, 'TRANSFERT_VALIDER', 'approuver un transfert');
    if (String(dt.demandeurId) === String(validateurId)) {
      throw new ForbiddenException(
        'Vous ne pouvez pas approuver / rejeter votre propre demande.',
      );
    }
    dt.statut = dto.approuve ? 'APPROUVEE' : 'REJETEE';
    dt.validateurId = validateurId as any;
    dt.dateValidation = new Date();
    dt.commentaireValidation = dto.commentaire ?? null;
    dt.updatedById = validateurId as any;
    return this.repo.save(dt);
  }

  async cancel(id: string, userId: string): Promise<DemandeTransfert> {
    const dt = await this.findOne(id);
    if (String(dt.demandeurId) !== String(userId)) {
      throw new ForbiddenException("Seul le demandeur peut annuler la demande.");
    }
    if (dt.statut !== 'CREE') {
      throw new BadRequestException(
        `Annulation impossible : la demande est ${dt.statut.toLowerCase()}.`,
      );
    }
    dt.statut = 'ANNULEE';
    dt.updatedById = userId as any;
    return this.repo.save(dt);
  }

  /**
   * Exécute physiquement le transfert :
   * - crée une opération TRANSFERT sur le Ledger
   * - le solde des comptes source/destination s'ajuste via les écritures correspondantes (à implémenter)
   */
  async execute(id: string, executeurId: string): Promise<DemandeTransfert> {
    const dt = await this.findOne(id);
    if (dt.statut !== 'APPROUVEE') {
      throw new BadRequestException(
        `La demande doit être APPROUVEE pour être exécutée (statut actuel : ${dt.statut}).`,
      );
    }
    // Autorisation : TRANSFERT_EXECUTER (caissiers / gestionnaires + admins).
    await this.authz.assertPermission(executeurId, 'TRANSFERT_EXECUTER', 'exécuter un transfert');
    const transactionUuid = uuidv4();
    // On enregistre une opération TRANSFERT côté Ledger.
    // Note : pour un transfert caisse → portefeuille (et vice-versa), on émet l'opération sur la source.
    await this.ledger.createOperation({
      typeOperation: 'TRANSFERT',
      caisseId: dt.sourceType === 'CAISSE' ? (dt.sourceId as any) : undefined,
      portefeuilleId: dt.sourceType === 'PORTEFEUILLE' ? (dt.sourceId as any) : undefined,
      montant: dt.montant,
      deviseId: dt.deviseId as any,
      reference: dt.numero,
      userId: executeurId,
    });
    dt.statut = 'EXECUTEE';
    dt.executeurId = executeurId as any;
    dt.dateExecution = new Date();
    dt.transactionUuid = transactionUuid;
    dt.updatedById = executeurId as any;
    return this.repo.save(dt);
  }
}
