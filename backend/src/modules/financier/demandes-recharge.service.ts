import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DemandeRecharge, DemandeRechargeStatut } from './entities/demande-recharge.entity';
import { Portefeuille } from './entities/portefeuille.entity';
import { User } from '@modules/security/entities/user.entity';
import { RechargeService } from './recharge.service';
import { AuthorizationService } from '@modules/security/authorization.service';

@Injectable()
export class DemandesRechargeService {
  constructor(
    @InjectRepository(DemandeRecharge)
    private readonly repo: Repository<DemandeRecharge>,
    private readonly dataSource: DataSource,
    private readonly recharge: RechargeService,
    private readonly authz: AuthorizationService,
  ) {}

  /** Numéro lisible : DR-YYYYMMDD-000XX */
  private async generateNumero(): Promise<string> {
    const now = new Date();
    const prefix = `DR-${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(
      now.getUTCDate(),
    ).padStart(2, '0')}`;
    const count = await this.repo
      .createQueryBuilder('dr')
      .where('dr.numero LIKE :p', { p: `${prefix}%` })
      .getCount();
    return `${prefix}-${String(count + 1).padStart(5, '0')}`;
  }

  /**
   * Portefeuille cible du demandeur (il ne le choisit pas) :
   * le sien (USER) ou celui de sa direction (DIRECTION). S'il y en a plusieurs, on prend le premier.
   */
  /**
   * Portefeuilles que l'utilisateur peut recharger : le sien (USER) et ceux de sa
   * direction (DIRECTION). Sert au choix lorsqu'il en a plusieurs.
   */
  async getPortefeuillesRechargeables(userId: string): Promise<Portefeuille[]> {
    const ptfRepo = this.dataSource.getRepository(Portefeuille);

    // « Recharge tout » piloté par PERMISSION : un admin ou un compte ayant
    // PORTEFEUILLE_VOIR_TOUS peut demander une recharge pour N'IMPORTE QUEL
    // portefeuille actif (il en choisit un dans la liste).
    const seeAll =
      (await this.authz.isAdmin(userId)) ||
      (await this.authz.hasPermission(userId, 'PORTEFEUILLE_VOIR_TOUS'));
    if (seeAll) {
      return ptfRepo.find({ where: { estActif: true } as any, order: { id: 'ASC' } });
    }

    // Sinon : uniquement le sien (USER) et ceux de sa direction (DIRECTION).
    const user = await this.dataSource.getRepository(User).findOne({ where: { id: userId } });
    const where: Array<Record<string, unknown>> = [
      { proprietaireType: 'USER', proprietaireId: userId, estActif: true },
    ];
    if (user?.directionId) {
      where.push({ proprietaireType: 'DIRECTION', proprietaireId: user.directionId, estActif: true });
    }
    return ptfRepo.find({ where: where as any, order: { id: 'ASC' } });
  }

  /** Résout le portefeuille cible : choix explicite si fourni, sinon l'unique candidat. */
  private async resolvePortefeuille(userId: string, portefeuilleId?: string): Promise<Portefeuille> {
    const candidates = await this.getPortefeuillesRechargeables(userId);
    if (candidates.length === 0) {
      throw new BadRequestException(
        "Aucun portefeuille n'est rattaché à votre compte (ni en propre, ni via votre direction). Contactez un administrateur.",
      );
    }
    if (portefeuilleId) {
      const chosen = candidates.find((p) => String(p.id) === String(portefeuilleId));
      if (!chosen) {
        throw new BadRequestException(
          "Le portefeuille choisi ne fait pas partie de ceux que vous pouvez recharger.",
        );
      }
      return chosen;
    }
    if (candidates.length > 1) {
      throw new BadRequestException(
        'Vous gérez plusieurs portefeuilles : veuillez en choisir un pour la recharge.',
      );
    }
    return candidates[0];
  }

  async create(
    dto: { montant: string; motif?: string; portefeuilleId?: string },
    userId: string,
  ): Promise<DemandeRecharge> {
    if (Number(dto.montant) <= 0) {
      throw new BadRequestException('Le montant doit être strictement positif');
    }
    // Ce n'est pas le demandeur (créateur de bons) qui demande une recharge, mais le
    // responsable du portefeuille : RECHARGE_DEMANDER est attribuée au validateur et
    // au gestionnaire de portefeuille (les administrateurs passent — migration 0040).
    await this.authz.assertPermission(
      userId,
      'RECHARGE_DEMANDER',
      'demander une recharge de portefeuille',
    );
    const ptf = await this.resolvePortefeuille(userId, dto.portefeuilleId);
    const dr = this.repo.create({
      numero: await this.generateNumero(),
      demandeurId: userId as any,
      portefeuilleId: ptf.id as any,
      montant: dto.montant,
      motif: dto.motif ?? null,
      statut: 'EN_ATTENTE',
      createdById: userId as any,
    });
    return this.repo.save(dr);
  }

  async findOne(id: string): Promise<DemandeRecharge> {
    const dr = await this.repo.findOne({ where: { id } });
    if (!dr) throw new NotFoundException(`Demande de recharge ${id} introuvable`);
    return dr;
  }

  /** Whitelist des colonnes triables côté BD (défaut : created_at DESC). */
  private static readonly DR_SORT_MAP: Record<string, string> = {
    numero: 'dr.numero',
    montant: 'dr.montant',
    statut: 'dr.statut',
    createdAt: 'dr.created_at',
  };

  findAll(
    opts: {
      statut?: DemandeRechargeStatut;
      demandeurId?: string;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
      sortBy?: string;
      sortDir?: 'asc' | 'desc';
    } = {},
  ): Promise<DemandeRecharge[]> {
    const qb = this.repo.createQueryBuilder('dr').where('dr.deleted_at IS NULL');
    if (opts.statut) qb.andWhere('dr.statut = :statut', { statut: opts.statut });
    if (opts.demandeurId) qb.andWhere('dr.demandeur_id = :did', { did: opts.demandeurId });
    // Bornes de dates EN BASE sur la date de création (jour inclus des deux côtés) :
    // l'écran affiche par défaut la journée courante, inutile de tout rapatrier.
    if (opts.dateFrom) qb.andWhere('dr.created_at >= :df', { df: `${opts.dateFrom}T00:00:00.000` });
    if (opts.dateTo) qb.andWhere('dr.created_at <= :dt', { dt: `${opts.dateTo}T23:59:59.997` });
    if (opts.search) {
      // Recherche BD : n° / motif / montant + demandeur (join sec_user) + portefeuille (join fin_portefeuille).
      qb.leftJoin('sec_user', 'u', 'u.id = dr.demandeur_id')
        .leftJoin('fin_portefeuille', 'p', 'p.id = dr.portefeuille_id')
        .andWhere(
          "(dr.numero LIKE :q OR dr.motif LIKE :q OR CAST(dr.montant AS nvarchar(50)) LIKE :q " +
            "OR (u.prenom + ' ' + u.nom) LIKE :q OR (u.nom + ' ' + u.prenom) LIKE :q " +
            "OR p.code LIKE :q OR p.libelle LIKE :q)",
          { q: `%${opts.search}%` },
        );
    }
    const column = DemandesRechargeService.DR_SORT_MAP[opts.sortBy ?? ''];
    const direction: 'ASC' | 'DESC' = opts.sortDir === 'asc' ? 'ASC' : 'DESC';
    if (column) qb.orderBy(column, direction);
    else qb.orderBy('dr.created_at', 'DESC');
    return qb.getMany();
  }

  /** Le caissier traite la demande = effectue la recharge réelle (caisse source → portefeuille). */
  async traiter(id: string, caissierId: string, montantAjuste?: string): Promise<DemandeRecharge> {
    await this.authz.assertPermission(
      caissierId,
      'RECHARGE_TRAITER',
      'traiter une demande de recharge',
    );
    const dr = await this.findOne(id);
    if (dr.statut !== 'EN_ATTENTE') {
      throw new BadRequestException(`Traitement impossible : la demande est ${dr.statut.toLowerCase()}.`);
    }
    const ptf = await this.dataSource.getRepository(Portefeuille).findOne({ where: { id: dr.portefeuilleId } });
    if (!ptf) throw new NotFoundException('Portefeuille cible introuvable');

    const montant = montantAjuste ?? dr.montant;
    // recharge() vérifie déjà le rôle CAISSIER + le périmètre caisse + caisse ouverte / devise.
    const { operation } = await this.recharge.recharge({
      caisseId: ptf.caisseSourceId,
      portefeuilleId: ptf.id,
      montant,
      userId: caissierId,
      reference: `Recharge ${dr.numero}`,
    });

    dr.statut = 'TRAITEE';
    dr.traiteParId = caissierId as any;
    dr.dateTraitement = new Date();
    dr.montant = montant;
    dr.transactionUuid = operation.transactionUuid;
    dr.updatedById = caissierId as any;
    return this.repo.save(dr);
  }

  async rejeter(id: string, caissierId: string, commentaire?: string): Promise<DemandeRecharge> {
    await this.authz.assertPermission(
      caissierId,
      'RECHARGE_TRAITER',
      'rejeter une demande de recharge',
    );
    const dr = await this.findOne(id);
    if (dr.statut !== 'EN_ATTENTE') {
      throw new BadRequestException(`Rejet impossible : la demande est ${dr.statut.toLowerCase()}.`);
    }
    dr.statut = 'REJETEE';
    dr.traiteParId = caissierId as any;
    dr.dateTraitement = new Date();
    dr.commentaireTraitement = commentaire ?? null;
    dr.updatedById = caissierId as any;
    return this.repo.save(dr);
  }

  async annuler(id: string, userId: string): Promise<DemandeRecharge> {
    const dr = await this.findOne(id);
    if (String(dr.demandeurId) !== String(userId)) {
      throw new ForbiddenException('Seul le demandeur peut annuler sa demande.');
    }
    if (dr.statut !== 'EN_ATTENTE') {
      throw new BadRequestException(`Annulation impossible : la demande est ${dr.statut.toLowerCase()}.`);
    }
    dr.statut = 'ANNULEE';
    dr.updatedById = userId as any;
    return this.repo.save(dr);
  }
}
