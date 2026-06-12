import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Caisse } from './entities/caisse.entity';
import { SessionCaisse, TypeCloture } from './entities/session-caisse.entity';
import { CreateCaisseDto } from './dto/create-caisse.dto';
import { UpdateCaisseDto } from './dto/update-caisse.dto';
import { LedgerService } from '@modules/transactionnel/ledger.service';

@Injectable()
export class CaissesService {
  constructor(
    @InjectRepository(Caisse)
    private readonly caisseRepo: Repository<Caisse>,
    @InjectRepository(SessionCaisse)
    private readonly sessionRepo: Repository<SessionCaisse>,
    private readonly dataSource: DataSource,
    private readonly ledgerService: LedgerService,
  ) {}

  async create(dto: CreateCaisseDto, userId: string): Promise<Caisse> {
    const existing = await this.caisseRepo.findOne({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException(`Une caisse avec le code ${dto.code} existe déjà`);
    }
    const caisse = this.caisseRepo.create({
      code: dto.code,
      libelle: dto.libelle,
      deviseId: dto.deviseId as any,
      siteId: dto.siteId ?? null,
      estPrincipale: dto.estPrincipale ?? false,
      statut: 'FERMEE',
      createdById: userId as any,
    });
    return this.caisseRepo.save(caisse);
  }

  async update(id: string, dto: UpdateCaisseDto, userId: string): Promise<Caisse> {
    const caisse = await this.findOne(id);
    if (dto.code && dto.code !== caisse.code) {
      const conflict = await this.caisseRepo.findOne({ where: { code: dto.code } });
      if (conflict) throw new ConflictException(`Une caisse avec le code ${dto.code} existe déjà`);
      caisse.code = dto.code;
    }
    if (dto.libelle !== undefined) caisse.libelle = dto.libelle;
    if (dto.deviseId !== undefined) caisse.deviseId = dto.deviseId as any;
    if (dto.siteId !== undefined) caisse.siteId = dto.siteId as any;
    if (dto.estPrincipale !== undefined) caisse.estPrincipale = dto.estPrincipale;
    if (dto.estActif !== undefined) caisse.estActif = dto.estActif;
    caisse.updatedById = userId as any;
    return this.caisseRepo.save(caisse);
  }

  async toggleActif(id: string, estActif: boolean, userId: string): Promise<Caisse> {
    const caisse = await this.findOne(id);
    if (!estActif && caisse.statut === 'OUVERTE') {
      throw new BadRequestException(
        "Impossible de désactiver une caisse ouverte. Clôturez la session d'abord.",
      );
    }
    caisse.estActif = estActif;
    caisse.updatedById = userId as any;
    return this.caisseRepo.save(caisse);
  }

  async softDelete(id: string, userId: string): Promise<void> {
    const caisse = await this.findOne(id);
    if (caisse.statut === 'OUVERTE') {
      throw new BadRequestException('Impossible de supprimer une caisse ouverte. Clôturez-la d\'abord.');
    }
    caisse.deletedAt = new Date();
    caisse.deletedById = userId as any;
    await this.caisseRepo.save(caisse);
  }

  async findAll(): Promise<Caisse[]> {
    return this.caisseRepo.find({ order: { code: 'ASC' } });
  }

  async findOne(id: string): Promise<Caisse> {
    const caisse = await this.caisseRepo.findOne({ where: { id } });
    if (!caisse) throw new NotFoundException(`Caisse ${id} introuvable`);
    return caisse;
  }

  /** Solde courant de la caisse, dérivé des écritures comptables. */
  async getSolde(id: string): Promise<string> {
    await this.findOne(id);
    return this.ledgerService.calculateBalance(id, 'CAISSE');
  }

  async getSessions(caisseId: string): Promise<SessionCaisse[]> {
    await this.findOne(caisseId);
    return this.sessionRepo.find({
      where: { caisseId: caisseId as any },
      order: { dateOuverture: 'DESC' },
    });
  }

  async getCurrentSession(caisseId: string): Promise<SessionCaisse | null> {
    await this.findOne(caisseId);
    return this.sessionRepo.findOne({
      where: { caisseId: caisseId as any, statut: 'OUVERTE' },
    });
  }

  /**
   * Ouvre une caisse : crée une session OUVERTE et passe la caisse à OUVERTE.
   * L'index unique partiel UX_fin_session_caisse_ouverte garantit en base
   * qu'une seule session reste ouverte par caisse.
   */
  async open(caisseId: string, userId: string, soldeOuverture = '0'): Promise<SessionCaisse> {
    return this.dataSource.transaction(async (manager) => {
      const caisseRepo = manager.getRepository(Caisse);
      const sessionRepo = manager.getRepository(SessionCaisse);

      const caisse = await caisseRepo.findOne({ where: { id: caisseId } });
      if (!caisse) throw new NotFoundException(`Caisse ${caisseId} introuvable`);
      if (caisse.statut === 'OUVERTE') {
        throw new ConflictException(`La caisse ${caisse.code} est déjà ouverte`);
      }

      const session = await sessionRepo.save(
        sessionRepo.create({
          caisseId: caisseId as any,
          dateOuverture: new Date(),
          soldeOuverture,
          statut: 'OUVERTE',
          createdById: userId as any,
        }),
      );

      caisse.statut = 'OUVERTE';
      caisse.updatedById = userId as any;
      await caisseRepo.save(caisse);

      return session;
    });
  }

  /**
   * Clôture manuelle d'une caisse : ferme la session ouverte et passe la caisse à FERMEE.
   * Le solde de clôture par défaut est le solde calculé depuis les écritures.
   */
  async close(
    caisseId: string,
    userId: string,
    soldeCloture?: string,
    typeCloture: TypeCloture = 'MANUEL',
  ): Promise<SessionCaisse> {
    const soldeCalcule = await this.ledgerService.calculateBalance(caisseId, 'CAISSE');

    return this.dataSource.transaction(async (manager) => {
      const caisseRepo = manager.getRepository(Caisse);
      const sessionRepo = manager.getRepository(SessionCaisse);

      const caisse = await caisseRepo.findOne({ where: { id: caisseId } });
      if (!caisse) throw new NotFoundException(`Caisse ${caisseId} introuvable`);
      if (caisse.statut !== 'OUVERTE') {
        throw new BadRequestException(`La caisse ${caisse.code} n'est pas ouverte`);
      }

      const session = await sessionRepo.findOne({
        where: { caisseId: caisseId as any, statut: 'OUVERTE' },
      });
      if (!session) {
        throw new BadRequestException(`Aucune session ouverte pour la caisse ${caisse.code}`);
      }

      session.dateCloture = new Date();
      session.soldeCloture = soldeCloture ?? soldeCalcule;
      session.clotureParId = userId as any;
      session.typeCloture = typeCloture;
      session.statut = 'FERMEE';
      await sessionRepo.save(session);

      caisse.statut = 'FERMEE';
      caisse.updatedById = userId as any;
      await caisseRepo.save(caisse);

      return session;
    });
  }
}
