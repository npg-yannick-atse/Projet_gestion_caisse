import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Portefeuille } from './entities/portefeuille.entity';
import { CreatePortefeuilleDto } from './dto/create-portefeuille.dto';
import { UpdatePortefeuilleDto } from './dto/update-portefeuille.dto';
import { LedgerService } from '@modules/transactionnel/ledger.service';
import { AuthorizationService } from '@modules/security/authorization.service';
import { CostCenter } from '@modules/referentiel/entities/cost-center.entity';

@Injectable()
export class PortefeuillesService {
  constructor(
    @InjectRepository(Portefeuille)
    private readonly portefeuilleRepo: Repository<Portefeuille>,
    private readonly ledgerService: LedgerService,
    private readonly authz: AuthorizationService,
  ) {}

  /**
   * Budget mensuel hérité du centre de coût de la direction (règle métier : une
   * direction = un centre de coût). Renvoie le budget du CC, ou null si aucun.
   */
  private async budgetDirection(proprietaireId: string): Promise<string | null> {
    const cc = await this.portefeuilleRepo.manager
      .getRepository(CostCenter)
      .findOne({ where: { directionId: proprietaireId as any } });
    return cc?.budgetMensuel ?? null;
  }

  async create(dto: CreatePortefeuilleDto, userId: string): Promise<Portefeuille> {
    // withDeleted : la contrainte UNIQUE en base compte aussi les lignes
    // soft-deleted, que `findOne` masque par défaut. Sans cette option, le code
    // d'un portefeuille supprimé passait le contrôle et faisait remonter une
    // erreur SQL brute à l'écran.
    const existing = await this.portefeuilleRepo.findOne({ where: { code: dto.code }, withDeleted: true });
    if (existing) {
      throw new ConflictException(
        existing.deletedAt
          ? `Le code ${dto.code} est encore occupé par un portefeuille supprimé. Choisissez un autre code.`
          : `Un portefeuille avec le code ${dto.code} existe déjà`,
      );
    }
    // Portefeuille de DIRECTION : le budget mensuel est hérité (non saisi) du centre
    // de coût de la direction. Portefeuille USER : budget saisi manuellement.
    const budgetMensuel =
      dto.proprietaireType === 'DIRECTION' && dto.proprietaireId
        ? await this.budgetDirection(String(dto.proprietaireId))
        : dto.budgetMensuel
          ? dto.budgetMensuel
          : null;
    const portefeuille = this.portefeuilleRepo.create({
      code: dto.code,
      libelle: dto.libelle,
      caisseSourceId: dto.caisseSourceId as any,
      deviseId: dto.deviseId as any,
      proprietaireType: dto.proprietaireType,
      proprietaireId: dto.proprietaireId as any,
      gestionnaireId: dto.gestionnaireId ? (dto.gestionnaireId as any) : null,
      soldeInitial: dto.soldeInitial ?? '0',
      budgetMensuel,
      estActif: true,
      createdById: userId as any,
    });
    return this.portefeuilleRepo.save(portefeuille);
  }

  async update(id: string, dto: UpdatePortefeuilleDto, userId: string): Promise<Portefeuille> {
    const pf = await this.findOne(id);
    if (dto.code && dto.code !== pf.code) {
      const conflict = await this.portefeuilleRepo.findOne({ where: { code: dto.code }, withDeleted: true });
      if (conflict) {
        throw new ConflictException(
          conflict.deletedAt
            ? `Le code ${dto.code} est encore occupé par un portefeuille supprimé. Choisissez un autre code.`
            : `Un portefeuille avec le code ${dto.code} existe déjà`,
        );
      }
      pf.code = dto.code;
    }
    if (dto.libelle !== undefined) pf.libelle = dto.libelle;
    if (dto.caisseSourceId !== undefined) pf.caisseSourceId = dto.caisseSourceId as any;
    if (dto.deviseId !== undefined) pf.deviseId = dto.deviseId as any;
    if (dto.proprietaireType !== undefined) pf.proprietaireType = dto.proprietaireType;
    if (dto.proprietaireId !== undefined) pf.proprietaireId = dto.proprietaireId as any;
    if (dto.gestionnaireId !== undefined) pf.gestionnaireId = dto.gestionnaireId ? (dto.gestionnaireId as any) : null;
    // Solde initial : modification encadrée. On ne réagit que s'il CHANGE réellement.
    //  1) Autorisation dédiée requise (les admins la bypassent).
    //  2) Verrou d'intégrité : figé dès qu'une écriture existe sur le portefeuille —
    //     changer l'amorce réécrirait rétroactivement tout l'historique de solde.
    //     Pour corriger un solde après activité, passer par une opération d'ajustement.
    if (dto.soldeInitial !== undefined && Number(dto.soldeInitial) !== Number(pf.soldeInitial || 0)) {
      await this.authz.assertPermissionStrict(
        userId,
        'PORTEFEUILLE_SOLDE_INITIAL',
        'modifier le solde initial d\'un portefeuille',
      );
      if (await this.ledgerService.hasEcritures(id, 'PORTEFEUILLE')) {
        throw new BadRequestException(
          'Solde initial verrouillé : des écritures existent déjà sur ce portefeuille. ' +
            'Passez par une opération d\'ajustement pour corriger le solde.',
        );
      }
      pf.soldeInitial = dto.soldeInitial;
    }
    // Budget mensuel : hérité du centre de coût pour un portefeuille de DIRECTION
    // (non modifiable), saisi manuellement pour un portefeuille USER (chaîne vide => null).
    if (pf.proprietaireType === 'DIRECTION') {
      pf.budgetMensuel = pf.proprietaireId ? await this.budgetDirection(String(pf.proprietaireId)) : null;
    } else if (dto.budgetMensuel !== undefined) {
      pf.budgetMensuel = dto.budgetMensuel ? dto.budgetMensuel : null;
    }
    if (dto.estActif !== undefined) pf.estActif = dto.estActif;
    pf.updatedById = userId as any;
    return this.portefeuilleRepo.save(pf);
  }

  async softDelete(id: string, userId: string): Promise<void> {
    const pf = await this.findOne(id);
    // Garde-fou : refus si le portefeuille a encore des opérations en cours.
    const m = this.portefeuilleRepo.manager;
    const checks: Array<[string, string]> = [
      ['demande(s) de recharge en attente', `SELECT COUNT(*) n FROM dbo.fin_demande_recharge WHERE portefeuille_id=@0 AND statut='EN_ATTENTE' AND deleted_at IS NULL`],
      ['transfert(s) en cours', `SELECT COUNT(*) n FROM dbo.fin_demande_transfert WHERE statut IN ('CREE','VALIDE') AND deleted_at IS NULL AND ((source_type='PORTEFEUILLE' AND source_id=@0) OR (destination_type='PORTEFEUILLE' AND destination_id=@0))`],
    ];
    const bloquants: string[] = [];
    for (const [label, sql] of checks) {
      const r = await m.query(sql, [id]);
      const n = Number(r?.[0]?.n ?? 0);
      if (n > 0) bloquants.push(`${n} ${label}`);
    }
    if (bloquants.length) {
      throw new ConflictException(
        `Impossible de désactiver ce portefeuille : ${bloquants.join(', ')}. Traitez-les d'abord.`,
      );
    }
    pf.deletedAt = new Date();
    pf.deletedById = userId as any;
    pf.estActif = false;
    await this.portefeuilleRepo.save(pf);
  }

  async toggleActif(id: string, estActif: boolean, userId: string): Promise<Portefeuille> {
    const pf = await this.findOne(id);
    pf.estActif = estActif;
    pf.updatedById = userId as any;
    return this.portefeuilleRepo.save(pf);
  }

  async findAll(caisseId?: string, includeInactive = true): Promise<Portefeuille[]> {
    // Par défaut on retourne aussi les portefeuilles désactivés pour permettre
    // la réactivation depuis l'UI. La sélection "uniquement actifs" est filtrée côté front.
    const liste = await this.portefeuilleRepo.find({
      where: {
        ...(includeInactive ? {} : { estActif: true }),
        ...(caisseId ? { caisseSourceId: caisseId } : {}),
      },
      order: { libelle: 'ASC' },
    });
    return this.nommerProprietaires(liste);
  }

  /**
   * Nomme le propriétaire de chaque portefeuille.
   *
   * `proprietaire_type` + `proprietaire_id` forment un lien POLYMORPHE : selon
   * le type, l'identifiant désigne un utilisateur ou une direction. Aucune
   * jointure ne couvre les deux, et l'écran ne peut pas deviner qu'un « 2 »
   * signifie « Direction Usine ».
   *
   * C'est ce qui manquait pour comprendre POURQUOI l'on voit un portefeuille :
   * un validateur qui en découvre deux dans sa liste doit pouvoir lire qu'ils
   * appartiennent à sa direction, et non chercher l'explication ailleurs.
   *
   * Résolution PAR LOT : une requête par table pour toute la liste, quel qu'en
   * soit le nombre.
   */
  private async nommerProprietaires(liste: Portefeuille[]): Promise<Portefeuille[]> {
    if (liste.length === 0) return liste;

    const idsUser = [...new Set(liste.filter((p) => p.proprietaireType === 'USER').map((p) => String(p.proprietaireId)))];
    const idsDir = [...new Set(liste.filter((p) => p.proprietaireType === 'DIRECTION').map((p) => String(p.proprietaireId)))];

    const noms = new Map<string, string>();
    const charger = async (table: string, ids: string[], expression: string, prefixe: string) => {
      if (ids.length === 0) return;
      try {
        const rows: Array<{ id: string | number; label: string | null }> = await this.portefeuilleRepo.manager.query(
          `SELECT id, ${expression} AS label FROM dbo.${table} WHERE id IN (${ids.map((i) => Number(i)).join(',')})`,
        );
        for (const r of rows) if (r.label) noms.set(`${prefixe}#${r.id}`, String(r.label).trim());
      } catch {
        // Un libellé manquant ne doit pas priver l'écran de sa liste.
      }
    };

    // Un compte supprimé garde son nom : le portefeuille, lui, existe toujours.
    await charger('sec_user', idsUser, "prenom + ' ' + nom", 'USER');
    await charger('sec_direction', idsDir, 'libelle', 'DIRECTION');

    for (const p of liste) {
      const cle = `${p.proprietaireType}#${String(p.proprietaireId)}`;
      p.proprietaireLibelle = noms.get(cle) ?? null;
    }
    return liste;
  }

  /**
   * Liste restreinte à un ensemble d'ids (périmètre de l'utilisateur).
   * Ensemble vide → liste vide (l'utilisateur ne voit aucun portefeuille).
   */
  async findByIds(ids: string[], caisseId?: string): Promise<Portefeuille[]> {
    if (ids.length === 0) return [];
    const liste = await this.portefeuilleRepo.find({
      where: {
        id: In(ids) as any,
        ...(caisseId ? { caisseSourceId: caisseId } : {}),
      },
      order: { libelle: 'ASC' },
    });
    return this.nommerProprietaires(liste);
  }

  async findOne(id: string): Promise<Portefeuille> {
    const portefeuille = await this.portefeuilleRepo.findOne({ where: { id } });
    if (!portefeuille) throw new NotFoundException(`Portefeuille ${id} introuvable`);
    return portefeuille;
  }

  /** Solde courant du portefeuille = solde initial + mouvements (écritures comptables). */
  async getSolde(id: string): Promise<string> {
    return (await this.getSoldeDetail(id)).solde;
  }

  /**
   * Détail du solde : solde courant + budget alloué (soldeInitial), pour calculer
   * le taux d'utilisation du budget côté tableaux de bord.
   */
  async getSoldeDetail(
    id: string,
  ): Promise<{ solde: string; soldeInitial: string; budgetMensuel: string | null }> {
    const pf = await this.findOne(id);
    // Dans la devise du portefeuille : un portefeuille ayant reçu une autre
    // devise verrait sinon les montants additionnés sans conversion.
    const ledger = await this.ledgerService.calculateBalance(
      id,
      'PORTEFEUILLE',
      String(pf.deviseId),
    );
    const soldeInitial = Number(pf.soldeInitial || 0);
    const total = soldeInitial + Number(ledger || 0);
    return {
      solde: total.toFixed(4),
      soldeInitial: soldeInitial.toFixed(4),
      budgetMensuel: pf.budgetMensuel != null ? Number(pf.budgetMensuel).toFixed(4) : null,
    };
  }
}
