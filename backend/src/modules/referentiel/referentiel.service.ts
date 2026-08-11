import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Partenaire, TypePartenaire } from './entities/partenaire.entity';
import { CostCenter } from './entities/cost-center.entity';
import { TypeBon } from './entities/type-bon.entity';
import { NatureOperation } from './entities/nature-operation.entity';
import { NatureComptable } from './entities/nature-comptable.entity';
import { PlanComptable } from './entities/plan-comptable.entity';
import { Site } from './entities/site.entity';
import { Pays } from './entities/pays.entity';
import { Division } from './entities/division.entity';
import { Portefeuille } from '@modules/financier/entities/portefeuille.entity';
import { CreatePaysDto, CreateDivisionDto } from './dto/pays.dto';
import { CreatePartenaireDto } from './dto/create-partenaire.dto';
import { UpdatePartenaireDto } from './dto/update-partenaire.dto';
import { CreateCostCenterDto } from './dto/create-cost-center.dto';
import { UpdateCostCenterDto } from './dto/update-cost-center.dto';
import { CreateNatureOperationDto } from './dto/create-nature-operation.dto';
import { UpdateNatureOperationDto } from './dto/update-nature-operation.dto';
import { CreatePlanComptableDto } from './dto/create-plan-comptable.dto';

@Injectable()
export class ReferentielService {
  constructor(
    @InjectRepository(Partenaire)
    private readonly partenaireRepo: Repository<Partenaire>,
    @InjectRepository(CostCenter)
    private readonly costCenterRepo: Repository<CostCenter>,
    @InjectRepository(TypeBon)
    private readonly typeBonRepo: Repository<TypeBon>,
    @InjectRepository(NatureOperation)
    private readonly natureOperationRepo: Repository<NatureOperation>,
    @InjectRepository(NatureComptable)
    private readonly natureComptableRepo: Repository<NatureComptable>,
    @InjectRepository(PlanComptable)
    private readonly planComptableRepo: Repository<PlanComptable>,
    @InjectRepository(Site)
    private readonly siteRepo: Repository<Site>,
    @InjectRepository(Pays)
    private readonly paysRepo: Repository<Pays>,
    @InjectRepository(Division)
    private readonly divisionRepo: Repository<Division>,
  ) {}

  // ---------- Pays ----------
  listPays(opts: { search?: string; sortBy?: string; sortDir?: 'asc' | 'desc' } = {}): Promise<Pays[]> {
    return this.applyRefList(
      this.paysRepo.createQueryBuilder('x').where('x.estActif = :a', { a: true }),
      'x', opts, ['code', 'libelle'], { code: 'code', libelle: 'libelle' }, 'libelle',
    );
  }

  async createPays(dto: CreatePaysDto, userId: string): Promise<Pays> {
    // withDeleted : le code a une contrainte UNIQUE en base qui compte aussi les
    // lignes soft-deleted → un code déjà supprimé doit renvoyer 409, pas une erreur SQL brute.
    const existing = await this.paysRepo.findOne({ where: { code: dto.code }, withDeleted: true });
    if (existing) throw new ConflictException(`Un pays avec le code ${dto.code} existe déjà`);
    return this.paysRepo.save(
      this.paysRepo.create({ code: dto.code, libelle: dto.libelle, estActif: true, createdById: userId as any }),
    );
  }

  async deletePays(id: string, userId: string): Promise<void> {
    const p = await this.paysRepo.findOne({ where: { id } });
    if (!p) throw new NotFoundException(`Pays ${id} introuvable`);
    p.estActif = false;
    p.deletedAt = new Date();
    p.deletedById = userId as any;
    await this.paysRepo.save(p);
  }

  // ---------- Division ----------
  listDivisions(
    paysId?: string,
    opts: { search?: string; sortBy?: string; sortDir?: 'asc' | 'desc'; limit?: number } = {},
  ): Promise<Division[]> {
    const qb = this.divisionRepo.createQueryBuilder('x').where('x.estActif = :a', { a: true });
    if (paysId) qb.andWhere('x.paysId = :p', { p: paysId });
    return this.applyRefList(
      qb, 'x', opts, ['code', 'libelle'], { code: 'code', libelle: 'libelle' }, 'libelle',
    );
  }

  async createDivision(dto: CreateDivisionDto, userId: string): Promise<Division> {
    const pays = await this.paysRepo.findOne({ where: { id: dto.paysId } });
    if (!pays) throw new NotFoundException(`Pays ${dto.paysId} introuvable`);
    // Code optionnel : dérivé du libellé (slug MAJUSCULE), rendu unique par pays.
    // Colonne ref_division.code = 20 : on préserve jusqu'à 20 caractères (au lieu de
    // tronquer à 16), et on réserve la place du suffixe « _N » en cas de collision.
    const base =
      (dto.code?.trim() || dto.libelle.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_'))
        .replace(/^_+|_+$/g, '')
        .slice(0, 20) || 'DIV';
    let code = base;
    let n = 1;
    while (await this.divisionRepo.findOne({ where: { paysId: dto.paysId, code } })) {
      const suffix = `_${++n}`;
      code = `${base.slice(0, 20 - suffix.length)}${suffix}`;
      if (n > 99) throw new ConflictException('Trop de divisions similaires pour ce pays');
    }
    return this.divisionRepo.save(
      this.divisionRepo.create({
        code,
        libelle: dto.libelle.trim(),
        paysId: dto.paysId,
        estActif: true,
        createdById: userId as any,
      }),
    );
  }

  async deleteDivision(id: string, userId: string): Promise<void> {
    const d = await this.divisionRepo.findOne({ where: { id } });
    if (!d) throw new NotFoundException(`Division ${id} introuvable`);
    d.estActif = false;
    d.deletedAt = new Date();
    d.deletedById = userId as any;
    await this.divisionRepo.save(d);
  }

  listPartenaires(
    type?: TypePartenaire,
    opts: { search?: string; sortBy?: string; sortDir?: 'asc' | 'desc'; limit?: number } = {},
  ): Promise<Partenaire[]> {
    const qb = this.partenaireRepo.createQueryBuilder('x').where('x.estActif = :a', { a: true });
    if (type) qb.andWhere('x.typePartenaire = :t', { t: type });
    return this.applyRefList(
      qb, 'x', opts, ['raisonSociale', 'code', 'sigle', 'numeroClient', 'numeroFournisseur'],
      { code: 'code', raisonSociale: 'raisonSociale' }, 'raisonSociale',
    );
  }

  async findPartenaire(id: string): Promise<Partenaire> {
    const p = await this.partenaireRepo.findOne({ where: { id } });
    if (!p) throw new NotFoundException(`Partenaire ${id} introuvable`);
    return p;
  }

  async createPartenaire(dto: CreatePartenaireDto, userId: string): Promise<Partenaire> {
    // withDeleted : la contrainte UNIQUE compte les lignes soft-deleted, que
    // `findOne` masque par défaut — sinon l'écran reçoit une erreur SQL brute.
    const existing = await this.partenaireRepo.findOne({ where: { code: dto.code }, withDeleted: true });
    if (existing) {
      throw new ConflictException(
        existing.deletedAt
          ? `Le code ${dto.code} est encore occupé par un partenaire supprimé. Choisissez un autre code.`
          : `Un partenaire avec le code ${dto.code} existe déjà`,
      );
    }
    const p = this.partenaireRepo.create({
      code: dto.code,
      raisonSociale: dto.raisonSociale,
      typePartenaire: dto.typePartenaire,
      sigle: dto.sigle ?? null,
      numeroClient: dto.numeroClient ?? null,
      numeroFournisseur: dto.numeroFournisseur ?? null,
      adresse: dto.adresse ?? null,
      telephone: dto.telephone ?? null,
      email: dto.email ?? null,
      pays: dto.pays ?? null,
      ville: dto.ville ?? null,
      estActif: true,
      createdById: userId as any,
    });
    return this.partenaireRepo.save(p);
  }

  async updatePartenaire(id: string, dto: UpdatePartenaireDto, userId: string): Promise<Partenaire> {
    const p = await this.findPartenaire(id);
    if (dto.code && dto.code !== p.code) {
      const dup = await this.partenaireRepo.findOne({ where: { code: dto.code }, withDeleted: true });
      if (dup && String(dup.id) !== String(p.id)) {
        throw new ConflictException(
          dup.deletedAt
            ? `Le code ${dto.code} est encore occupé par un partenaire supprimé. Choisissez un autre code.`
            : `Un partenaire avec le code ${dto.code} existe déjà`,
        );
      }
      p.code = dto.code;
    }
    if (dto.raisonSociale !== undefined) p.raisonSociale = dto.raisonSociale;
    if (dto.typePartenaire !== undefined) p.typePartenaire = dto.typePartenaire;
    if (dto.sigle !== undefined) p.sigle = dto.sigle || null;
    if (dto.numeroClient !== undefined) p.numeroClient = dto.numeroClient || null;
    if (dto.numeroFournisseur !== undefined) p.numeroFournisseur = dto.numeroFournisseur || null;
    if (dto.adresse !== undefined) p.adresse = dto.adresse || null;
    if (dto.telephone !== undefined) p.telephone = dto.telephone || null;
    if (dto.email !== undefined) p.email = dto.email || null;
    if (dto.pays !== undefined) p.pays = dto.pays || null;
    if (dto.ville !== undefined) p.ville = dto.ville || null;
    p.updatedById = userId as any;
    return this.partenaireRepo.save(p);
  }

  async deletePartenaire(id: string, userId: string): Promise<void> {
    const p = await this.findPartenaire(id);
    p.estActif = false;
    p.deletedAt = new Date();
    p.deletedById = userId as any;
    await this.partenaireRepo.save(p);
  }

  /**
   * Applique recherche (LIKE sur `searchCols`) et tri (whitelist `sortMap`) EN BASE
   * à un QueryBuilder déjà filtré sur estActif. `opts.search`/`sortBy`/`sortDir`.
   */
  private applyRefList(
    qb: any,
    alias: string,
    opts: { search?: string; sortBy?: string; sortDir?: 'asc' | 'desc'; limit?: number },
    searchCols: string[],
    sortMap: Record<string, string>,
    defaultCol: string,
  ) {
    if (opts.search && opts.search.trim()) {
      const s = `%${opts.search.trim().replace(/[\\%_[]/g, (c) => `\\${c}`)}%`;
      const cond = searchCols.map((c) => `${alias}.${c} LIKE :s ESCAPE :e`).join(' OR ');
      qb.andWhere(`(${cond})`, { s, e: '\\' });
    }
    const col = sortMap[opts.sortBy ?? ''];
    const dir: 'ASC' | 'DESC' = opts.sortDir === 'desc' ? 'DESC' : 'ASC';
    qb.orderBy(col ? `${alias}.${col}` : `${alias}.${defaultCol}`, col ? dir : 'ASC');
    if (opts.limit && opts.limit > 0) qb.take(Math.min(opts.limit, 500));
    return qb.getMany();
  }

  listCostCenters(opts: { search?: string; sortBy?: string; sortDir?: 'asc' | 'desc' } = {}): Promise<CostCenter[]> {
    return this.applyRefList(
      this.costCenterRepo.createQueryBuilder('x').where('x.estActif = :a', { a: true }),
      'x', opts, ['code', 'libelle'], { code: 'code', libelle: 'libelle' }, 'libelle',
    );
  }

  async findCostCenter(id: string): Promise<CostCenter> {
    const cc = await this.costCenterRepo.findOne({ where: { id } });
    if (!cc) throw new NotFoundException(`Centre de coût ${id} introuvable`);
    return cc;
  }

  async createCostCenter(dto: CreateCostCenterDto, userId: string): Promise<CostCenter> {
    // withDeleted : voir createPartenaire — un code supprimé reste occupé en base.
    const existing = await this.costCenterRepo.findOne({ where: { code: dto.code }, withDeleted: true });
    if (existing) {
      throw new ConflictException(
        existing.deletedAt
          ? `Le code ${dto.code} est encore occupé par un centre de coût supprimé. Choisissez un autre code.`
          : `Un centre de coût avec le code ${dto.code} existe déjà`,
      );
    }
    const cc = this.costCenterRepo.create({
      code: dto.code,
      libelle: dto.libelle,
      directionId: dto.directionId ?? null,
      budgetMensuel: dto.budgetMensuel ?? null,
      estActif: true,
      createdById: userId as any,
    });
    const saved = await this.costCenterRepo.save(cc);
    await this.propagerBudgetAuxPortefeuilles(saved);
    return saved;
  }

  async updateCostCenter(id: string, dto: UpdateCostCenterDto, userId: string): Promise<CostCenter> {
    const cc = await this.findCostCenter(id);
    // Le code n'est pas modifiable (référencé ailleurs) : on n'édite que ces champs.
    if (dto.libelle !== undefined) cc.libelle = dto.libelle;
    if (dto.directionId !== undefined) cc.directionId = dto.directionId || null;
    if (dto.budgetMensuel !== undefined) cc.budgetMensuel = dto.budgetMensuel || null;
    cc.updatedById = userId as any;
    const saved = await this.costCenterRepo.save(cc);
    await this.propagerBudgetAuxPortefeuilles(saved);
    return saved;
  }

  /**
   * Répercute le budget mensuel d'un centre de coût sur les portefeuilles de sa
   * direction (règle : une direction = un centre de coût, et le portefeuille de
   * direction hérite du budget du CC, non modifiable).
   */
  private async propagerBudgetAuxPortefeuilles(cc: CostCenter): Promise<void> {
    if (!cc.directionId) return;
    await this.costCenterRepo.manager.getRepository(Portefeuille).update(
      { proprietaireType: 'DIRECTION' as any, proprietaireId: cc.directionId as any },
      { budgetMensuel: cc.budgetMensuel ?? null },
    );
  }

  async deleteCostCenter(id: string, userId: string): Promise<void> {
    const cc = await this.findCostCenter(id);
    // Garde-fou : refus si le centre de coût est encore rattaché à des éléments
    // actifs (utilisateurs, autorisations, natures comptables / d'opération).
    const m = this.costCenterRepo.manager;
    const checks: Array<[string, string]> = [
      ['utilisateur(s) (centre par défaut)', `SELECT COUNT(*) n FROM dbo.sec_user WHERE cost_center_id=@0 AND est_actif=1`],
      ['autorisation(s) utilisateur', `SELECT COUNT(*) n FROM dbo.sec_user_cost_center WHERE cost_center_id=@0`],
      ['nature(s) comptable(s)', `SELECT COUNT(*) n FROM dbo.ref_nature_comptable WHERE cost_center_id=@0 AND est_actif=1`],
      ["nature(s) d'opération", `SELECT COUNT(*) n FROM dbo.ref_nature_operation WHERE cost_center_id=@0 AND est_actif=1`],
    ];
    const bloquants: string[] = [];
    for (const [label, sql] of checks) {
      const r = await m.query(sql, [id]);
      const n = Number(r?.[0]?.n ?? 0);
      if (n > 0) bloquants.push(`${n} ${label}`);
    }
    if (bloquants.length) {
      throw new ConflictException(
        `Impossible de désactiver ce centre de coût : encore rattaché à ${bloquants.join(', ')}. Détachez-les d'abord.`,
      );
    }
    cc.estActif = false;
    cc.deletedAt = new Date();
    cc.deletedById = userId as any;
    await this.costCenterRepo.save(cc);
  }

  listTypeBons(): Promise<TypeBon[]> {
    return this.typeBonRepo.find({ where: { estActif: true }, order: { libelle: 'ASC' } });
  }

  listNaturesOperation(opts: { search?: string; sortBy?: string; sortDir?: 'asc' | 'desc'; limit?: number } = {}): Promise<NatureOperation[]> {
    const qb = this.natureOperationRepo
      .createQueryBuilder('x')
      .leftJoinAndSelect('x.natureComptable', 'nc')
      .where('x.estActif = :a', { a: true });
    return this.applyRefList(qb, 'x', opts, ['code', 'libelle'], { code: 'code', libelle: 'libelle' }, 'libelle');
  }

  async findNatureOperation(id: string): Promise<NatureOperation> {
    const n = await this.natureOperationRepo.findOne({ where: { id } });
    if (!n) throw new NotFoundException(`Nature d'opération ${id} introuvable`);
    return n;
  }

  async createNatureOperation(dto: CreateNatureOperationDto, userId: string): Promise<NatureOperation> {
    // On inclut les lignes soft-deleted : la contrainte UNIQUE en base les compte aussi.
    const existing = await this.natureOperationRepo.findOne({
      where: { code: dto.code },
      withDeleted: true,
    });
    if (existing && !existing.deletedAt) {
      throw new ConflictException(`Une nature d'opération avec le code ${dto.code} existe déjà`);
    }
    if (existing) {
      // Réactivation d'une nature précédemment désactivée (même code).
      existing.deletedAt = null;
      existing.deletedById = null;
      existing.estActif = true;
      existing.libelle = dto.libelle;
      existing.costCenterId = dto.costCenterId ?? null;
      existing.planComptableId = dto.planComptableId ?? null;
      existing.natureComptableId = dto.natureComptableId ?? null;
      return this.natureOperationRepo.save(existing);
    }
    const n = this.natureOperationRepo.create({
      code: dto.code,
      libelle: dto.libelle,
      costCenterId: dto.costCenterId ?? null,
      planComptableId: dto.planComptableId ?? null,
      natureComptableId: dto.natureComptableId ?? null,
      estActif: true,
      createdById: userId as any,
    });
    return this.natureOperationRepo.save(n);
  }

  async updateNatureOperation(
    id: string,
    dto: UpdateNatureOperationDto,
    userId: string,
  ): Promise<NatureOperation> {
    const n = await this.findNatureOperation(id);
    if (dto.code && dto.code !== n.code) {
      const dup = await this.natureOperationRepo.findOne({
        where: { code: dto.code },
        withDeleted: true,
      });
      if (dup && String(dup.id) !== String(n.id)) {
        throw new ConflictException(`Une nature d'opération avec le code ${dto.code} existe déjà`);
      }
      n.code = dto.code;
    }
    if (dto.libelle !== undefined) n.libelle = dto.libelle;
    if (dto.costCenterId !== undefined) n.costCenterId = dto.costCenterId || null;
    if (dto.planComptableId !== undefined) n.planComptableId = dto.planComptableId || null;
    if (dto.natureComptableId !== undefined) n.natureComptableId = dto.natureComptableId || null;
    n.updatedById = userId as any;
    return this.natureOperationRepo.save(n);
  }

  async deleteNatureOperation(id: string, userId: string): Promise<void> {
    const n = await this.findNatureOperation(id);
    n.estActif = false;
    n.deletedAt = new Date();
    n.deletedById = userId as any;
    await this.natureOperationRepo.save(n);
  }

  listNaturesComptable(
    opts: { search?: string; sortBy?: string; sortDir?: 'asc' | 'desc'; limit?: number } = {},
  ): Promise<NatureComptable[]> {
    return this.applyRefList(
      this.natureComptableRepo.createQueryBuilder('x').where('x.estActif = :a', { a: true }),
      'x', opts, ['codeComptableSap', 'libelle'],
      { codeComptableSap: 'codeComptableSap', libelle: 'libelle' }, 'libelle',
    );
  }

  listPlanComptable(
    opts: {
      search?: string;
      sortBy?: string;
      sortDir?: 'asc' | 'desc';
      limit?: number;
      typeCompte?: string;
    } = {},
  ): Promise<PlanComptable[]> {
    const qb = this.planComptableRepo
      .createQueryBuilder('x')
      // Le parent est joint ici pour que la liste filtrée se suffise à elle-même :
      // l'écran n'a plus besoin de charger tout le plan pour résoudre le libellé.
      .leftJoinAndSelect('x.parent', 'parent')
      .where('x.estActif = :a', { a: true });
    if (opts.typeCompte && opts.typeCompte.trim()) {
      qb.andWhere('x.typeCompte = :t', { t: opts.typeCompte.trim() });
    }
    return this.applyRefList(
      qb, 'x', opts, ['numeroCompte', 'libelle'],
      { numeroCompte: 'numeroCompte', libelle: 'libelle', typeCompte: 'typeCompte' }, 'numeroCompte',
    );
  }

  /**
   * Compteurs par type de compte, calculés EN BASE (GROUP BY) : les onglets de
   * filtre affichent le total réel de chaque type même quand la liste affichée
   * est restreinte par la recherche ou le filtre courant.
   */
  async statsPlanComptable(): Promise<{ total: number; parType: Record<string, number> }> {
    const rows: Array<{ typeCompte: string; n: string | number }> = await this.planComptableRepo
      .createQueryBuilder('x')
      .select('x.typeCompte', 'typeCompte')
      .addSelect('COUNT(*)', 'n')
      .where('x.estActif = :a', { a: true })
      .groupBy('x.typeCompte')
      .getRawMany();

    const parType: Record<string, number> = {};
    let total = 0;
    for (const r of rows) {
      const n = Number(r.n);
      parType[r.typeCompte] = n;
      total += n;
    }
    return { total, parType };
  }

  async findPlanComptable(id: string): Promise<PlanComptable> {
    const pc = await this.planComptableRepo.findOne({ where: { id } });
    if (!pc) throw new NotFoundException(`Compte ${id} introuvable`);
    return pc;
  }

  async createPlanComptable(dto: CreatePlanComptableDto, userId: string): Promise<PlanComptable> {
    const existing = await this.planComptableRepo.findOne({ where: { numeroCompte: dto.numeroCompte } });
    if (existing) {
      throw new ConflictException(`Un compte avec le numéro ${dto.numeroCompte} existe déjà`);
    }
    const pc = this.planComptableRepo.create({
      numeroCompte: dto.numeroCompte,
      libelle: dto.libelle,
      typeCompte: dto.typeCompte,
      parentId: dto.parentId ? (dto.parentId as any) : null,
      estActif: true,
      createdById: userId as any,
    });
    return this.planComptableRepo.save(pc);
  }

  async deletePlanComptable(id: string, userId: string): Promise<void> {
    const pc = await this.findPlanComptable(id);
    pc.estActif = false;
    pc.deletedAt = new Date();
    pc.deletedById = userId as any;
    await this.planComptableRepo.save(pc);
  }

  listSites(): Promise<Site[]> {
    return this.siteRepo.find({ where: { estActif: true }, order: { libelle: 'ASC' } });
  }
}
