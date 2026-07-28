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
    const existing = await this.portefeuilleRepo.findOne({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException(`Un portefeuille avec le code ${dto.code} existe déjà`);
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
      const conflict = await this.portefeuilleRepo.findOne({ where: { code: dto.code } });
      if (conflict) throw new ConflictException(`Un portefeuille avec le code ${dto.code} existe déjà`);
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

  findAll(caisseId?: string, includeInactive = true): Promise<Portefeuille[]> {
    // Par défaut on retourne aussi les portefeuilles désactivés pour permettre
    // la réactivation depuis l'UI. La sélection "uniquement actifs" est filtrée côté front.
    return this.portefeuilleRepo.find({
      where: {
        ...(includeInactive ? {} : { estActif: true }),
        ...(caisseId ? { caisseSourceId: caisseId } : {}),
      },
      order: { libelle: 'ASC' },
    });
  }

  /**
   * Liste restreinte à un ensemble d'ids (périmètre de l'utilisateur).
   * Ensemble vide → liste vide (l'utilisateur ne voit aucun portefeuille).
   */
  findByIds(ids: string[], caisseId?: string): Promise<Portefeuille[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.portefeuilleRepo.find({
      where: {
        id: In(ids) as any,
        ...(caisseId ? { caisseSourceId: caisseId } : {}),
      },
      order: { libelle: 'ASC' },
    });
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
    const ledger = await this.ledgerService.calculateBalance(id, 'PORTEFEUILLE');
    const soldeInitial = Number(pf.soldeInitial || 0);
    const total = soldeInitial + Number(ledger || 0);
    return {
      solde: total.toFixed(4),
      soldeInitial: soldeInitial.toFixed(4),
      budgetMensuel: pf.budgetMensuel != null ? Number(pf.budgetMensuel).toFixed(4) : null,
    };
  }
}
