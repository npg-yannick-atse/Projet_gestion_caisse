import {Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import { Workbook } from 'exceljs';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { Operation, TypeOperation } from './entities/operation.entity';
import { EcritureComptable, TypeCompte } from './entities/ecriture-comptable.entity';
import { CostCenter } from '@modules/referentiel/entities/cost-center.entity';
import { Caisse } from '@modules/financier/entities/caisse.entity';
import { Devise } from '@modules/financier/entities/devise.entity';
import { Portefeuille } from '@modules/financier/entities/portefeuille.entity';

const TYPE_LABELS: Record<string, string> = {
  RECHARGE: 'Recharge',
  DECAISSEMENT: 'Décaissement',
  TRANSFERT: 'Transfert',
  AJUSTEMENT: 'Ajustement',
  ENCAISSEMENT: 'Encaissement',
  CREDIT: 'Crédit',
};

interface CreateOperationInput {
  typeOperation: TypeOperation;
  caisseId?: string;
  portefeuilleId?: string;
  montant: string;
  deviseId: string;
  userId: string;
  reference?: string;
  clientNom?: string;
  clientNumero?: string;
  motif?: string;
  /**
   * Taux RÉELLEMENT appliqué, sa contre-valeur figée et la devise de celle-ci.
   * Les trois vont ensemble ou aucun (CK_trx_op_conversion_complete) : c'est
   * l'appelant qui les calcule, car lui seul sait si l'utilisateur a saisi un
   * taux ou si l'on retombe sur le cours du jour.
   */
  tauxApplique?: string | null;
  contreValeur?: string | null;
  deviseContreValeurId?: string | null;
}

interface CreateEcritureInput {
  compteId: string;
  typeCompte: TypeCompte;
  debit?: string;
  credit?: string;
  deviseId: string;
  planComptableId?: string;
  costCenterId?: string;
  referenceBonId?: string;
  referenceSousBonId?: string;
}

/**
 * Contexte de sécurité résolu par le contrôleur : ce que l'utilisateur a le droit
 * de voir. Appliqué en base sur la liste et l'export des opérations.
 */
export interface OperationScope {
  isAdmin: boolean;
  /** Types d'opérations autorisés par le rôle (undefined = tous). */
  allowedTypes?: string[];
  /** Caisses du périmètre (non-admin). */
  allowedCaisseIds?: string[];
  /** Portefeuilles du périmètre (non-admin). */
  allowedPortefeuilleIds?: string[];
  /** Utilisateur courant (voit toujours ses propres opérations). */
  currentUserId: string;
}

/** Filtres de recherche des opérations (dont filtres avancés + contexte sécurité). */
export interface OperationQueryOptions {
  type?: TypeOperation;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  /** Filtre avancé : un portefeuille précis. */
  portefeuilleId?: string;
  /** Filtre avancé : l'agent qui a effectué l'opération. */
  userId?: string;
  /** Filtre avancé : centre de coût imputé (via les écritures de charge). */
  costCenterId?: string;
  /** Nombre maximum de lignes renvoyées (TOP en base), pour les aperçus type
   *  « mouvements récents » qui n'affichent que les N premières opérations. */
  limit?: number;
  /** Contexte de sécurité (rôle + périmètre). */
  scope?: OperationScope;
}

@Injectable()
export class LedgerService {
  private static readonly logger = new Logger('LedgerService');

  constructor(
    @InjectRepository(Operation)
    private readonly operationRepo: Repository<Operation>,
    @InjectRepository(EcritureComptable)
    private readonly ecritureRepo: Repository<EcritureComptable>,
  ) {}

  private opRepo(manager?: EntityManager): Repository<Operation> {
    return manager ? manager.getRepository(Operation) : this.operationRepo;
  }

  private ecrRepo(manager?: EntityManager): Repository<EcritureComptable> {
    return manager ? manager.getRepository(EcritureComptable) : this.ecritureRepo;
  }

  /**
   * Crée une opération (mouvement de caisse/portefeuille)
   * et ses écritures comptables associées (partie double)
   */
  async createOperation(input: CreateOperationInput, manager?: EntityManager): Promise<Operation> {
    const montantNum = parseFloat(input.montant);

    if (montantNum <= 0) {
      throw new BadRequestException('Le montant doit être positif');
    }

    if (!input.caisseId && !input.portefeuilleId) {
      throw new BadRequestException('Une caisse ou un portefeuille doit être spécifié');
    }

    const transactionUuid = uuidv4();
    const repo = this.opRepo(manager);

    const operation = repo.create({
      transactionUuid,
      typeOperation: input.typeOperation,
      caisseId: input.caisseId ? (input.caisseId as any) : null,
      portefeuilleId: input.portefeuilleId ? (input.portefeuilleId as any) : null,
      montant: input.montant,
      deviseId: input.deviseId as any,
      dateOperation: new Date(),
      userId: input.userId as any,
      reference: input.reference ?? null,
      clientNom: input.clientNom ?? null,
      clientNumero: input.clientNumero ?? null,
      motif: input.motif ?? null,
      tauxApplique: input.tauxApplique ?? null,
      contreValeur: input.contreValeur ?? null,
      deviseContreValeurId: input.deviseContreValeurId ?? null,
    });

    return repo.save(operation);
  }

  /**
   * Crée une écriture comptable (partie double)
   * Immuable : aucune UPDATE ne doit être exécutée
   * 
   * Règle fondamentale : pour chaque transaction,
   * SUM(débits) = SUM(crédits)
   */
  async createEcriture(
    input: CreateEcritureInput,
    transactionUuid: string,
    manager?: EntityManager,
  ): Promise<EcritureComptable> {
    if (!input.debit && !input.credit) {
      throw new BadRequestException('Débit ou crédit doit être spécifié');
    }

    if (input.debit && input.credit) {
      throw new BadRequestException('Une écriture ne peut avoir que débit ou crédit, pas les deux');
    }

    const debit = input.debit ? input.debit : null;
    const credit = input.credit ? input.credit : null;
    const repo = this.ecrRepo(manager);

    const lastEcriture = await repo.findOne({
      where: { transactionUuid },
      order: { id: 'DESC' },
    });

    const hashPrecedent = lastEcriture?.hashIntegrite ?? null;

    // Un SEUL horodatage : il est haché ET stocké, pour que le hash soit
    // reproductible à partir des champs enregistrés (chaîne d'intégrité vérifiable).
    const now = new Date();
    const hashIntegrite = this.hashEcriture(
      {
        compteId: input.compteId,
        typeCompte: input.typeCompte,
        debit,
        credit,
        deviseId: input.deviseId,
        dateEcritureIso: now.toISOString(),
      },
      hashPrecedent,
    );

    const ecriture = this.ecritureRepo.create({
      transactionUuid,
      compteId: input.compteId as any,
      typeCompte: input.typeCompte,
      debit: debit ? (debit as any) : null,
      credit: credit ? (credit as any) : null,
      deviseId: input.deviseId as any,
      planComptableId: input.planComptableId ? (input.planComptableId as any) : null,
      costCenterId: input.costCenterId ? (input.costCenterId as any) : null,
      referenceBonId: input.referenceBonId ? (input.referenceBonId as any) : null,
      referenceSousBonId: input.referenceSousBonId ? (input.referenceSousBonId as any) : null,
      dateEcriture: now,
      hashIntegrite,
      hashPrecedent,
    });

    return repo.save(ecriture);
  }

  /**
   * Crée une paire d'écritures (débit + crédit) pour une transaction
   * Garantit l'équilibre comptable
   */
  async createPairedEcritures(
    compteDebit: CreateEcritureInput & { compteId: string; typeCompte: TypeCompte },
    compteCredit: CreateEcritureInput & { compteId: string; typeCompte: TypeCompte },
    montant: string,
    transactionUuid: string,
    manager?: EntityManager,
  ): Promise<[EcritureComptable, EcritureComptable]> {
    const debitEcriture = await this.createEcriture(
      { ...compteDebit, debit: montant, credit: undefined },
      transactionUuid,
      manager,
    );

    const creditEcriture = await this.createEcriture(
      { ...compteCredit, debit: undefined, credit: montant },
      transactionUuid,
      manager,
    );

    /*
     * UN REÇU POUR TOUTE ENTRÉE D'ARGENT EN CAISSE (migration 0075).
     *
     * Émis ici et nulle part ailleurs : les quatorze chemins qui écrivent le
     * grand livre passent tous par cette méthode. Aucun ne peut donc créditer
     * une caisse sans laisser de reçu — y compris ceux qu'on ajoutera demain.
     *
     * Le reçu suit L'ÉCRITURE, pas l'intention : c'est le crédit d'une caisse
     * qui le déclenche, quel que soit le geste métier à l'origine.
     */
    if (compteCredit.typeCompte === 'CAISSE') {
      await this.emettreRecu(
        {
          caisseId: String(compteCredit.compteId),
          deviseId: String(compteCredit.deviseId),
          montant,
          transactionUuid,
        },
        manager,
      );
    }

    return [debitEcriture, creditEcriture];
  }

  /**
   * Inscrit un reçu de réception. Numéro séquentiel, jamais réutilisé : deux
   * papiers différents ne doivent pas porter la même référence.
   *
   * Le type d'entrée et le motif sont relus de l'opération qui partage le même
   * `transaction_uuid`, quand elle existe — un reçu doit se lire seul, sans
   * qu'on ait à retrouver ce qui l'a provoqué.
   *
   * Best-effort : un reçu qui échoue ne doit pas faire échouer le mouvement
   * d'argent. Mieux vaut une entrée sans papier qu'un encaissement refusé.
   */
  private async emettreRecu(
    input: { caisseId: string; deviseId: string; montant: string; transactionUuid: string },
    manager?: EntityManager,
  ): Promise<void> {
    const runner = manager ?? this.ecritureRepo.manager;
    try {
      await runner.query(
        `DECLARE @suivant INT = (
           SELECT ISNULL(MAX(TRY_CONVERT(INT, SUBSTRING(numero, 5, 20))), 0) + 1
             FROM dbo.trx_recu_caisse
         );
         INSERT INTO dbo.trx_recu_caisse
           (numero, caisse_id, devise_id, montant, type_entree, transaction_uuid, motif, created_by_id)
         SELECT
           CONCAT('REC-', RIGHT(CONCAT('0000', @suivant), 4)),
           @0, @1, @2,
           o.type_operation, @3, o.motif, o.user_id
           FROM (SELECT TOP 1 type_operation, motif, user_id
                   FROM dbo.trx_operation WHERE transaction_uuid = @3) o`,
        [input.caisseId, input.deviseId, input.montant, input.transactionUuid],
      );
    } catch (e) {
      LedgerService.logger.warn(`Reçu de caisse non émis (${(e as Error).message}) — le mouvement reste enregistré.`);
    }
  }

  /**
   * Mouvement interne caisse ↔ portefeuille, en partie double.
   *
   * POINT DE PASSAGE UNIQUE : recharge manuelle, recharge d'extension de bon et
   * réajustement du budget mensuel passent tous par ici. Trois chemins écrivaient
   * auparavant le grand livre chacun de leur côté, avec des règles divergentes —
   * c'est ainsi que des débits en euros ont été portés sur une caisse qui n'avait
   * jamais reçu d'euros (−175 000 EUR sur CI01 en juin 2026).
   *
   * Deux règles y sont appliquées, sans échappatoire possible :
   *   1. la devise du mouvement est celle du PORTEFEUILLE — la caisse n'en
   *      déclare qu'une par défaut et peut en détenir plusieurs ;
   *   2. dans le sens caisse → portefeuille, la caisse doit RÉELLEMENT détenir
   *      cette devise, sinon son solde deviendrait négatif.
   *
   * Les contrôles de droits restent à la charge de l'appelant : un réajustement
   * automatique de budget n'a pas d'utilisateur à qui demander une permission.
   */
  async mouvementCaissePortefeuille(
    input: {
      caisseId: string;
      portefeuilleId: string;
      montant: string;
      sens: 'CAISSE_VERS_PORTEFEUILLE' | 'PORTEFEUILLE_VERS_CAISSE';
      typeOperation: TypeOperation;
      userId: string;
      reference?: string;
    },
    manager: EntityManager,
  ): Promise<{
    operation: Operation;
    ecritures: [EcritureComptable, EcritureComptable];
    deviseId: string;
  }> {
    const caisse = await manager.getRepository(Caisse).findOne({ where: { id: input.caisseId as any } });
    if (!caisse) throw new NotFoundException(`Caisse ${input.caisseId} introuvable`);
    const portefeuille = await manager
      .getRepository(Portefeuille)
      .findOne({ where: { id: input.portefeuilleId as any } });
    if (!portefeuille) throw new NotFoundException(`Portefeuille ${input.portefeuilleId} introuvable`);

    const deviseId = String(portefeuille.deviseId);
    const inverse = input.sens === 'PORTEFEUILLE_VERS_CAISSE';

    if (!inverse) {
      const dispo = Number(await this.calculateBalance(caisse.id, 'CAISSE', deviseId, manager));
      if (parseFloat(input.montant) > dispo) {
        const devise = await manager.getRepository(Devise).findOne({ where: { id: deviseId as any } });
        throw new BadRequestException(
          `La caisse ${caisse.code} ne détient pas assez de ${devise?.code ?? deviseId} ` +
            `(disponible : ${dispo.toFixed(4)}). Approvisionnez-la dans cette devise avant de recharger.`,
        );
      }
    }

    const operation = await this.createOperation(
      {
        typeOperation: input.typeOperation,
        caisseId: caisse.id,
        portefeuilleId: portefeuille.id,
        montant: input.montant,
        deviseId,
        userId: input.userId,
        reference: input.reference,
      },
      manager,
    );

    const caisseAcc = { compteId: caisse.id, typeCompte: 'CAISSE' as TypeCompte, deviseId };
    const ptfAcc = { compteId: portefeuille.id, typeCompte: 'PORTEFEUILLE' as TypeCompte, deviseId };
    const ecritures = await this.createPairedEcritures(
      inverse ? ptfAcc : caisseAcc,
      inverse ? caisseAcc : ptfAcc,
      input.montant,
      operation.transactionUuid,
      manager,
    );

    return { operation, ecritures, deviseId };
  }

  /** Vrai si le compte (caisse/portefeuille) porte au moins une écriture comptable. */
  async hasEcritures(compteId: string, typeCompte: TypeCompte): Promise<boolean> {
    const n = await this.ecritureRepo.count({
      where: { compteId: compteId as any, typeCompte },
    });
    return n > 0;
  }

  /**
   * Calcule le solde d'un compte à partir des écritures
   * Formule : SUM(crédits) - SUM(débits)
   */
  /**
   * Solde d'un compte, dans UNE devise donnée.
   *
   * ⚠️ Sans `deviseId`, toutes les devises sont additionnées — ce qui n'a aucun
   * sens dès qu'un compte en porte plusieurs (additionner des USD et des EUR).
   * Un compte n'a pas « un » solde mais un solde PAR DEVISE : passer `deviseId`
   * dès qu'on compare à un montant ou qu'on affiche une valeur.
   * Voir `calculateBalancesParDevise` pour la ventilation complète.
   */
  async calculateBalance(
    compteId: string,
    typeCompte: TypeCompte,
    deviseId?: string,
    // Indispensable pour contrôler un solde DANS la transaction en cours :
    // sans le manager, la lecture ignore les écritures non encore validées.
    manager?: EntityManager,
  ): Promise<string> {
    const qb = this.ecrRepo(manager)
      .createQueryBuilder('ecriture')
      .select('SUM(CAST(ecriture.credit AS DECIMAL(19,4)))', 'totalCredit')
      .addSelect('SUM(CAST(ecriture.debit AS DECIMAL(19,4)))', 'totalDebit')
      .where('ecriture.compte_id = :compteId', { compteId })
      .andWhere('ecriture.type_compte = :typeCompte', { typeCompte });
    if (deviseId) qb.andWhere('ecriture.devise_id = :deviseId', { deviseId });
    const result = await qb.getRawOne();

    const credit = parseFloat(result?.totalCredit || '0');
    const debit = parseFloat(result?.totalDebit || '0');
    const balance = credit - debit;

    return balance.toFixed(4);
  }

  /**
   * Ventilation du solde d'un compte, une ligne PAR DEVISE présente.
   *
   * C'est la vraie image d'une caisse : « 267 180 USD et −175 000 EUR », et non
   * un total de 92 180 qui ne représente rien.
   */
  async calculateBalancesParDevise(
    compteId: string,
    typeCompte: TypeCompte,
  ): Promise<Array<{ deviseId: string; code: string | null; solde: string }>> {
    const rows: Array<{ deviseId: string; code: string | null; totalCredit: string | null; totalDebit: string | null }> =
      await this.ecritureRepo
        .createQueryBuilder('e')
        .select('e.devise_id', 'deviseId')
        .addSelect('d.code', 'code')
        .addSelect('SUM(CAST(e.credit AS DECIMAL(19,4)))', 'totalCredit')
        .addSelect('SUM(CAST(e.debit AS DECIMAL(19,4)))', 'totalDebit')
        .leftJoin('fin_devise', 'd', 'd.id = e.devise_id')
        .where('e.compte_id = :compteId', { compteId })
        .andWhere('e.type_compte = :typeCompte', { typeCompte })
        .groupBy('e.devise_id')
        .addGroupBy('d.code')
        .getRawMany();

    return rows.map((r) => ({
      deviseId: String(r.deviseId),
      code: r.code ?? null,
      solde: (parseFloat(r.totalCredit || '0') - parseFloat(r.totalDebit || '0')).toFixed(4),
    }));
  }

  /**
   * Évolution du solde d'un compte jour par jour sur les `days` derniers jours.
   * Renvoie un point par jour (solde CUMULÉ en fin de journée), en partant du
   * solde d'ouverture (toutes les écritures antérieures à la fenêtre) puis en
   * ajoutant le delta de chaque jour. Les jours sans écriture reportent le solde.
   */
  async getSoldeTimeline(
    compteId: string,
    typeCompte: TypeCompte,
    days = 30,
  ): Promise<Array<{ date: string; solde: number }>> {
    const nbJours = Math.max(1, Math.min(180, days));
    const cutoff = new Date();
    cutoff.setUTCHours(0, 0, 0, 0);
    cutoff.setUTCDate(cutoff.getUTCDate() - (nbJours - 1));

    // Solde d'ouverture : tout ce qui précède la fenêtre.
    const opening = await this.ecritureRepo
      .createQueryBuilder('e')
      .select('SUM(CAST(e.credit AS DECIMAL(19,4)))', 'c')
      .addSelect('SUM(CAST(e.debit AS DECIMAL(19,4)))', 'd')
      .where('e.compte_id = :compteId', { compteId })
      .andWhere('e.type_compte = :typeCompte', { typeCompte })
      .andWhere('e.date_ecriture < :cutoff', { cutoff })
      .getRawOne();
    let running = parseFloat(opening?.c || '0') - parseFloat(opening?.d || '0');

    // Deltas quotidiens dans la fenêtre.
    const rows: Array<{ date: Date | string; c: string | null; d: string | null }> =
      await this.ecritureRepo
        .createQueryBuilder('e')
        .select('CAST(e.date_ecriture AS DATE)', 'date')
        .addSelect('SUM(CAST(e.credit AS DECIMAL(19,4)))', 'c')
        .addSelect('SUM(CAST(e.debit AS DECIMAL(19,4)))', 'd')
        .where('e.compte_id = :compteId', { compteId })
        .andWhere('e.type_compte = :typeCompte', { typeCompte })
        .andWhere('e.date_ecriture >= :cutoff', { cutoff })
        .groupBy('CAST(e.date_ecriture AS DATE)')
        .getRawMany();

    const deltaByDay = new Map<string, number>();
    for (const r of rows) {
      const key = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10);
      deltaByDay.set(key, parseFloat(r.c || '0') - parseFloat(r.d || '0'));
    }

    const series: Array<{ date: string; solde: number }> = [];
    for (let i = 0; i < nbJours; i++) {
      const d = new Date(cutoff);
      d.setUTCDate(d.getUTCDate() + i);
      const key = d.toISOString().slice(0, 10);
      running += deltaByDay.get(key) ?? 0;
      series.push({ date: key, solde: Number(running.toFixed(4)) });
    }
    return series;
  }

  /**
   * Flux quotidiens d'un compte sur `days` jours : entrées (Σ crédits) et sorties
   * (Σ débits) par jour, SANS cumul. Sert au graphe entrées/sorties (barres
   * divergentes). Pour une CAISSE : entrées = encaissements ; sorties = recharges
   * de portefeuilles, décaissements, crédits, transferts sortants.
   */
  async getFluxTimeline(
    compteId: string,
    typeCompte: TypeCompte,
    days = 30,
  ): Promise<Array<{ date: string; entrees: number; sorties: number }>> {
    const nbJours = Math.max(1, Math.min(180, days));
    const cutoff = new Date();
    cutoff.setUTCHours(0, 0, 0, 0);
    cutoff.setUTCDate(cutoff.getUTCDate() - (nbJours - 1));

    const rows: Array<{ date: Date | string; c: string | null; d: string | null }> =
      await this.ecritureRepo
        .createQueryBuilder('e')
        .select('CAST(e.date_ecriture AS DATE)', 'date')
        .addSelect('SUM(CAST(e.credit AS DECIMAL(19,4)))', 'c')
        .addSelect('SUM(CAST(e.debit AS DECIMAL(19,4)))', 'd')
        .where('e.compte_id = :compteId', { compteId })
        .andWhere('e.type_compte = :typeCompte', { typeCompte })
        .andWhere('e.date_ecriture >= :cutoff', { cutoff })
        .groupBy('CAST(e.date_ecriture AS DATE)')
        .getRawMany();

    const byDay = new Map<string, { entrees: number; sorties: number }>();
    for (const r of rows) {
      const key = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10);
      byDay.set(key, { entrees: parseFloat(r.c || '0'), sorties: parseFloat(r.d || '0') });
    }

    const series: Array<{ date: string; entrees: number; sorties: number }> = [];
    for (let i = 0; i < nbJours; i++) {
      const d = new Date(cutoff);
      d.setUTCDate(d.getUTCDate() + i);
      const key = d.toISOString().slice(0, 10);
      const v = byDay.get(key);
      series.push({
        date: key,
        entrees: Number((v?.entrees ?? 0).toFixed(4)),
        sorties: Number((v?.sorties ?? 0).toFixed(4)),
      });
    }
    return series;
  }

  /**
   * Garde budgétaire par centre de coût : refuse un décaissement qui ferait dépasser
   * le BUDGET MENSUEL du centre de coût (cumul des charges du mois en cours + `montant`
   * > budget). Sans budget défini sur le centre de coût, aucune limite n'est appliquée.
   *
   * À appeler AVANT de créer l'écriture du décaissement courant (sinon elle serait
   * comptée dans le cumul). Le cumul est calculé sur les écritures de CHARGE imputées
   * au centre de coût ; au sein d'une même transaction (batch « décaisser tout »),
   * les charges déjà créées via `manager` sont bien prises en compte.
   */
  async assertCostCenterMonthlyBudget(
    costCenterId: string | null | undefined,
    montant: string,
    manager?: EntityManager,
  ): Promise<void> {
    if (!costCenterId) return;
    const ccRepo = manager
      ? manager.getRepository(CostCenter)
      : this.ecritureRepo.manager.getRepository(CostCenter);
    const cc = await ccRepo.findOne({ where: { id: costCenterId as any } });
    if (!cc || cc.budgetMensuel == null) return; // pas de plafond → pas de limite

    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const row = await this.ecrRepo(manager)
      .createQueryBuilder('ecriture')
      .select('SUM(CAST(ecriture.credit AS DECIMAL(19,4)))', 'totalCredit')
      .addSelect('SUM(CAST(ecriture.debit AS DECIMAL(19,4)))', 'totalDebit')
      .where('ecriture.compte_id = :compteId', { compteId: costCenterId })
      .andWhere('ecriture.type_compte = :tc', { tc: 'CHARGE' })
      .andWhere('ecriture.date_ecriture >= :from', { from })
      .andWhere('ecriture.date_ecriture <= :to', { to })
      .getRawOne();

    const dejaDecaisse = parseFloat(row?.totalCredit || '0') - parseFloat(row?.totalDebit || '0');
    const plafond = Number(cc.budgetMensuel);
    if (dejaDecaisse + Number(montant) > plafond + 1e-6) {
      const reste = Math.max(0, plafond - dejaDecaisse);
      throw new BadRequestException(
        `Budget mensuel du centre de coût « ${cc.code} » dépassé : plafond ${plafond.toFixed(2)}, ` +
          `déjà décaissé ce mois ${dejaDecaisse.toFixed(2)}, reste disponible ${reste.toFixed(2)}. ` +
          `Décaissement de ${Number(montant).toFixed(2)} refusé.`,
      );
    }
  }

  /**
   * Vérifie que les écritures d'une transaction sont équilibrées
   */
  async verifyTransactionBalance(transactionUuid: string): Promise<boolean> {
    const result = await this.ecritureRepo
      .createQueryBuilder('ecriture')
      .select('SUM(CAST(ecriture.credit AS DECIMAL(19,4)))', 'totalCredit')
      .addSelect('SUM(CAST(ecriture.debit AS DECIMAL(19,4)))', 'totalDebit')
      .where('ecriture.transaction_uuid = :transactionUuid', { transactionUuid })
      .getRawOne();

    const credit = parseFloat(result?.totalCredit || '0');
    const debit = parseFloat(result?.totalDebit || '0');

    return Math.abs(credit - debit) < 0.01;
  }

  /**
   * Récupère toutes les écritures d'une transaction
   */
  async getTransactionEcritures(transactionUuid: string): Promise<EcritureComptable[]> {
    return this.ecritureRepo.find({
      where: { transactionUuid },
      order: { id: 'ASC' },
    });
  }

  /**
   * Hash SHA-256 CANONIQUE d'une écriture, chaîné au hash précédent.
   * Les montants sont normalisés en DECIMAL(19,4) et la date en ISO (ms), afin que
   * le hash soit REPRODUCTIBLE à l'identique depuis les champs stockés → la chaîne
   * d'intégrité est réellement vérifiable (cf. verifyEcrituresChain).
   */
  private hashEcriture(
    fields: {
      compteId: string;
      typeCompte: string;
      debit?: string | null;
      credit?: string | null;
      deviseId: string;
      dateEcritureIso: string;
    },
    hashPrecedent?: string | null,
  ): string {
    const num = (v?: string | null) => (v == null || v === '' ? '0.0000' : Number(v).toFixed(4));
    const json = JSON.stringify({
      compte_id: String(fields.compteId),
      type_compte: fields.typeCompte,
      debit: num(fields.debit),
      credit: num(fields.credit),
      devise_id: String(fields.deviseId),
      date_ecriture: fields.dateEcritureIso,
      hash_precedent: hashPrecedent || '',
    });
    return crypto.createHash('sha256').update(json).digest('hex');
  }

  /**
   * Date à partir de laquelle le hash est REPRODUCTIBLE depuis les champs
   * stockés (commit `7bf01c1`, 27/07/2026).
   *
   * Avant, `hashEcriture` hachait `new Date().toISOString()` — un horodatage
   * DIFFÉRENT de celui enregistré. Ces écritures ne peuvent donc pas être
   * recalculées : elles ne sont pas falsifiées, elles sont INVÉRIFIABLES.
   *
   * Les compter comme des falsifications donnait « 65 sur 137 » et un écran
   * d'intégrité rouge en permanence — qu'on finit par ne plus regarder, ce qui
   * ruine l'intérêt même du contrôle.
   */
  private static readonly HASH_REPRODUCTIBLE_DEPUIS = new Date('2026-07-27T00:00:00.000Z');

  /**
   * Vérifie la CHAÎNE D'INTÉGRITÉ des écritures : pour chaque écriture (triée par
   * transaction puis id), (a) recalcule le hash depuis les champs stockés et le
   * compare à hash_integrite, et (b) contrôle que hash_precedent chaîne bien
   * l'écriture précédente de la même transaction. Détecte toute falsification,
   * insertion, suppression ou réordonnancement.
   */
  async verifyEcrituresChain(
    transactionUuid?: string,
  ): Promise<{
    ok: boolean;
    total: number;
    /** Écritures dont le hash PEUT être recalculé (postérieures au correctif). */
    verifiees: number;
    invalides: Array<{ id: string; transactionUuid: string; raison: string }>;
    /** Antérieures au correctif : non reproductibles, donc ni valides ni fausses. */
    nonVerifiables: Array<{ id: string; transactionUuid: string }>;
  }> {
    const qb = this.ecritureRepo
      .createQueryBuilder('e')
      .orderBy('e.transaction_uuid', 'ASC')
      .addOrderBy('e.id', 'ASC');
    if (transactionUuid) qb.where('e.transaction_uuid = :u', { u: transactionUuid });
    const rows = await qb.getMany();

    const invalides: Array<{ id: string; transactionUuid: string; raison: string }> = [];
    const nonVerifiables: Array<{ id: string; transactionUuid: string }> = [];
    const lastHashByTx = new Map<string, string | null>();

    for (const e of rows) {
      const prev = lastHashByTx.get(e.transactionUuid) ?? null;
      // (b) Chaînage : hash_precedent doit pointer sur le hash de l'écriture d'avant.
      if ((e.hashPrecedent ?? null) !== (prev ?? null)) {
        invalides.push({ id: String(e.id), transactionUuid: e.transactionUuid, raison: 'chaînage rompu' });
      }
      // (a) Hash reproductible depuis les champs stockés.
      const attendu = this.hashEcriture(
        {
          compteId: e.compteId,
          typeCompte: e.typeCompte,
          debit: e.debit ?? null,
          credit: e.credit ?? null,
          deviseId: e.deviseId,
          dateEcritureIso: new Date(e.dateEcriture).toISOString(),
        },
        e.hashPrecedent ?? null,
      );
      if (attendu !== e.hashIntegrite) {
        // Antérieure au correctif : le hash n'est pas reproductible, et ce n'est
        // pas une falsification. On ne l'accuse pas de ce qu'elle n'a pas fait.
        if (new Date(e.dateEcriture).getTime() < LedgerService.HASH_REPRODUCTIBLE_DEPUIS.getTime()) {
          nonVerifiables.push({ id: String(e.id), transactionUuid: e.transactionUuid });
        } else {
          invalides.push({ id: String(e.id), transactionUuid: e.transactionUuid, raison: 'hash falsifié' });
        }
      }
      lastHashByTx.set(e.transactionUuid, e.hashIntegrite);
    }

    return {
      ok: invalides.length === 0,
      total: rows.length,
      verifiees: rows.length - nonVerifiables.length,
      invalides,
      nonVerifiables,
    };
  }

  /**
   * Récupère les opérations avec filtres composables, tous exécutés en BD (QueryBuilder) :
   * type, recherche (référence / UUID transaction / montant) et plage de dates.
   */
  /** Whitelist colonnes triables — sécurité ORDER BY. */
  private static readonly OPERATION_SORT_MAP: Record<string, string> = {
    dateOperation: 'operation.date_operation',
    typeOperation: 'operation.type_operation',
    montant: 'operation.montant',
    reference: 'operation.reference',
  };

  /**
   * Applique les filtres (type / recherche / dates / avancés) ET le contexte de
   * sécurité (rôle + périmètre strict) à une requête d'opérations. `alias` = alias
   * de la table `trx_operation` dans le QueryBuilder appelant.
   */
  private applyOperationFilters(
    qb: SelectQueryBuilder<any>,
    opts: OperationQueryOptions,
    alias: string,
  ): void {
    if (opts.type) qb.andWhere(`${alias}.type_operation = :type`, { type: opts.type });

    if (opts.search) {
      qb.andWhere(
        `(${alias}.reference LIKE :q` +
          ` OR CAST(${alias}.transaction_uuid AS NVARCHAR(36)) LIKE :q` +
          ` OR CAST(${alias}.montant AS NVARCHAR(40)) LIKE :q)`,
        { q: `%${opts.search}%` },
      );
    }
    if (opts.dateFrom) qb.andWhere(`${alias}.date_operation >= :df`, { df: new Date(opts.dateFrom) });
    if (opts.dateTo) {
      const dt = new Date(opts.dateTo);
      dt.setHours(23, 59, 59, 999);
      qb.andWhere(`${alias}.date_operation <= :dt`, { dt });
    }

    // Filtres avancés
    if (opts.portefeuilleId) qb.andWhere(`${alias}.portefeuille_id = :pfId`, { pfId: opts.portefeuilleId });
    if (opts.userId) qb.andWhere(`${alias}.user_id = :uId`, { uId: opts.userId });
    if (opts.costCenterId) {
      // Les opérations ne portent pas le centre de coût : on passe par les écritures
      // de CHARGE (une charge par décaissement, imputée au centre de coût).
      qb.andWhere(
        `${alias}.transaction_uuid IN (SELECT e.transaction_uuid FROM trx_ecriture_comptable e` +
          ` WHERE e.cost_center_id = :ccId AND e.type_compte = :charge)`,
        { ccId: opts.costCenterId, charge: 'CHARGE' },
      );
    }

    // Sécurité : rôle (types autorisés) + périmètre strict (caisse OU portefeuille
    // du périmètre, OU opération effectuée par l'utilisateur lui-même).
    const s = opts.scope;
    if (s && !s.isAdmin) {
      if (s.allowedTypes && s.allowedTypes.length > 0) {
        qb.andWhere(`${alias}.type_operation IN (:...allowedTypes)`, { allowedTypes: s.allowedTypes });
      }
      const clauses: string[] = [];
      const params: Record<string, unknown> = { me: s.currentUserId };
      if (s.allowedCaisseIds && s.allowedCaisseIds.length > 0) {
        clauses.push(`${alias}.caisse_id IN (:...permCaisses)`);
        params.permCaisses = s.allowedCaisseIds;
      }
      if (s.allowedPortefeuilleIds && s.allowedPortefeuilleIds.length > 0) {
        clauses.push(`${alias}.portefeuille_id IN (:...permPtfs)`);
        params.permPtfs = s.allowedPortefeuilleIds;
      }
      clauses.push(`${alias}.user_id = :me`);
      qb.andWhere('(' + clauses.join(' OR ') + ')', params);
    }
  }

  async findAllOperations(opts: OperationQueryOptions = {}): Promise<Operation[]> {
    const query = this.operationRepo.createQueryBuilder('operation').where('1=1');
    this.applyOperationFilters(query, opts, 'operation');

    const column = LedgerService.OPERATION_SORT_MAP[opts.sortBy ?? ''];
    const direction: 'ASC' | 'DESC' = opts.sortDir === 'asc' ? 'ASC' : 'DESC';
    if (column) {
      query.orderBy(column, direction);
    } else {
      query.orderBy('operation.date_operation', 'DESC');
    }
    if (opts.limit && opts.limit > 0) query.take(Math.min(opts.limit, 500));
    return this.nommerBons(await query.getMany());
  }

  /**
   * Rattache chaque décaissement au BON qu'il paie.
   *
   * La référence stockée est technique — « BC-26 » désigne le bon de caisse,
   * pas le bon. Un utilisateur qui voit passer « BC-26 » et « BC-27 » sur son
   * portefeuille n'a aucun moyen de savoir qu'il s'agit des deux sous-bons d'un
   * SEUL bon : il croit à un double décaissement. Constaté le 12/08/2026 sur
   * BON-0030.
   *
   * On expose donc le numéro du bon et celui du sous-bon, résolus par lot.
   */
  private async nommerBons(operations: Operation[]): Promise<Operation[]> {
    const parBc = new Map<string, Operation[]>();
    for (const op of operations) {
      const m = /^BC-(\d+)$/.exec(String(op.reference ?? ''));
      if (!m) continue;
      const liste = parBc.get(m[1]) ?? [];
      liste.push(op);
      parBc.set(m[1], liste);
    }
    if (parBc.size === 0) return operations;

    try {
      const ids = [...parBc.keys()].map(Number).join(',');
      const rows: Array<{ id: number; numero: string; numeroSousBon: number | null }> =
        await this.operationRepo.manager.query(
          `SELECT bc.id, b.numero, sb.numero_sous_bon AS numeroSousBon
             FROM dbo.trx_bon_caisse bc
             LEFT JOIN dbo.trx_bon b ON b.id = bc.bon_source_id
             LEFT JOIN dbo.trx_sous_bon sb ON sb.id = bc.sous_bon_source_id
            WHERE bc.id IN (${ids})`,
        );
      for (const r of rows) {
        for (const op of parBc.get(String(r.id)) ?? []) {
          op.bonNumero = r.numero ?? null;
          op.numeroSousBon = r.numeroSousBon ?? null;
        }
      }
    } catch {
      // Un libellé manquant ne doit pas priver l'écran de ses lignes.
    }
    return operations;
  }

  /**
   * Génère un classeur Excel (.xlsx) des opérations filtrées (type / recherche / dates),
   * avec les libellés résolus (caisse, portefeuille, devise, utilisateur).
   */
  async exportOperationsXlsx(opts: OperationQueryOptions = {}): Promise<Buffer> {
    const qb = this.operationRepo
      .createQueryBuilder('op')
      .leftJoin('fin_caisse', 'c', 'c.id = op.caisse_id')
      .leftJoin('fin_portefeuille', 'pf', 'pf.id = op.portefeuille_id')
      .leftJoin('fin_devise', 'd', 'd.id = op.devise_id')
      .leftJoin('sec_user', 'u', 'u.id = op.user_id')
      .where('1=1')
      .select('op.date_operation', 'dateOperation')
      .addSelect('op.type_operation', 'typeOperation')
      .addSelect('op.montant', 'montant')
      .addSelect('op.reference', 'reference')
      .addSelect('c.code', 'caisseCode')
      .addSelect('c.libelle', 'caisseLibelle')
      .addSelect('pf.code', 'pfCode')
      .addSelect('pf.libelle', 'pfLibelle')
      .addSelect('d.code', 'deviseCode')
      .addSelect('u.prenom', 'prenom')
      .addSelect('u.nom', 'nom');

    this.applyOperationFilters(qb, opts, 'op');
    const rows: any[] = await qb.orderBy('op.date_operation', 'DESC').getRawMany();

    const wb = new Workbook();
    const ws = wb.addWorksheet('Opérations');
    ws.columns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Heure', key: 'heure', width: 8 },
      { header: 'Type', key: 'type', width: 16 },
      { header: 'Caisse', key: 'caisse', width: 30 },
      { header: 'Portefeuille', key: 'portefeuille', width: 30 },
      { header: 'Référence', key: 'reference', width: 22 },
      { header: 'Montant', key: 'montant', width: 16 },
      { header: 'Devise', key: 'devise', width: 8 },
      { header: 'Par', key: 'par', width: 26 },
    ];
    ws.getRow(1).font = { bold: true };

    for (const r of rows) {
      const dt = new Date(r.dateOperation);
      ws.addRow({
        date: dt.toLocaleDateString('fr-FR'),
        heure: dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        type: TYPE_LABELS[r.typeOperation] ?? r.typeOperation,
        caisse: r.caisseCode ? `${r.caisseLibelle} (${r.caisseCode})` : '',
        portefeuille: r.pfCode ? `${r.pfLibelle} (${r.pfCode})` : '',
        reference: r.reference || '',
        montant: Number(r.montant ?? 0),
        devise: r.deviseCode || '',
        par: r.prenom ? `${r.prenom} ${r.nom}` : '',
      });
    }
    ws.getColumn('montant').numFmt = '#,##0';

    return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
  }

  /**
   * Récupère les opérations d'une caisse
   */
  async getCaisseOperations(caisseId: string, limit?: number): Promise<Operation[]> {
    return this.operationRepo.find({
      where: { caisseId: caisseId as any },
      order: { dateOperation: 'DESC' },
      ...(limit && limit > 0 ? { take: Math.min(limit, 500) } : {}),
    });
  }

  /**
   * Récupère les opérations d'un portefeuille
   */
  async getPortefeuilleOperations(portefeuilleId: string, limit?: number): Promise<Operation[]> {
    return this.operationRepo.find({
      where: { portefeuilleId: portefeuilleId as any },
      order: { dateOperation: 'DESC' },
      ...(limit && limit > 0 ? { take: Math.min(limit, 500) } : {}),
    });
  }
}
