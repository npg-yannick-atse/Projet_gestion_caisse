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
import { CreatePartenaireDto } from './dto/create-partenaire.dto';
import { CreateCostCenterDto } from './dto/create-cost-center.dto';
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
  ) {}

  listPartenaires(type?: TypePartenaire): Promise<Partenaire[]> {
    return this.partenaireRepo.find({
      where: { estActif: true, ...(type ? { typePartenaire: type } : {}) },
      order: { raisonSociale: 'ASC' },
    });
  }

  async findPartenaire(id: string): Promise<Partenaire> {
    const p = await this.partenaireRepo.findOne({ where: { id } });
    if (!p) throw new NotFoundException(`Partenaire ${id} introuvable`);
    return p;
  }

  async createPartenaire(dto: CreatePartenaireDto, userId: string): Promise<Partenaire> {
    const existing = await this.partenaireRepo.findOne({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException(`Un partenaire avec le code ${dto.code} existe déjà`);
    }
    const p = this.partenaireRepo.create({
      code: dto.code,
      raisonSociale: dto.raisonSociale,
      typePartenaire: dto.typePartenaire,
      sigle: dto.sigle ?? null,
      numeroClient: dto.numeroClient ?? null,
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

  async deletePartenaire(id: string, userId: string): Promise<void> {
    const p = await this.findPartenaire(id);
    p.estActif = false;
    p.deletedAt = new Date();
    p.deletedById = userId as any;
    await this.partenaireRepo.save(p);
  }

  listCostCenters(): Promise<CostCenter[]> {
    return this.costCenterRepo.find({ where: { estActif: true }, order: { libelle: 'ASC' } });
  }

  async findCostCenter(id: string): Promise<CostCenter> {
    const cc = await this.costCenterRepo.findOne({ where: { id } });
    if (!cc) throw new NotFoundException(`Centre de coût ${id} introuvable`);
    return cc;
  }

  async createCostCenter(dto: CreateCostCenterDto, userId: string): Promise<CostCenter> {
    const existing = await this.costCenterRepo.findOne({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException(`Un centre de coût avec le code ${dto.code} existe déjà`);
    }
    const cc = this.costCenterRepo.create({
      code: dto.code,
      libelle: dto.libelle,
      directionId: dto.directionId ?? null,
      budgetAnnuel: dto.budgetAnnuel ?? null,
      estActif: true,
      createdById: userId as any,
    });
    return this.costCenterRepo.save(cc);
  }

  async deleteCostCenter(id: string, userId: string): Promise<void> {
    const cc = await this.findCostCenter(id);
    cc.estActif = false;
    cc.deletedAt = new Date();
    cc.deletedById = userId as any;
    await this.costCenterRepo.save(cc);
  }

  listTypeBons(): Promise<TypeBon[]> {
    return this.typeBonRepo.find({ where: { estActif: true }, order: { libelle: 'ASC' } });
  }

  listNaturesOperation(): Promise<NatureOperation[]> {
    return this.natureOperationRepo.find({ where: { estActif: true }, order: { libelle: 'ASC' } });
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
      return this.natureOperationRepo.save(existing);
    }
    const n = this.natureOperationRepo.create({
      code: dto.code,
      libelle: dto.libelle,
      costCenterId: dto.costCenterId ?? null,
      planComptableId: dto.planComptableId ?? null,
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

  listNaturesComptable(): Promise<NatureComptable[]> {
    return this.natureComptableRepo.find({ where: { estActif: true }, order: { libelle: 'ASC' } });
  }

  listPlanComptable(): Promise<PlanComptable[]> {
    return this.planComptableRepo.find({ where: { estActif: true }, order: { numeroCompte: 'ASC' } });
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
