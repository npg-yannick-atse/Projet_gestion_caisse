import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Workbook } from 'exceljs';
import { Employe } from './entities/employe.entity';
import { TypeBenefice } from './entities/type-benefice.entity';
import { EmployeBenefice } from './entities/employe-benefice.entity';
import { Direction } from '@modules/security/entities/direction.entity';
import { ParametresService } from './parametres.service';

export interface EmployeQuery {
  search?: string;
  directionId?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}
import {
  CreateEmployeBeneficeDto,
  CreateEmployeDto,
  CreateTypeBeneficeDto,
  UpdateEmployeBeneficeDto,
  UpdateEmployeDto,
  UpdateTypeBeneficeDto,
} from './dto/employe.dto';

/** Code du type de bénéfice « Avance sur salaire » (règles spéciales). */
const CODE_AVANCE = 'AVANCE';

@Injectable()
export class EmployesService {
  constructor(
    @InjectRepository(Employe) private readonly employeRepo: Repository<Employe>,
    @InjectRepository(TypeBenefice) private readonly typeBeneficeRepo: Repository<TypeBenefice>,
    @InjectRepository(EmployeBenefice) private readonly beneficeRepo: Repository<EmployeBenefice>,
    private readonly parametres: ParametresService,
    private readonly dataSource: DataSource,
  ) {}

  /** Colonnes triables (whitelist : le tri se fait en base). */
  private static readonly SORT_MAP: Record<string, string> = {
    matricule: 'matricule',
    nom: 'nom',
    prenoms: 'prenoms',
    salaire: 'salaire',
  };

  /* ----------------------------------------------------------- Employés -- */

  /** Liste des employés actifs — recherche, filtre direction et tri exécutés EN BASE. */
  listEmployes(opts: EmployeQuery = {}): Promise<Employe[]> {
    const qb = this.employeRepo.createQueryBuilder('e').where('e.estActif = :actif', { actif: true });

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

    return qb.getMany();
  }

  /**
   * Import d'employés depuis un fichier Excel (base64). En-têtes reconnus (1re
   * ligne, insensible à la casse) : Matricule, Nom, Prénoms, Direction (code ou
   * libellé), Salaire. Matricule/Nom/Prénoms requis ; direction et salaire
   * optionnels. Renvoie un récapitulatif ligne par ligne.
   */
  async importEmployes(
    fileBase64: string,
    userId: string,
  ): Promise<{ crees: number; ignores: number; erreurs: string[] }> {
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

    let crees = 0;
    let ignores = 0;
    const erreurs: string[] = [];

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const matricule = cellStr(row, idx.matricule);
      const nom = cellStr(row, idx.nom);
      const prenoms = cellStr(row, idx.prenoms);
      if (!matricule && !nom && !prenoms) continue; // ligne vide

      if (!matricule || !nom || !prenoms) {
        erreurs.push(`Ligne ${r} : matricule, nom et prénoms sont requis.`);
        ignores++;
        continue;
      }

      const existing = await this.employeRepo.findOne({ where: { matricule }, withDeleted: true });
      if (existing) {
        erreurs.push(`Ligne ${r} : matricule ${matricule} déjà présent — ignoré.`);
        ignores++;
        continue;
      }

      let directionId: string | null = null;
      const dirRaw = cellStr(row, idx.direction);
      if (dirRaw) {
        const found = dirByKey.get(dirRaw.toLowerCase());
        if (!found) {
          erreurs.push(`Ligne ${r} : direction « ${dirRaw} » introuvable — employé créé sans direction.`);
        } else {
          directionId = found;
        }
      }

      let salaire: string | null = null;
      const salRaw = cellStr(row, idx.salaire).replace(/\s/g, '').replace(',', '.');
      if (salRaw && !Number.isNaN(Number(salRaw))) salaire = salRaw;

      await this.employeRepo.save(
        this.employeRepo.create({ matricule, nom, prenoms, directionId, salaire, estActif: true, createdById: userId as any }),
      );
      crees++;
    }

    return { crees, ignores, erreurs };
  }

  async findEmploye(id: string): Promise<Employe> {
    const e = await this.employeRepo.findOne({ where: { id } });
    if (!e) throw new NotFoundException(`Employé ${id} introuvable`);
    return e;
  }

  async createEmploye(dto: CreateEmployeDto, userId: string): Promise<Employe> {
    // On inclut les lignes soft-deleted : la contrainte UNIQUE en base les compte aussi.
    const existing = await this.employeRepo.findOne({ where: { matricule: dto.matricule }, withDeleted: true });
    if (existing) {
      throw new ConflictException(`Un employé avec le matricule ${dto.matricule} existe déjà`);
    }
    const e = this.employeRepo.create({
      matricule: dto.matricule,
      nom: dto.nom,
      prenoms: dto.prenoms,
      directionId: dto.directionId ?? null,
      salaire: dto.salaire ?? null,
      estActif: true,
      createdById: userId as any,
    });
    return this.employeRepo.save(e);
  }

  async updateEmploye(id: string, dto: UpdateEmployeDto, userId: string): Promise<Employe> {
    const e = await this.findEmploye(id);
    // Le matricule n'est pas modifiable (identifiant métier de l'employé).
    if (dto.nom !== undefined) e.nom = dto.nom;
    if (dto.prenoms !== undefined) e.prenoms = dto.prenoms;
    if (dto.directionId !== undefined) e.directionId = dto.directionId || null;
    if (dto.salaire !== undefined) e.salaire = dto.salaire || null;
    if (dto.estActif !== undefined) e.estActif = dto.estActif;
    e.updatedById = userId as any;
    return this.employeRepo.save(e);
  }

  async deleteEmploye(id: string, userId: string): Promise<void> {
    const e = await this.findEmploye(id);
    e.estActif = false;
    e.deletedAt = new Date();
    e.deletedById = userId as any;
    await this.employeRepo.save(e);
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

  async createTypeBenefice(dto: CreateTypeBeneficeDto, userId: string): Promise<TypeBenefice> {
    const existing = await this.typeBeneficeRepo.findOne({ where: { code: dto.code }, withDeleted: true });
    if (existing) {
      throw new ConflictException(`Un type de bénéfice avec le code ${dto.code} existe déjà`);
    }
    const t = this.typeBeneficeRepo.create({
      code: dto.code,
      libelle: dto.libelle,
      estActif: true,
      createdById: userId as any,
    });
    return this.typeBeneficeRepo.save(t);
  }

  async updateTypeBenefice(id: string, dto: UpdateTypeBeneficeDto, userId: string): Promise<TypeBenefice> {
    const t = await this.findTypeBenefice(id);
    // Le code n'est pas modifiable (référencé par les bénéfices existants).
    if (dto.libelle !== undefined) t.libelle = dto.libelle;
    if (dto.estActif !== undefined) t.estActif = dto.estActif;
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
   * Règles de l'avance sur salaire (paramétrables via app_parametre) :
   *  - autorisée seulement à partir du jour AVANCE_JOUR_MIN du mois en cours ;
   *  - montant plafonné à AVANCE_POURCENTAGE_MAX % du salaire de l'employé.
   */
  private async assertReglesAvance(employe: Employe, montant: string): Promise<void> {
    const jourMin = await this.parametres.getNumber('AVANCE_JOUR_MIN', 15);
    const jourActuel = new Date().getDate();
    if (jourActuel < jourMin) {
      throw new BadRequestException(
        `Une avance ne peut être accordée qu'à partir du ${jourMin} du mois.`,
      );
    }

    const pourcentMax = await this.parametres.getNumber('AVANCE_POURCENTAGE_MAX', 50);
    const salaire = Number(employe.salaire ?? 0);
    if (salaire <= 0) {
      throw new BadRequestException(
        "Le salaire de l'employé n'est pas renseigné : impossible de plafonner l'avance.",
      );
    }
    const plafond = (salaire * pourcentMax) / 100;
    if (Number(montant) > plafond) {
      throw new BadRequestException(
        `L'avance ne peut dépasser ${pourcentMax} % du salaire (plafond : ${plafond.toFixed(0)}).`,
      );
    }
  }

  async createBenefice(employeId: string, dto: CreateEmployeBeneficeDto, userId: string): Promise<EmployeBenefice> {
    const employe = await this.findEmploye(employeId);
    const type = await this.findTypeBenefice(dto.typeBeneficeId);

    if (dto.dateFin < dto.dateDebut) {
      throw new ConflictException('La date de fin doit être postérieure ou égale à la date de début.');
    }

    // Règles spéciales de l'AVANCE sur salaire (paramétrables).
    if (type.code === CODE_AVANCE) {
      await this.assertReglesAvance(employe, dto.montant);
    }

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
      montant: dto.montant,
      dateDebut: dto.dateDebut,
      dateFin: dto.dateFin,
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
