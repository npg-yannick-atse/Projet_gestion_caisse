import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Workbook } from 'exceljs';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { Operation, TypeOperation } from './entities/operation.entity';
import { EcritureComptable, TypeCompte } from './entities/ecriture-comptable.entity';

const TYPE_LABELS: Record<string, string> = {
  RECHARGE: 'Recharge',
  DECAISSEMENT: 'Décaissement',
  TRANSFERT: 'Transfert',
  AJUSTEMENT: 'Ajustement',
};

interface CreateOperationInput {
  typeOperation: TypeOperation;
  caisseId?: string;
  portefeuilleId?: string;
  montant: string;
  deviseId: string;
  userId: string;
  reference?: string;
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

  async findAllOperations(opts: {
    type?: TypeOperation;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
  } = {}): Promise<Operation[]> {
    const query = this.operationRepo.createQueryBuilder('operation').where('1=1');

    if (opts.type) {
      query.andWhere('operation.type_operation = :type', { type: opts.type });
    }

    if (opts.search) {
      // transaction_uuid (UNIQUEIDENTIFIER) et montant (DECIMAL) sont castés en NVARCHAR pour le LIKE.
      query.andWhere(
        '(operation.reference LIKE :q' +
          ' OR CAST(operation.transaction_uuid AS NVARCHAR(36)) LIKE :q' +
          ' OR CAST(operation.montant AS NVARCHAR(40)) LIKE :q)',
        { q: `%${opts.search}%` },
      );
    }

    if (opts.dateFrom) {
      query.andWhere('operation.date_operation >= :df', { df: new Date(opts.dateFrom) });
    }
    if (opts.dateTo) {
      const dt = new Date(opts.dateTo);
      dt.setHours(23, 59, 59, 999);
      query.andWhere('operation.date_operation <= :dt', { dt });
    }

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
  async exportOperationsXlsx(opts: {
    type?: TypeOperation;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    /** Restriction par rôle : si fournie, on ne sort que ces types (sauf si `type` est précisé). */
    allowedTypes?: string[];
  } = {}): Promise<Buffer> {
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

    if (opts.type) {
      qb.andWhere('op.type_operation = :type', { type: opts.type });
    } else if (opts.allowedTypes && opts.allowedTypes.length > 0) {
      qb.andWhere('op.type_operation IN (:...allowed)', { allowed: opts.allowedTypes });
    }
    if (opts.search) {
      qb.andWhere(
        '(op.reference LIKE :q' +
          ' OR CAST(op.transaction_uuid AS NVARCHAR(36)) LIKE :q' +
          ' OR CAST(op.montant AS NVARCHAR(40)) LIKE :q)',
        { q: `%${opts.search}%` },
      );
    }
    if (opts.dateFrom) qb.andWhere('op.date_operation >= :df', { df: new Date(opts.dateFrom) });
    if (opts.dateTo) {
      const dt = new Date(opts.dateTo);
      dt.setHours(23, 59, 59, 999);
      qb.andWhere('op.date_operation <= :dt', { dt });
    }
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
