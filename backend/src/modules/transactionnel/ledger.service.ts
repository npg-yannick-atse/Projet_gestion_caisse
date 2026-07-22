import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import { Workbook } from 'exceljs';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { Operation, TypeOperation } from './entities/operation.entity';
import { EcritureComptable, TypeCompte } from './entities/ecriture-comptable.entity';
import { CostCenter } from '@modules/referentiel/entities/cost-center.entity';

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
  /** Contexte de sécurité (rôle + périmètre). */
  scope?: OperationScope;
}

@Injectable()
export class LedgerService {
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

    const hashData = {
      compte_id: input.compteId,
      type_compte: input.typeCompte,
      debit: debit || '0',
      credit: credit || '0',
      devise_id: input.deviseId,
      date_ecriture: new Date().toISOString(),
    };

    const hashIntegrite = this.hashEcriture(hashData, hashPrecedent);

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
      dateEcriture: new Date(),
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

    return [debitEcriture, creditEcriture];
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
  async calculateBalance(compteId: string, typeCompte: TypeCompte): Promise<string> {
    const result = await this.ecritureRepo
      .createQueryBuilder('ecriture')
      .select('SUM(CAST(ecriture.credit AS DECIMAL(19,4)))', 'totalCredit')
      .addSelect('SUM(CAST(ecriture.debit AS DECIMAL(19,4)))', 'totalDebit')
      .where('ecriture.compte_id = :compteId', { compteId })
      .andWhere('ecriture.type_compte = :typeCompte', { typeCompte })
      .getRawOne();

    const credit = parseFloat(result?.totalCredit || '0');
    const debit = parseFloat(result?.totalDebit || '0');
    const balance = credit - debit;

    return balance.toFixed(4);
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
   * Génère le hash SHA-256 pour l'intégrité
   */
  private hashEcriture(data: any, hashPrecedent?: string | null): string {
    const json = JSON.stringify({
      ...data,
      hash_precedent: hashPrecedent || '',
    });
    return crypto.createHash('sha256').update(json).digest('hex');
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
    return query.getMany();
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
  async getCaisseOperations(caisseId: string): Promise<Operation[]> {
    return this.operationRepo.find({
      where: { caisseId: caisseId as any },
      order: { dateOperation: 'DESC' },
    });
  }

  /**
   * Récupère les opérations d'un portefeuille
   */
  async getPortefeuilleOperations(portefeuilleId: string): Promise<Operation[]> {
    return this.operationRepo.find({
      where: { portefeuilleId: portefeuilleId as any },
      order: { dateOperation: 'DESC' },
    });
  }
}
