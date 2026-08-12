import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Workbook } from 'exceljs';
import { Employe } from './entities/employe.entity';
import { TypeBenefice } from './entities/type-benefice.entity';
import { EmployeBenefice } from './entities/employe-benefice.entity';
import { EmployeSalaire } from './entities/employe-salaire.entity';
import { Direction } from '@modules/security/entities/direction.entity';
import { User } from '@modules/security/entities/user.entity';
import { AuthorizationService } from '@modules/security/authorization.service';
import { ParametresService } from './parametres.service';

export interface EmployeQuery {
  search?: string;
  directionId?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  /** true = liste les employés DÉSACTIVÉS au lieu des actifs (pour les réactiver). */
  inactifs?: boolean;
}

export type ImportStatut = 'OK' | 'IGNORE' | 'ERREUR';

/** Une ligne du fichier d'import, analysée (sert à l'aperçu ET à l'import réel). */
export interface LigneImport {
  ligne: number;
  matricule: string;
  nom: string;
  prenoms: string;
  direction: string; // texte brut du fichier
  salaire: string; // valeur affichée (normalisée si OK)
  statut: ImportStatut; // OK = sera créé, IGNORE = doublon/déjà présent, ERREUR = requis manquant
  message?: string;
  directionId: string | null; // résolu — usage interne, non exposé dans l'aperçu
}
import {
  CreateEmployeBeneficeDto,
  CreateEmployeDto,
  CreateTypeBeneficeDto,
  UpdateEmployeBeneficeDto,
  UpdateEmployeDto,
  UpdateTypeBeneficeDto,
} from './dto/employe.dto';

@Injectable()
export class EmployesService {
  constructor(
    @InjectRepository(Employe) private readonly employeRepo: Repository<Employe>,
    @InjectRepository(TypeBenefice) private readonly typeBeneficeRepo: Repository<TypeBenefice>,
    @InjectRepository(EmployeBenefice) private readonly beneficeRepo: Repository<EmployeBenefice>,
    @InjectRepository(EmployeSalaire) private readonly salaireRepo: Repository<EmployeSalaire>,
    private readonly parametres: ParametresService,
    private readonly dataSource: DataSource,
    private readonly authz: AuthorizationService,
  ) {}

  /**
   * Employés « sélectionnables » pour un picker (ex. formulaire de crédit) :
   * l'utilisateur ne voit que les employés de SA direction (admins : tous).
   * Aucune donnée sensible ici — le salaire est retiré par le contrôleur.
   */
  async listSelectionnables(userId: string): Promise<Employe[]> {
    const qb = this.employeRepo.createQueryBuilder('e').where('e.estActif = :a', { a: true });
    if (!(await this.authz.isAdmin(userId))) {
      const u = await this.dataSource.getRepository(User).findOne({ where: { id: userId as any } });
      const dir = u?.directionId ? String(u.directionId) : null;
      if (!dir) return [];
      qb.andWhere('e.directionId = :dir', { dir });
    }
    return qb.orderBy('e.nom', 'ASC').addOrderBy('e.prenoms', 'ASC').getMany();
  }

  /** Colonnes triables (whitelist : le tri se fait en base). */
  private static readonly SORT_MAP: Record<string, string> = {
    matricule: 'matricule',
    nom: 'nom',
    prenoms: 'prenoms',
    salaire: 'salaire',
  };

  /* ----------------------------------------------------------- Employés -- */

  /**
   * Liste des employés actifs — recherche, filtre direction et tri exécutés EN BASE.
   * Chaque employé porte `nbBenefices` = nombre de bénéfices VALIDES (indicateur UI).
   */
  async listEmployes(opts: EmployeQuery = {}): Promise<Array<Employe & { nbBenefices: number }>> {
    // `withDeleted` est indispensable pour les désactivés : la désactivation
    // renseigne `deleted_at`, que TypeORM masque par défaut (@DeleteDateColumn).
    const qb = this.employeRepo
      .createQueryBuilder('e')
      .where('e.estActif = :actif', { actif: !opts.inactifs });
    if (opts.inactifs) qb.withDeleted();

    if (opts.search && opts.search.trim()) {
      const s = `%${opts.search.trim().replace(/[\\%_[]/g, (c) => `\\${c}`)}%`;
      qb.andWhere(
        '(e.nom LIKE :s ESCAPE :esc OR e.prenoms LIKE :s ESCAPE :esc OR e.matricule LIKE :s ESCAPE :esc)',
        { s, esc: '\\' },
      );
    }
    if (opts.directionId) {
      qb.andWhere('e.directionId = :dir', { dir: opts.directionId });
    }

    const col = EmployesService.SORT_MAP[opts.sortBy ?? ''];
    const dir: 'ASC' | 'DESC' = opts.sortDir === 'desc' ? 'DESC' : 'ASC';
    if (col) qb.orderBy(`e.${col}`, dir);
    else qb.orderBy('e.nom', 'ASC').addOrderBy('e.prenoms', 'ASC');

    const list = await qb.getMany();
    if (list.length === 0) return [];

    // Nombre de bénéfices VALIDES par employé (un seul appel groupé).
    const ids = list.map((e) => e.id);
    const rows: Array<{ eid: string; n: string }> = await this.beneficeRepo
      .createQueryBuilder('b')
      .select('b.employe_id', 'eid')
      .addSelect('COUNT(*)', 'n')
      .where('b.employe_id IN (:...ids)', { ids })
      .andWhere('b.est_valide = 1')
      .groupBy('b.employe_id')
      .getRawMany();
    const countMap = new Map<string, number>();
    for (const r of rows) countMap.set(String(r.eid), Number(r.n));

    return list.map((e) => ({ ...e, nbBenefices: countMap.get(String(e.id)) ?? 0 }));
  }

  /** Colonnes Excel de l'import/export (ordre + largeur). */
  private static readonly COLONNES_EXPORT = [
    { header: 'Matricule', key: 'matricule', width: 16 },
    { header: 'Nom', key: 'nom', width: 22 },
    { header: 'Prénoms', key: 'prenoms', width: 24 },
    { header: 'Direction', key: 'direction', width: 20 },
    { header: 'Salaire', key: 'salaire', width: 14 },
  ];

  /**
   * Analyse un fichier Excel d'import (base64) SANS rien enregistrer. En-têtes
   * reconnus (1re ligne, insensible casse/accents) : Matricule, Nom, Prénoms,
   * Direction (code ou libellé), Salaire. Matricule/Nom/Prénoms requis.
   * Renvoie chaque ligne avec un statut : OK (sera créé), IGNORE (doublon /
   * déjà présent), ERREUR (requis manquant). Sert à l'aperçu ET à l'import réel.
   */
  private async analyserImport(fileBase64: string): Promise<LigneImport[]> {
    let buffer: Buffer;
    try {
      buffer = Buffer.from(fileBase64.replace(/^data:.*;base64,/, ''), 'base64');
    } catch {
      throw new BadRequestException('Fichier illisible.');
    }
    const wb = new Workbook();
    try {
      await wb.xlsx.load(buffer as any);
    } catch {
      throw new BadRequestException('Fichier Excel invalide.');
    }
    const ws = wb.worksheets[0];
    if (!ws || ws.rowCount < 2) {
      throw new BadRequestException('Fichier vide (aucune ligne de données).');
    }

    // En-têtes → index de colonne.
    const headerRow = ws.getRow(1);
    const idx: Record<string, number> = {};
    headerRow.eachCell((cell, col) => {
      const key = String(cell.value ?? '').trim().toLowerCase().replace(/é/g, 'e');
      if (key.includes('matricule')) idx.matricule = col;
      else if (key.includes('prenom')) idx.prenoms = col;
      else if (key.includes('nom')) idx.nom = col;
      else if (key.includes('direction')) idx.direction = col;
      else if (key.includes('salaire')) idx.salaire = col;
    });
    if (!idx.matricule || !idx.nom || !idx.prenoms) {
      throw new BadRequestException(
        'Colonnes requises manquantes : Matricule, Nom, Prénoms (première ligne = en-têtes).',
      );
    }

    // Référentiel directions (code + libellé → id).
    const directions = await this.dataSource.getRepository(Direction).find();
    const dirByKey = new Map<string, string>();
    for (const d of directions) {
      dirByKey.set(d.code.trim().toLowerCase(), String(d.id));
      dirByKey.set(d.libelle.trim().toLowerCase(), String(d.id));
    }

    const cellStr = (row: any, col?: number) =>
      col ? String(row.getCell(col).value ?? '').trim() : '';

    const seen = new Set<string>();
    const lignes: LigneImport[] = [];

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const matricule = cellStr(row, idx.matricule);
      const nom = cellStr(row, idx.nom);
      const prenoms = cellStr(row, idx.prenoms);
      const direction = cellStr(row, idx.direction);
      const salaireBrut = cellStr(row, idx.salaire);
      if (!matricule && !nom && !prenoms) continue; // ligne vide

      const base = { ligne: r, matricule, nom, prenoms, direction };

      if (!matricule || !nom || !prenoms) {
        lignes.push({ ...base, salaire: salaireBrut, statut: 'ERREUR', message: 'Matricule, nom et prénoms sont requis.', directionId: null });
        continue;
      }
      if (seen.has(matricule.toLowerCase())) {
        lignes.push({ ...base, salaire: salaireBrut, statut: 'IGNORE', message: `Matricule ${matricule} en double dans le fichier.`, directionId: null });
        continue;
      }
      seen.add(matricule.toLowerCase());

      const existing = await this.employeRepo.findOne({ where: { matricule }, withDeleted: true });
      if (existing) {
        lignes.push({ ...base, salaire: salaireBrut, statut: 'IGNORE', message: `Matricule ${matricule} déjà présent.`, directionId: null });
        continue;
      }

      let directionId: string | null = null;
      let message: string | undefined;
      if (direction) {
        const found = dirByKey.get(direction.toLowerCase());
        if (!found) message = `Direction « ${direction} » introuvable — sera créé sans direction.`;
        else directionId = found;
      }

      let salaire = '';
      const salNorm = salaireBrut.replace(/\s/g, '').replace(',', '.');
      if (salNorm && !Number.isNaN(Number(salNorm))) salaire = salNorm;
      else if (salaireBrut) message = message ? `${message} Salaire ignoré (non numérique).` : 'Salaire ignoré (non numérique).';

      lignes.push({ ...base, salaire, statut: 'OK', message, directionId });
    }

    return lignes;
  }

  /** Aperçu (dry-run) de l'import : renvoie le détail ligne par ligne + un résumé, sans rien créer. */
  async apercuImport(fileBase64: string) {
    const lignes = await this.analyserImport(fileBase64);
    const resume = {
      total: lignes.length,
      aCreer: lignes.filter((l) => l.statut === 'OK').length,
      ignores: lignes.filter((l) => l.statut === 'IGNORE').length,
      erreurs: lignes.filter((l) => l.statut === 'ERREUR').length,
    };
    // On n'expose pas directionId (interne).
    const publiques = lignes.map(({ directionId: _directionId, ...l }) => l);
    return { lignes: publiques, resume };
  }

  /** Import réel : enregistre les lignes valides (statut OK). Renvoie un récapitulatif. */
  async importEmployes(
    fileBase64: string,
    userId: string,
  ): Promise<{ crees: number; ignores: number; erreurs: string[] }> {
    const lignes = await this.analyserImport(fileBase64);
    let crees = 0;
    let ignores = 0;
    const erreurs: string[] = [];

    for (const l of lignes) {
      if (l.statut === 'OK') {
        await this.employeRepo.save(
          this.employeRepo.create({
            matricule: l.matricule,
            nom: l.nom,
            prenoms: l.prenoms,
            directionId: l.directionId,
            salaire: l.salaire || null,
            estActif: true,
            createdById: userId as any,
          }),
        );
        crees++;
        if (l.message) erreurs.push(`Ligne ${l.ligne} : ${l.message}`);
      } else {
        ignores++;
        if (l.message) erreurs.push(`Ligne ${l.ligne} : ${l.message}`);
      }
    }

    return { crees, ignores, erreurs };
  }

  /** Export Excel des employés (mêmes colonnes que l'import). `masquerSalaire` vide la colonne Salaire. */
  async exportEmployes(opts: EmployeQuery = {}, masquerSalaire = false): Promise<Buffer> {
    const list = await this.listEmployes(opts);
    const directions = await this.dataSource.getRepository(Direction).find();
    const dirById = new Map(directions.map((d) => [String(d.id), d]));

    const wb = new Workbook();
    const ws = wb.addWorksheet('Employés');
    ws.columns = EmployesService.COLONNES_EXPORT;
    ws.getRow(1).font = { bold: true };

    for (const e of list) {
      const d = e.directionId ? dirById.get(String(e.directionId)) : undefined;
      ws.addRow({
        matricule: e.matricule,
        nom: e.nom,
        prenoms: e.prenoms,
        direction: d ? d.code : '',
        salaire: !masquerSalaire && e.salaire != null ? Number(e.salaire) : '',
      });
    }

    return Buffer.from((await wb.xlsx.writeBuffer()) as any);
  }

  /** Modèle Excel d'import : en-têtes + deux lignes d'exemple. */
  async modeleImport(): Promise<Buffer> {
    const wb = new Workbook();
    const ws = wb.addWorksheet('Employés');
    ws.columns = EmployesService.COLONNES_EXPORT;
    ws.getRow(1).font = { bold: true };
    ws.addRow({ matricule: 'MAT001', nom: 'Diallo', prenoms: 'Awa', direction: 'DG', salaire: 500000 });
    ws.addRow({ matricule: 'MAT002', nom: 'Traoré', prenoms: 'Ibrahim', direction: 'DAF', salaire: 350000 });
    return Buffer.from((await wb.xlsx.writeBuffer()) as any);
  }

  async findEmploye(id: string): Promise<Employe> {
    const e = await this.employeRepo.findOne({ where: { id } });
    if (e) return e;

    // « Introuvable » est trompeur pour un employé simplement DÉSACTIVÉ : il
    // existe toujours. Le cas se produit dès qu'un écran garde une référence
    // vers lui — un formulaire d'édition resté ouvert, par exemple (constaté en
    // test le 11/08/2026 sur l'employé TYAL, désactivé la veille).
    const desactive = await this.employeRepo.findOne({ where: { id }, withDeleted: true });
    if (desactive) {
      throw new ConflictException(
        `L'employé ${desactive.matricule} est désactivé. Réactivez-le avant de le modifier ` +
          '(case « Afficher les désactivés » dans la liste).',
      );
    }
    throw new NotFoundException(`Employé ${id} introuvable`);
  }

  async createEmploye(dto: CreateEmployeDto, userId: string): Promise<Employe> {
    // On inclut les lignes soft-deleted : la contrainte UNIQUE en base les compte aussi.
    const existing = await this.employeRepo.findOne({ where: { matricule: dto.matricule }, withDeleted: true });
    if (existing) {
      throw new ConflictException(
        existing.deletedAt
          ? `Le matricule ${dto.matricule} est encore occupé par un employé supprimé. Choisissez un autre matricule.`
          : `Un employé avec le matricule ${dto.matricule} existe déjà`,
      );
    }
    const e = this.employeRepo.create({
      matricule: dto.matricule,
      nom: dto.nom,
      prenoms: dto.prenoms,
      directionId: dto.directionId ?? null,
      salaire: dto.salaire ?? null,
      modeReglement: dto.modeReglement ?? 'ESPECES',
      banque: dto.banque || null,
      rib: dto.rib || null,
      portefeuilleSourceId: dto.portefeuilleSourceId || null,
      estActif: true,
      createdById: userId as any,
    });
    const cree = await this.employeRepo.save(e);

    // Première période de salaire : sans elle, l'employé n'aurait aucun salaire
    // opposable à un mois donné et la grille le verrait « non renseigné ».
    if (dto.salaire && Number(dto.salaire) > 0) {
      const now = new Date();
      await this.salaireRepo.save(
        this.salaireRepo.create({
          employeId: cree.id as any,
          montant: dto.salaire,
          dateDebut: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`,
          dateFin: null,
          motif: 'Salaire initial',
          createdById: userId as any,
        }),
      );
    }
    return cree;
  }

  async updateEmploye(id: string, dto: UpdateEmployeDto, userId: string): Promise<Employe> {
    const e = await this.findEmploye(id);
    // Le matricule n'est pas modifiable (identifiant métier de l'employé).
    if (dto.nom !== undefined) e.nom = dto.nom;
    if (dto.prenoms !== undefined) e.prenoms = dto.prenoms;
    if (dto.directionId !== undefined) e.directionId = dto.directionId || null;
    // Le salaire est historisé : modifier la fiche ouvre une nouvelle période à
    // compter d'aujourd'hui, plutôt que d'écraser silencieusement le passé.
    // Pour dater l'effet autrement, passer par `changerSalaire`.
    const salaireAChange =
      dto.salaire !== undefined && Number(dto.salaire || 0) !== Number(e.salaire || 0);
    if (dto.salaire !== undefined) e.salaire = dto.salaire || null;
    if (dto.modeReglement !== undefined) e.modeReglement = dto.modeReglement;
    if (dto.banque !== undefined) e.banque = dto.banque || null;
    if (dto.rib !== undefined) e.rib = dto.rib || null;
    if (dto.portefeuilleSourceId !== undefined) e.portefeuilleSourceId = dto.portefeuilleSourceId || null;
    if (dto.estActif !== undefined) e.estActif = dto.estActif;
    e.updatedById = userId as any;
    const sauve = await this.employeRepo.save(e);

    if (salaireAChange && dto.salaire && Number(dto.salaire) > 0) {
      const now = new Date();
      const debut = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
      const derniere = await this.salaireRepo.findOne({
        where: { employeId: id as any },
        order: { dateDebut: 'DESC', id: 'DESC' },
      });
      // Deux changements le même mois : on corrige la période en cours au lieu
      // d'en empiler une seconde qui commencerait le même jour.
      if (derniere && String(derniere.dateDebut) === debut) {
        derniere.montant = dto.salaire;
        derniere.updatedById = userId as any;
        await this.salaireRepo.save(derniere);
      } else {
        await this.changerSalaire(id, { montant: dto.salaire, dateDebut: debut, motif: 'Modification de la fiche' }, userId);
      }
    }
    return sauve;
  }

  async deleteEmploye(id: string, userId: string): Promise<void> {
    const e = await this.findEmploye(id);
    // Garde-fou : refus si l'employé a un crédit encore actif (non soldé).
    const r = await this.employeRepo.manager.query(
      `SELECT COUNT(*) n FROM dbo.fin_credit WHERE employe_id=@0 AND statut IN ('EN_ATTENTE','APPROUVEE','EN_COURS') AND deleted_at IS NULL`,
      [id],
    );
    const n = Number(r?.[0]?.n ?? 0);
    if (n > 0) {
      throw new ConflictException(
        `Impossible de désactiver cet employé : ${n} crédit(s) actif(s) (non soldé). Soldez-les d'abord.`,
      );
    }
    e.estActif = false;
    e.deletedAt = new Date();
    e.deletedById = userId as any;
    await this.employeRepo.save(e);
  }

  /**
   * Remet en service un employé désactivé.
   *
   * La désactivation ne supprime rien : la ligne reste en base et son matricule
   * demeure réservé par la contrainte UNIQUE. Sans réactivation, un employé
   * désactivé par erreur était définitivement inaccessible depuis l'application,
   * et son matricule inutilisable — constaté en test le 10/08/2026 sur `TYAL`.
   */
  async reactiverEmploye(id: string, userId: string): Promise<Employe> {
    const e = await this.employeRepo.findOne({ where: { id: id as any }, withDeleted: true });
    if (!e) throw new NotFoundException(`Employé ${id} introuvable`);
    if (e.estActif && !e.deletedAt) {
      throw new ConflictException('Cet employé est déjà actif.');
    }
    e.estActif = true;
    e.deletedAt = null;
    e.deletedById = null;
    e.updatedById = userId as any;
    return this.employeRepo.save(e);
  }

  /* ------------------------------------------------ Historique salaire -- */

  /** Premier jour du mois d'une période 'AAAA-MM'. */
  private static premierJour(periode: string): string {
    return `${periode}-01`;
  }

  /**
   * Salaire applicable à un MOIS donné, d'après l'historique.
   *
   * On retient la période dont `date_debut` est la plus récente parmi celles qui
   * ont commencé au plus tard ce mois-là, et qui n'était pas close avant lui.
   * Renvoie `null` si aucune période ne couvre le mois (employé entré après).
   *
   * C'est ce qui empêche une augmentation de réécrire le passé : régler un mois
   * de juillet resté impayé verse le salaire de juillet, pas celui d'aujourd'hui.
   */
  async salaireDuMois(employeId: string, periode: string): Promise<string | null> {
    const jour = EmployesService.premierJour(periode);
    const rows: Array<{ montant: string }> = await this.salaireRepo.manager.query(
      `SELECT TOP 1 montant FROM dbo.ref_employe_salaire
       WHERE employe_id = @0 AND deleted_at IS NULL
         AND date_debut <= @1
         AND (date_fin IS NULL OR date_fin >= @1)
       ORDER BY date_debut DESC, id DESC`,
      [employeId, jour],
    );
    return rows?.[0]?.montant != null ? String(rows[0].montant) : null;
  }

  /** Salaires applicables à un mois pour PLUSIEURS employés (un seul aller-retour). */
  async salairesDuMois(employeIds: string[], periode: string): Promise<Map<string, string>> {
    if (employeIds.length === 0) return new Map();
    const jour = EmployesService.premierJour(periode);
    // La sous-requête retient, par employé, la période la plus récente en vigueur
    // ce mois-là — équivalent ensembliste du TOP 1 de `salaireDuMois`.
    const rows: Array<{ employe_id: string; montant: string }> = await this.salaireRepo.manager.query(
      `SELECT s.employe_id, s.montant
       FROM dbo.ref_employe_salaire s
       JOIN (
         SELECT employe_id, MAX(date_debut) AS d
         FROM dbo.ref_employe_salaire
         WHERE deleted_at IS NULL AND date_debut <= @0 AND (date_fin IS NULL OR date_fin >= @0)
         GROUP BY employe_id
       ) m ON m.employe_id = s.employe_id AND m.d = s.date_debut
       WHERE s.deleted_at IS NULL AND s.date_debut <= @0 AND (s.date_fin IS NULL OR s.date_fin >= @0)`,
      [jour],
    );
    const voulus = new Set(employeIds.map(String));
    const out = new Map<string, string>();
    for (const r of rows ?? []) {
      const id = String(r.employe_id);
      if (voulus.has(id)) out.set(id, String(r.montant));
    }
    return out;
  }

  /** Historique complet, du plus récent au plus ancien. */
  async historiqueSalaire(employeId: string): Promise<EmployeSalaire[]> {
    return this.salaireRepo.find({
      where: { employeId: employeId as any },
      order: { dateDebut: 'DESC', id: 'DESC' },
    });
  }

  /**
   * Enregistre un nouveau salaire à partir d'une date : clôt la période en cours
   * la veille, et ouvre la nouvelle. `ref_employe.salaire` est mise à jour en
   * reflet du salaire courant, car exports et calculs de crédit la lisent.
   */
  async changerSalaire(
    employeId: string,
    input: { montant: string; dateDebut: string; motif?: string },
    userId: string,
  ): Promise<EmployeSalaire> {
    const employe = await this.findEmploye(employeId);
    const debut = input.dateDebut.slice(0, 10);

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(EmployeSalaire);
      const enCours = await repo.findOne({
        where: { employeId: employeId as any },
        order: { dateDebut: 'DESC', id: 'DESC' },
      });

      if (enCours) {
        if (debut <= String(enCours.dateDebut)) {
          throw new BadRequestException(
            `La date d'effet doit être postérieure au ${enCours.dateDebut}, début du salaire en cours.`,
          );
        }
        // Clôture la veille : les périodes se suivent sans trou ni chevauchement.
        const veille = new Date(`${debut}T00:00:00Z`);
        veille.setUTCDate(veille.getUTCDate() - 1);
        enCours.dateFin = veille.toISOString().slice(0, 10);
        enCours.updatedById = userId as any;
        await repo.save(enCours);
      }

      const cree = await repo.save(
        repo.create({
          employeId: employeId as any,
          montant: input.montant,
          dateDebut: debut,
          dateFin: null,
          motif: input.motif || null,
          createdById: userId as any,
        }),
      );

      // Reflet du salaire courant sur la fiche : de nombreux écrans la lisent.
      employe.salaire = input.montant;
      employe.updatedById = userId as any;
      await manager.getRepository(Employe).save(employe);

      return cree;
    });
  }

  /* -------------------------------------------------- Types de bénéfice -- */

  listTypesBenefice(opts: EmployeQuery = {}): Promise<TypeBenefice[]> {
    const qb = this.typeBeneficeRepo.createQueryBuilder('x').where('x.estActif = :a', { a: true });
    if (opts.search && opts.search.trim()) {
      const s = `%${opts.search.trim().replace(/[\\%_[]/g, (c) => `\\${c}`)}%`;
      qb.andWhere('(x.code LIKE :s ESCAPE :e OR x.libelle LIKE :s ESCAPE :e)', { s, e: '\\' });
    }
    const map: Record<string, string> = { code: 'code', libelle: 'libelle' };
    const col = map[opts.sortBy ?? ''];
    qb.orderBy(col ? `x.${col}` : 'x.libelle', col && opts.sortDir === 'desc' ? 'DESC' : 'ASC');
    return qb.getMany();
  }

  async findTypeBenefice(id: string): Promise<TypeBenefice> {
    const t = await this.typeBeneficeRepo.findOne({ where: { id } });
    if (!t) throw new NotFoundException(`Type de bénéfice ${id} introuvable`);
    return t;
  }

  /**
   * Vérifie la cohérence du « mode d'attribution » d'un type après application
   * du DTO : le mode FIXE exige un montant fixe, POURCENTAGE_SALAIRE un %.
   */
  private assertConfigTypeCoherente(t: TypeBenefice): void {
    if (t.modeMontant === 'FIXE' && (t.montantFixe == null || Number(t.montantFixe) <= 0)) {
      throw new BadRequestException('Le mode « Montant fixe » exige un montant fixe strictement positif.');
    }
    if (t.modeMontant === 'POURCENTAGE_SALAIRE' && (t.pourcentageSalaire == null || Number(t.pourcentageSalaire) <= 0)) {
      throw new BadRequestException('Le mode « % du salaire » exige un pourcentage strictement positif.');
    }
    if (t.plafondPourcentageSalaire != null && Number(t.plafondPourcentageSalaire) <= 0) {
      throw new BadRequestException('Le plafond en % du salaire doit être strictement positif.');
    }
  }

  /** Applique les champs de config présents dans le DTO sur l'entité type. */
  private appliquerConfigType(t: TypeBenefice, dto: CreateTypeBeneficeDto | UpdateTypeBeneficeDto): void {
    if (dto.modeMontant !== undefined) t.modeMontant = dto.modeMontant;
    if (dto.montantFixe !== undefined) t.montantFixe = dto.montantFixe || null;
    if (dto.pourcentageSalaire !== undefined) t.pourcentageSalaire = dto.pourcentageSalaire || null;
    if (dto.plafondPourcentageSalaire !== undefined) t.plafondPourcentageSalaire = dto.plafondPourcentageSalaire || null;
    if (dto.jourMinMois !== undefined) t.jourMinMois = dto.jourMinMois ?? null;
    if (dto.requiertPeriode !== undefined) t.requiertPeriode = dto.requiertPeriode;
    if (dto.recurrent !== undefined) t.recurrent = dto.recurrent;
  }

  async createTypeBenefice(dto: CreateTypeBeneficeDto, userId: string): Promise<TypeBenefice> {
    const existing = await this.typeBeneficeRepo.findOne({ where: { code: dto.code }, withDeleted: true });
    if (existing) {
      throw new ConflictException(`Un type de bénéfice avec le code ${dto.code} existe déjà`);
    }
    const t = this.typeBeneficeRepo.create({
      code: dto.code,
      libelle: dto.libelle,
      estActif: true,
      modeMontant: 'SAISI',
      requiertPeriode: true,
      recurrent: false,
      createdById: userId as any,
    });
    this.appliquerConfigType(t, dto);
    this.assertConfigTypeCoherente(t);
    return this.typeBeneficeRepo.save(t);
  }

  async updateTypeBenefice(id: string, dto: UpdateTypeBeneficeDto, userId: string): Promise<TypeBenefice> {
    const t = await this.findTypeBenefice(id);
    // Le code n'est pas modifiable (référencé par les bénéfices existants).
    if (dto.libelle !== undefined) t.libelle = dto.libelle;
    if (dto.estActif !== undefined) t.estActif = dto.estActif;
    this.appliquerConfigType(t, dto);
    this.assertConfigTypeCoherente(t);
    t.updatedById = userId as any;
    return this.typeBeneficeRepo.save(t);
  }

  async deleteTypeBenefice(id: string, userId: string): Promise<void> {
    const t = await this.findTypeBenefice(id);
    // Refus si le type est encore porté par un bénéfice valide : le désactiver
    // rendrait ces lignes illisibles (libellé introuvable) sans rien résoudre.
    const enUsage = await this.beneficeRepo.count({ where: { typeBeneficeId: id, estValide: true } });
    if (enUsage > 0) {
      throw new ConflictException(
        `Ce type est encore accordé à ${enUsage} employé(s) — désactivez d'abord ces bénéfices.`,
      );
    }
    t.estActif = false;
    t.deletedAt = new Date();
    t.deletedById = userId as any;
    await this.typeBeneficeRepo.save(t);
  }

  /* ---------------------------------------------- Bénéfices d'un employé -- */

  async listBenefices(employeId: string): Promise<EmployeBenefice[]> {
    await this.findEmploye(employeId); // 404 explicite si l'employé n'existe pas
    return this.beneficeRepo.find({
      where: { employeId },
      order: { estValide: 'DESC', dateDebut: 'DESC' },
    });
  }

  async findBenefice(id: string): Promise<EmployeBenefice> {
    const b = await this.beneficeRepo.findOne({ where: { id } });
    if (!b) throw new NotFoundException(`Bénéfice ${id} introuvable`);
    return b;
  }

  /**
   * Accorde un bénéfice à un employé.
   *
   * Règle : un seul bénéfice VALIDE par (employé, type). On la vérifie ici pour
   * renvoyer un message clair, mais le vrai garde-fou est l'index unique filtré
   * UQ_ref_emp_benef_valide (migration 0016) : il tient même en cas d'écritures
   * concurrentes, là où ce contrôle applicatif seul laisserait passer.
   */
  /**
   * Applique le « mode d'attribution » du type pour produire le montant et la
   * période définitifs d'un bénéfice, en validant les règles configurées :
   *  - mode du montant (saisi / fixe / % du salaire) ;
   *  - jour minimum du mois ;
   *  - plafond en % du salaire ;
   *  - période requise ou non (dates début/fin).
   * Généralise les anciennes règles « AVANCE » (jour 15, plafond 50 %) qui sont
   * désormais de simples valeurs de configuration portées par le type.
   */
  private resoudreBenefice(
    type: TypeBenefice,
    employe: Employe,
    dto: CreateEmployeBeneficeDto,
  ): { montant: string; dateDebut: string; dateFin: string } {
    const salaire = Number(employe.salaire ?? 0);

    // 1. Jour minimum du mois.
    if (type.jourMinMois != null) {
      const jourActuel = new Date().getDate();
      if (jourActuel < type.jourMinMois) {
        throw new BadRequestException(
          `Ce bénéfice ne peut être accordé qu'à partir du ${type.jourMinMois} du mois.`,
        );
      }
    }

    // 2. Montant selon le mode.
    let montant: string;
    if (type.modeMontant === 'FIXE') {
      if (type.montantFixe == null) {
        throw new BadRequestException('Type mal configuré : montant fixe manquant.');
      }
      montant = type.montantFixe;
    } else if (type.modeMontant === 'POURCENTAGE_SALAIRE') {
      if (type.pourcentageSalaire == null) {
        throw new BadRequestException('Type mal configuré : pourcentage du salaire manquant.');
      }
      if (salaire <= 0) {
        throw new BadRequestException(
          "Le salaire de l'employé n'est pas renseigné : impossible de calculer le montant.",
        );
      }
      montant = ((salaire * Number(type.pourcentageSalaire)) / 100).toFixed(4);
    } else {
      // SAISI
      if (!dto.montant || Number(dto.montant) <= 0) {
        throw new BadRequestException('Le montant est requis pour ce type de bénéfice.');
      }
      montant = dto.montant;
    }

    // 3. Plafond en % du salaire (tous modes).
    if (type.plafondPourcentageSalaire != null) {
      if (salaire <= 0) {
        throw new BadRequestException(
          "Le salaire de l'employé n'est pas renseigné : impossible d'appliquer le plafond.",
        );
      }
      const plafond = (salaire * Number(type.plafondPourcentageSalaire)) / 100;
      if (Number(montant) > plafond) {
        throw new BadRequestException(
          `Le montant ne peut dépasser ${Number(type.plafondPourcentageSalaire)} % du salaire (plafond : ${plafond.toFixed(0)}).`,
        );
      }
    }

    // 4. Période.
    let dateDebut: string;
    let dateFin: string;
    if (type.requiertPeriode) {
      if (!dto.dateDebut || !dto.dateFin) {
        throw new BadRequestException('Ce type de bénéfice requiert une période (dates de début et de fin).');
      }
      if (dto.dateFin < dto.dateDebut) {
        throw new ConflictException('La date de fin doit être postérieure ou égale à la date de début.');
      }
      dateDebut = dto.dateDebut;
      dateFin = dto.dateFin;
    } else {
      // Bénéfice ponctuel : on borne la période sur le jour d'attribution.
      const aujourdhui = new Date().toISOString().slice(0, 10);
      dateDebut = dto.dateDebut ?? aujourdhui;
      dateFin = dto.dateFin ?? dateDebut;
    }

    return { montant, dateDebut, dateFin };
  }

  async createBenefice(employeId: string, dto: CreateEmployeBeneficeDto, userId: string): Promise<EmployeBenefice> {
    const employe = await this.findEmploye(employeId);
    const type = await this.findTypeBenefice(dto.typeBeneficeId);

    // Applique le mode d'attribution du type : montant (saisi/fixe/%),
    // plafond, jour min, période. Produit les valeurs définitives.
    const { montant, dateDebut, dateFin } = this.resoudreBenefice(type, employe, dto);

    const dejaValide = await this.beneficeRepo.findOne({
      where: { employeId, typeBeneficeId: dto.typeBeneficeId, estValide: true },
    });
    if (dejaValide) {
      throw new ConflictException(
        `Un bénéfice « ${type.libelle} » est déjà valide pour cet employé — désactivez-le d'abord.`,
      );
    }

    const b = this.beneficeRepo.create({
      employeId,
      typeBeneficeId: dto.typeBeneficeId,
      montant,
      dateDebut,
      dateFin,
      estValide: true,
      commentaire: dto.commentaire ?? null,
      createdById: userId as any,
    });
    return this.saveBenefice(b, type.libelle);
  }

  async updateBenefice(id: string, dto: UpdateEmployeBeneficeDto, userId: string): Promise<EmployeBenefice> {
    const b = await this.findBenefice(id);

    if (dto.montant !== undefined) b.montant = dto.montant;
    if (dto.dateDebut !== undefined) b.dateDebut = dto.dateDebut;
    if (dto.dateFin !== undefined) b.dateFin = dto.dateFin;
    if (dto.commentaire !== undefined) b.commentaire = dto.commentaire || null;

    if (dto.estValide !== undefined && dto.estValide !== b.estValide) {
      if (dto.estValide) {
        // Réactivation : le type doit être libre, sinon on aurait deux valides.
        const autre = await this.beneficeRepo.findOne({
          where: { employeId: b.employeId, typeBeneficeId: b.typeBeneficeId, estValide: true },
        });
        if (autre) {
          const type = await this.findTypeBenefice(b.typeBeneficeId);
          throw new ConflictException(
            `Un bénéfice « ${type.libelle} » est déjà valide pour cet employé — désactivez-le d'abord.`,
          );
        }
      }
      b.estValide = dto.estValide;
    }

    if (b.dateFin < b.dateDebut) {
      throw new ConflictException('La date de fin doit être postérieure ou égale à la date de début.');
    }

    b.updatedById = userId as any;
    return this.saveBenefice(b);
  }

  /**
   * Enregistre en traduisant la violation de l'index unique filtré (erreur SQL
   * Server 2601/2627) en message métier — sans quoi l'utilisateur recevrait une
   * erreur 500 opaque en cas de course entre deux enregistrements simultanés.
   */
  private async saveBenefice(b: EmployeBenefice, libelleType?: string): Promise<EmployeBenefice> {
    try {
      return await this.beneficeRepo.save(b);
    } catch (err: any) {
      const num = err?.number ?? err?.driverError?.number;
      if (num === 2601 || num === 2627) {
        throw new ConflictException(
          `Un bénéfice ${libelleType ? `« ${libelleType} » ` : ''}est déjà valide pour cet employé — désactivez-le d'abord.`,
        );
      }
      throw err;
    }
  }

  async deleteBenefice(id: string, userId: string): Promise<void> {
    const b = await this.findBenefice(id);
    b.estValide = false;
    b.deletedAt = new Date();
    b.deletedById = userId as any;
    await this.beneficeRepo.save(b);
  }
}
