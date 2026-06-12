import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Portefeuille } from './entities/portefeuille.entity';
import { CreatePortefeuilleDto } from './dto/create-portefeuille.dto';
import { UpdatePortefeuilleDto } from './dto/update-portefeuille.dto';
import { LedgerService } from '@modules/transactionnel/ledger.service';

@Injectable()
export class PortefeuillesService {
  constructor(
    @InjectRepository(Portefeuille)
    private readonly portefeuilleRepo: Repository<Portefeuille>,
    private readonly ledgerService: LedgerService,
  ) {}

  async create(dto: CreatePortefeuilleDto, userId: string): Promise<Portefeuille> {
    const existing = await this.portefeuilleRepo.findOne({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException(`Un portefeuille avec le code ${dto.code} existe déjà`);
    }
    const portefeuille = this.portefeuilleRepo.create({
      code: dto.code,
      libelle: dto.libelle,
      caisseSourceId: dto.caisseSourceId as any,
      deviseId: dto.deviseId as any,
      proprietaireType: dto.proprietaireType,
      proprietaireId: dto.proprietaireId as any,
      gestionnaireId: dto.gestionnaireId ? (dto.gestionnaireId as any) : null,
      soldeInitial: dto.soldeInitial ?? '0',
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
    if (dto.soldeInitial !== undefined) pf.soldeInitial = dto.soldeInitial;
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
  async getSoldeDetail(id: string): Promise<{ solde: string; soldeInitial: string }> {
    const pf = await this.findOne(id);
    const ledger = await this.ledgerService.calculateBalance(id, 'PORTEFEUILLE');
    const soldeInitial = Number(pf.soldeInitial || 0);
    const total = soldeInitial + Number(ledger || 0);
    return { solde: total.toFixed(4), soldeInitial: soldeInitial.toFixed(4) };
  }
}
