import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Credit, ModeReplanification } from './entities/credit.entity';
import { Caisse } from './entities/caisse.entity';
import { Portefeuille } from './entities/portefeuille.entity';
import { Employe } from '@modules/referentiel/entities/employe.entity';
import { User } from '@modules/security/entities/user.entity';
import { LedgerService } from '@modules/transactionnel/ledger.service';
import { AuthorizationService } from '@modules/security/authorization.service';
import { Workbook } from 'exceljs';
import { Direction } from '@modules/security/entities/direction.entity';
import { Devise } from './entities/devise.entity';
import { CreditRemboursementService } from './credit-remboursement.service';
import { CreateCreditDto, UpdateCreditDto } from './dto/credit.dto';

@Injectable()
export class CreditService {
  constructor(
    @InjectRepository(Credit) private readonly creditRepo: Repository<Credit>,
    @InjectRepository(Employe) private readonly employeRepo: Repository<Employe>,
    private readonly dataSource: DataSource,
    private readonly ledger: LedgerService,
    private readonly authz: AuthorizationService,
    private readonly remboursements: CreditRemboursementService,
  ) {}

  /** Direction de l'utilisateur courant (pour la restriction validateur). */
  private async directionOf(userId: string): Promise<string | null> {
    const u = await this.dataSource.getRepository(User).findOne({ where: { id: userId as any } });
    return u?.directionId ? String(u.directionId) : null;
  }

  /** Un non-admin ne peut agir que sur un employé de SA direction. */
  private async assertMemeDirection(userId: string, employe: Employe): Promise<void> {
    if (await this.authz.isAdmin(userId)) return;
    const dir = await this.directionOf(userId);
    if (!dir || String(employe.directionId ?? '') !== dir) {
      throw new ForbiddenException("Cet employé n'est pas dans votre direction.");
    }
  }

  /**
   * Le crédit DÉCAISSE réellement de l'argent depuis la source : l'appelant doit
   * avoir cette caisse / ce portefeuille dans son périmètre (comme recharge,
   * encaissement et transfert). Les admins passent (périmètre null).
   */
  private async assertSourceInPerimeter(
    userId: string,
    sourceType: 'CAISSE' | 'PORTEFEUILLE',
    sourceId: string,
  ): Promise<void> {
    if (sourceType === 'CAISSE') {
      await this.authz.assertCaisseInPerimeter(userId, sourceId);
    } else {
      await this.authz.assertPortefeuilleInPerimeter(userId, sourceId);
    }
  }

  /** Whitelist des colonnes triables côté BD (défaut : created_at DESC). */
  private static readonly CREDIT_SORT_MAP: Record<string, string> = {
    dateDebut: 'c.date_debut',
    montant: 'c.montant',
    statut: 'c.statut',
    createdAt: 'c.created_at',
  };

  async list(
    userId: string,
    opts: {
      dateFrom?: string;
      dateTo?: string;
      sortBy?: string;
      sortDir?: 'asc' | 'desc';
      directionId?: string;
      statut?: string;
      search?: string;
    } = {},
  ): Promise<Credit[]> {
    const qb = this.creditRepo.createQueryBuilder('c');

    // Cloisonnement : admin = tous ; non-admin = crédits des employés de SA direction.
    if (!(await this.authz.isAdmin(userId))) {
      const dir = await this.directionOf(userId);
      if (!dir) return [];
      const employes = await this.employeRepo.find({ where: { directionId: dir as any } });
      const ids = employes.map((e) => e.id);
      if (ids.length === 0) return [];
      qb.andWhere('c.employe_id IN (:...ids)', { ids });
    }

    // Filtre par direction demandé par l'écran. Il s'applique EN PLUS du
    // cloisonnement ci-dessus : un non-admin ne peut pas s'en servir pour voir
    // une autre direction que la sienne, l'intersection reste vide.
    if (opts.directionId) {
      const employes = await this.employeRepo.find({ where: { directionId: opts.directionId as any } });
      const ids = employes.map((e) => e.id);
      if (ids.length === 0) return [];
      qb.andWhere('c.employe_id IN (:...dirIds)', { dirIds: ids });
    }

    // Filtre par date (sur la date de début du crédit ; date_debut est de type DATE).
    if (opts.dateFrom) qb.andWhere('c.date_debut >= :df', { df: opts.dateFrom });
    if (opts.dateTo) qb.andWhere('c.date_debut <= :dt', { dt: opts.dateTo });

    if (opts.statut && opts.statut !== 'TOUTES') {
      qb.andWhere('c.statut = :statut', { statut: opts.statut });
    }

    /**
     * Recherche : employé (nom, prénom, matricule), sa direction, et le compte
     * qui a financé le crédit.
     *
     * La source est POLYMORPHE (`source_type` + `source_id`) : d'où deux
     * jointures conditionnelles plutôt qu'une relation. Elles sont posées
     * seulement quand on cherche — inutile de les payer sur chaque listage.
     *
     * Ce filtrage vivait dans le navigateur, sur une liste rapatriée en entier.
     */
    const q = opts.search?.trim();
    if (q) {
      qb.leftJoin('ref_employe', 'e', 'e.id = c.employe_id')
        // `sec_direction`, pas `ref_direction` : les directions vivent dans le
        // module sécurité, pas dans le référentiel.
        .leftJoin('sec_direction', 'd', 'd.id = e.direction_id')
        .leftJoin('fin_caisse', 'ca', "c.source_type = 'CAISSE' AND ca.id = c.source_id")
        .leftJoin('fin_portefeuille', 'pf', "c.source_type = 'PORTEFEUILLE' AND pf.id = c.source_id")
        // `prenoms` au pluriel : c'est le nom réel de la colonne dans ref_employe.
        .andWhere(
          `(e.nom LIKE :q OR e.prenoms LIKE :q OR e.matricule LIKE :q
            OR d.code LIKE :q OR d.libelle LIKE :q
            OR ca.code LIKE :q OR ca.libelle LIKE :q
            OR pf.code LIKE :q OR pf.libelle LIKE :q)`,
          { q: `%${q}%` },
        );
    }

    const column = CreditService.CREDIT_SORT_MAP[opts.sortBy ?? ''];
    const direction: 'ASC' | 'DESC' = opts.sortDir === 'asc' ? 'ASC' : 'DESC';
    if (column) qb.orderBy(column, direction);
    else qb.orderBy('c.created_at', 'DESC');

    return qb.getMany();
  }

  async findOne(id: string): Promise<Credit> {
    const c = await this.creditRepo.findOne({ where: { id } });
    if (!c) throw new NotFoundException(`Crédit ${id} introuvable`);
    return c;
  }

  /** Valide l'existence de la source et renvoie sa devise (sans exiger l'ouverture). */
  private async resolveSourceDevise(
    sourceType: 'CAISSE' | 'PORTEFEUILLE',
    sourceId: string,
  ): Promise<{ deviseId: string }> {
    if (sourceType === 'CAISSE') {
      const caisse = await this.dataSource.getRepository(Caisse).findOne({ where: { id: sourceId } });
      if (!caisse) throw new NotFoundException(`Caisse ${sourceId} introuvable`);
      return { deviseId: String(caisse.deviseId) };
    }
    const ptf = await this.dataSource.getRepository(Portefeuille).findOne({ where: { id: sourceId } });
    if (!ptf) throw new NotFoundException(`Portefeuille ${sourceId} introuvable`);
    return { deviseId: String(ptf.deviseId) };
  }

  /** Au décaissement : une caisse source doit être OUVERTE (un portefeuille est toujours utilisable). */
  private async assertSourceOuverte(sourceType: 'CAISSE' | 'PORTEFEUILLE', sourceId: string): Promise<void> {
    if (sourceType !== 'CAISSE') return;
    const caisse = await this.dataSource.getRepository(Caisse).findOne({ where: { id: sourceId } });
    if (!caisse) throw new NotFoundException(`Caisse ${sourceId} introuvable`);
    if (caisse.statut !== 'OUVERTE') throw new BadRequestException(`La caisse ${caisse.code} est fermée`);
  }

  /** Refuse une nouvelle demande si l'employé a déjà une demande/crédit ACTIF. */
  private async assertAucunCreditActif(employeId: string): Promise<void> {
    const actif = await this.creditRepo
      .createQueryBuilder('c')
      .where('c.employe_id = :eid', { eid: employeId })
      .andWhere("c.statut IN ('EN_ATTENTE', 'APPROUVEE', 'EN_COURS')")
      .getOne();
    if (actif) {
      throw new ConflictException(
        "Cet employé a déjà une demande ou un crédit actif — traitez-le (ou soldez-le) d'abord.",
      );
    }
  }

  /**
   * Crée une DEMANDE de crédit (statut EN_ATTENTE). Aucun décaissement ici :
   * l'argent ne sort qu'à l'étape « traiter » (caissier), après approbation DAF.
   */
  async create(dto: CreateCreditDto, userId: string): Promise<Credit> {
    const employe = await this.employeRepo.findOne({ where: { id: dto.employeId } });
    if (!employe) throw new NotFoundException(`Employé ${dto.employeId} introuvable`);
    await this.assertMemeDirection(userId, employe);

    if (Number(dto.montant) <= 0) throw new BadRequestException('Le montant doit être positif.');
    await this.assertAucunCreditActif(dto.employeId);

    const { deviseId } = await this.resolveSourceDevise(dto.sourceType, dto.sourceId);

    try {
      const credit = this.creditRepo.create({
        employeId: dto.employeId,
        montant: dto.montant,
        nbMois: dto.nbMois,
        sourceType: dto.sourceType,
        sourceId: dto.sourceId,
        deviseId,
        statut: 'EN_ATTENTE',
        // date_debut définitive fixée au décaissement ; on met la date de demande en attendant.
        dateDebut: new Date().toISOString().slice(0, 10),
        commentaire: dto.commentaire ?? null,
        createdById: userId as any,
      });
      return await this.creditRepo.save(credit);
    } catch (err: any) {
      const num = err?.number ?? err?.driverError?.number;
      if (num === 2601 || num === 2627) {
        throw new ConflictException("Cet employé a déjà une demande ou un crédit actif.");
      }
      throw err;
    }
  }

  /**
   * Modifie une DEMANDE tant qu'elle est EN_ATTENTE (par le demandeur). Aucun impact
   * financier (rien n'est encore décaissé). Figée dès l'approbation.
   */
  async update(id: string, dto: UpdateCreditDto, userId: string): Promise<Credit> {
    const credit = await this.findOne(id);
    if (credit.statut !== 'EN_ATTENTE') {
      throw new BadRequestException('Seule une demande en attente est modifiable.');
    }
    if (!(await this.authz.isAdmin(userId)) && String(credit.createdById) !== String(userId)) {
      throw new ForbiddenException('Seul le demandeur peut modifier sa demande.');
    }

    if (dto.montant !== undefined) {
      if (Number(dto.montant) <= 0) throw new BadRequestException('Le montant doit être positif.');
      credit.montant = dto.montant;
    }
    if (dto.nbMois !== undefined) credit.nbMois = dto.nbMois;
    if (dto.commentaire !== undefined) credit.commentaire = dto.commentaire || null;
    credit.updatedById = userId as any;
    return this.creditRepo.save(credit);
  }

  /**
   * DAF approuve une demande (EN_ATTENTE → APPROUVEE). Pas d'auto-approbation.
   *
   * C'est ICI, et seulement ici, que se donne l'autorisation de prélever les
   * mensualités sur le salaire : une fois pour toute la durée du crédit. La
   * paie n'aura donc pas à être bloquée chaque mois par une validation, mais
   * en contrepartie on garde la trace de qui a autorisé et quand.
   */
  async approuver(
    id: string,
    userId: string,
    prelevementSalaire = false,
    modeReplanification: ModeReplanification = 'ALLONGER',
  ): Promise<Credit> {
    const credit = await this.findOne(id);
    if (credit.statut !== 'EN_ATTENTE') {
      throw new BadRequestException('Seule une demande en attente peut être approuvée.');
    }
    if (String(credit.createdById) === String(userId)) {
      throw new ForbiddenException('Vous ne pouvez pas approuver votre propre demande.');
    }
    credit.statut = 'APPROUVEE';
    credit.validateurId = userId as any;
    credit.dateValidation = new Date();
    if (prelevementSalaire) {
      credit.prelevementSalaire = true;
      credit.prelevementAutoriseParId = userId as any;
      credit.prelevementAutoriseLe = new Date();
    }
    // Le mode de replanification vaut aussi pour les versements encaissés au
    // guichet : il est donc enregistré même sans prélèvement sur salaire.
    credit.modeReplanification = modeReplanification;
    // Mensualité convenue, figée ici : elle sert de référence si la durée est
    // allongée plus tard, où montant ÷ nbMois ne vaudrait plus rien.
    credit.nbMoisInitial = credit.nbMois;
    credit.mensualiteReference = CreditRemboursementService.mensualite(credit.montant, credit.nbMois);
    credit.updatedById = userId as any;
    return this.creditRepo.save(credit);
  }

  /** DAF rejette une demande (EN_ATTENTE → REJETEE) avec motif. */
  async rejeter(id: string, userId: string, commentaire?: string): Promise<Credit> {
    const credit = await this.findOne(id);
    if (credit.statut !== 'EN_ATTENTE') {
      throw new BadRequestException('Seule une demande en attente peut être rejetée.');
    }
    credit.statut = 'REJETEE';
    credit.validateurId = userId as any;
    credit.dateValidation = new Date();
    credit.commentaireValidation = commentaire ?? null;
    credit.updatedById = userId as any;
    return this.creditRepo.save(credit);
  }

  /** Le demandeur annule sa propre demande (EN_ATTENTE → ANNULEE). */
  async annuler(id: string, userId: string): Promise<Credit> {
    const credit = await this.findOne(id);
    if (credit.statut !== 'EN_ATTENTE') {
      throw new BadRequestException('Seule une demande en attente peut être annulée.');
    }
    if (!(await this.authz.isAdmin(userId)) && String(credit.createdById) !== String(userId)) {
      throw new ForbiddenException('Seul le demandeur peut annuler sa demande.');
    }
    credit.statut = 'ANNULEE';
    credit.updatedById = userId as any;
    return this.creditRepo.save(credit);
  }

  /**
   * Le CAISSIER décaisse un crédit approuvé (APPROUVEE → EN_COURS) : c'est ICI que
   * l'argent sort réellement. Partie double DÉBIT source / CRÉDIT créance employé.
   */
  async traiter(id: string, userId: string): Promise<Credit> {
    const credit = await this.findOne(id);
    if (credit.statut !== 'APPROUVEE') {
      throw new BadRequestException('Seul un crédit approuvé peut être décaissé.');
    }
    await this.assertSourceInPerimeter(userId, credit.sourceType, credit.sourceId);
    await this.assertSourceOuverte(credit.sourceType, credit.sourceId);
    const employe = await this.employeRepo.findOne({ where: { id: credit.employeId } });

    return this.dataSource.transaction(async (manager) => {
      const op = await this.ledger.createOperation(
        {
          typeOperation: 'CREDIT',
          caisseId: credit.sourceType === 'CAISSE' ? credit.sourceId : undefined,
          portefeuilleId: credit.sourceType === 'PORTEFEUILLE' ? credit.sourceId : undefined,
          montant: credit.montant,
          deviseId: credit.deviseId,
          userId,
          reference: `Crédit employé ${employe?.matricule ?? credit.employeId}`,
        },
        manager,
      );

      // DÉBIT source (l'argent sort) / CRÉDIT créance employé.
      const sourceAcc = { compteId: credit.sourceId, typeCompte: credit.sourceType, deviseId: credit.deviseId };
      const creanceAcc = { compteId: credit.employeId, typeCompte: 'CREDIT_EMPLOYE' as const, deviseId: credit.deviseId };
      await this.ledger.createPairedEcritures(sourceAcc, creanceAcc, credit.montant, op.transactionUuid, manager);

      credit.statut = 'EN_COURS';
      credit.decaisseParId = userId as any;
      credit.dateDecaissement = new Date();
      credit.dateDebut = new Date().toISOString().slice(0, 10);
      credit.transactionUuid = op.transactionUuid;
      credit.updatedById = userId as any;
      return manager.getRepository(Credit).save(credit);
    });
  }

  private static readonly COLONNES_EXPORT = [
    { header: 'Matricule', key: 'matricule', width: 14 },
    { header: 'Employé', key: 'employe', width: 26 },
    { header: 'Direction', key: 'direction', width: 22 },
    { header: 'Montant', key: 'montant', width: 15 },
    { header: 'Devise', key: 'devise', width: 9 },
    { header: 'Durée (mois)', key: 'nbMois', width: 12 },
    { header: 'Mensualité', key: 'mensualite', width: 15 },
    { header: 'Début', key: 'debut', width: 12 },
    { header: 'Fin prévue', key: 'fin', width: 12 },
    { header: 'Mois versés', key: 'moisVerses', width: 12 },
    { header: 'Remboursé', key: 'rembourse', width: 15 },
    { header: 'Reste dû', key: 'restant', width: 15 },
    { header: 'Mois en retard', key: 'moisRetard', width: 14 },
    { header: 'Montant en retard', key: 'montantRetard', width: 17 },
    { header: 'Avancement', key: 'avancement', width: 12 },
    { header: 'Statut', key: 'statut', width: 13 },
    { header: 'Source', key: 'source', width: 14 },
  ];

  /**
   * Export Excel des crédits, avec la situation de remboursement de chacun.
   *
   * Le fichier respecte le périmètre de l'appelant et les filtres de l'écran :
   * ce que la liste montre est exactement ce que le fichier contient.
   */
  async exportExcel(
    userId: string,
    opts: {
      dateFrom?: string;
      dateTo?: string;
      sortBy?: string;
      sortDir?: 'asc' | 'desc';
      directionId?: string;
      enRetard?: boolean;
      statut?: string;
      search?: string;
    } = {},
  ): Promise<Buffer> {
    // `list` applique désormais le statut et la recherche EN BASE : le second
    // filtrage en mémoire qui se trouvait ici faisait doublon.
    const credits = await this.list(userId, opts);

    // « En retard » reste calculé : il dépend des versements réellement
    // encaissés, que seul l'échéancier sait rapprocher des dates d'échéance.
    const situations = await this.remboursements.situations(credits.map((c) => String(c.id)));
    const lignes = opts.enRetard
      ? credits.filter((c) => (situations[String(c.id)]?.echeancesEnRetard ?? 0) > 0)
      : credits;

    // Libellés résolus en une passe. `withDeleted` est indispensable ici : un
    // crédit ancien peut pointer sur une caisse ou un portefeuille depuis
    // supprimé, et l'export doit quand même le nommer plutôt qu'afficher un id.
    const employes = new Map(
      (await this.employeRepo.find({ withDeleted: true })).map((e) => [String(e.id), e]),
    );
    const directions = new Map(
      (await this.dataSource.getRepository(Direction).find({ withDeleted: true })).map((d) => [String(d.id), d]),
    );
    const devises = new Map(
      (await this.dataSource.getRepository(Devise).find()).map((d) => [String(d.id), d]),
    );
    const caisses = new Map(
      (await this.dataSource.getRepository(Caisse).find({ withDeleted: true })).map((c) => [String(c.id), c]),
    );
    const portefeuilles = new Map(
      (await this.dataSource.getRepository(Portefeuille).find({ withDeleted: true })).map((p) => [String(p.id), p]),
    );

    const wb = new Workbook();
    const ws = wb.addWorksheet('Crédits');
    ws.columns = CreditService.COLONNES_EXPORT;
    ws.getRow(1).font = { bold: true };

    for (const c of lignes) {
      const s = situations[String(c.id)];
      const emp = employes.get(String(c.employeId));
      const dir = emp?.directionId ? directions.get(String(emp.directionId)) : undefined;
      const fin = new Date(c.dateDebut);
      fin.setMonth(fin.getMonth() + c.nbMois);
      // Même libellé qu'à l'écran : le code de la caisse ou du portefeuille.
      const source =
        c.sourceType === 'CAISSE'
          ? caisses.get(String(c.sourceId))?.code
          : portefeuilles.get(String(c.sourceId))?.code;

      ws.addRow({
        matricule: emp?.matricule ?? '',
        employe: emp ? `${emp.nom} ${emp.prenoms}`.trim() : '',
        direction: dir ? dir.libelle : '',
        montant: Number(c.montant),
        devise: devises.get(String(c.deviseId))?.code ?? '',
        nbMois: c.nbMois,
        mensualite: Number(s?.mensualite ?? 0),
        debut: c.dateDebut,
        fin: fin.toISOString().slice(0, 10),
        moisVerses: `${s?.echeancesPayees ?? 0} / ${c.nbMois}`,
        rembourse: Number(s?.rembourse ?? 0),
        restant: Number(s?.restant ?? c.montant),
        moisRetard: s?.echeancesEnRetard ?? 0,
        montantRetard: Number(s?.montantEnRetard ?? 0),
        avancement: `${s?.pourcentage ?? 0} %`,
        statut: c.statut,
        source: source ?? `${c.sourceType} ${c.sourceId}`,
      });
    }

    // Les montants sont des nombres, pas du texte : le boss doit pouvoir les
    // additionner directement dans Excel.
    for (const key of ['montant', 'mensualite', 'rembourse', 'restant', 'montantRetard']) {
      ws.getColumn(key).numFmt = '# ##0.00';
    }

    return Buffer.from((await wb.xlsx.writeBuffer()) as any);
  }

  /** Solde (clôture) un crédit EN_COURS : libère l'employé pour un nouveau crédit. */
  async solder(id: string, userId: string): Promise<Credit> {
    const credit = await this.findOne(id);
    if (credit.statut !== 'EN_COURS') {
      throw new BadRequestException('Seul un crédit en cours peut être soldé.');
    }
    credit.statut = 'SOLDE';
    credit.updatedById = userId as any;
    return this.creditRepo.save(credit);
  }
}
