import {
  Injectable,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Interim } from '../entities/interim.entity';
import { User } from '../entities/user.entity';
import { CreateInterimDto, UpdateInterimDto } from './dto/interim.dto';

// Fréquence du passage automatique des intérims échus en EXPIRE (1 h).
const EXPIRE_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class InterimsService implements OnModuleInit, OnModuleDestroy {
  private expireTimer?: ReturnType<typeof setInterval>;

  constructor(
    @InjectRepository(Interim)
    private readonly interimRepo: Repository<Interim>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /** Planificateur léger (sans dépendance) : expire les intérims échus au démarrage puis chaque heure. */
  onModuleInit(): void {
    this.expireExpiredInterims().catch(() => undefined);
    this.expireTimer = setInterval(() => {
      this.expireExpiredInterims().catch(() => undefined);
    }, EXPIRE_INTERVAL_MS);
    // Ne bloque pas l'arrêt du process.
    this.expireTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.expireTimer) clearInterval(this.expireTimer);
  }

  async create(dto: CreateInterimDto): Promise<Interim> {
    const initiateur = await this.userRepo.findOne({ where: { id: dto.initiateurId } });
    if (!initiateur || !initiateur.estActif) {
      throw new NotFoundException('Initiateur introuvable ou inactif');
    }

    const remplacant = await this.userRepo.findOne({ where: { id: dto.remplacantId } });
    if (!remplacant || !remplacant.estActif) {
      throw new NotFoundException('Remplaçant introuvable ou inactif');
    }

    const dateDebut = new Date(dto.dateDebut);
    const dateFin = new Date(dto.dateFin);

    if (dateDebut >= dateFin) {
      throw new BadRequestException('La date de début doit être antérieure à la date de fin');
    }

    if (dateDebut < new Date()) {
      throw new BadRequestException('La date de début ne peut pas être dans le passé');
    }

    if (!dto.permissionId && !dto.roleTransfereId && !dto.profilTransfereId) {
      throw new BadRequestException(
        'Précisez ce qui est délégué : un rôle, un profil ou une permission.',
      );
    }

    const interim = this.interimRepo.create({
      initiateurId: dto.initiateurId as any,
      remplacantId: dto.remplacantId as any,
      permissionId: dto.permissionId ? (dto.permissionId as any) : null,
      roleTransfereId: dto.roleTransfereId ? (dto.roleTransfereId as any) : null,
      profilTransfereId: dto.profilTransfereId ? (dto.profilTransfereId as any) : null,
      dateDebut,
      dateFin,
      commentaire: dto.commentaire,
      statut: 'ACTIF',
    });

    return this.interimRepo.save(interim);
  }

  async findAll(statut?: string): Promise<Interim[]> {
    const query = this.interimRepo.createQueryBuilder('interim');

    if (statut) {
      query.where('interim.statut = :statut', { statut });
    }

    return query.orderBy('interim.date_debut', 'DESC').getMany();
  }

  async findOne(id: string): Promise<Interim> {
    const interim = await this.interimRepo.findOne({ where: { id: id as any } });
    if (!interim) throw new NotFoundException(`Intérim ${id} introuvable`);
    return interim;
  }

  async findByInitiator(initiateurId: string): Promise<Interim[]> {
    const now = new Date();
    return this.interimRepo.find({
      where: {
        initiateurId: initiateurId as any,
        dateDebut: LessThanOrEqual(now),
        dateFin: MoreThanOrEqual(now),
        statut: 'ACTIF',
      },
    });
  }

  async findByRemplacant(remplacantId: string): Promise<Interim[]> {
    const now = new Date();
    return this.interimRepo.find({
      where: {
        remplacantId: remplacantId as any,
        dateDebut: LessThanOrEqual(now),
        dateFin: MoreThanOrEqual(now),
        statut: 'ACTIF',
      },
    });
  }

  async update(id: string, dto: UpdateInterimDto): Promise<Interim> {
    const interim = await this.findOne(id);

    if (interim.statut === 'REVOQUE' || interim.statut === 'EXPIRE') {
      throw new BadRequestException('Impossible de modifier un intérim révoqué ou expiré');
    }

    if (dto.dateDebut || dto.dateFin) {
      const dateDebut = dto.dateDebut ? new Date(dto.dateDebut) : interim.dateDebut;
      const dateFin = dto.dateFin ? new Date(dto.dateFin) : interim.dateFin;

      if (dateDebut >= dateFin) {
        throw new BadRequestException('La date de début doit être antérieure à la date de fin');
      }
    }

    Object.assign(interim, dto);
    return this.interimRepo.save(interim);
  }

  async revoke(id: string): Promise<Interim> {
    const interim = await this.findOne(id);
    interim.statut = 'REVOQUE';
    return this.interimRepo.save(interim);
  }

  async expireInterim(id: string): Promise<void> {
    const interim = await this.findOne(id);
    interim.statut = 'EXPIRE';
    await this.interimRepo.save(interim);
  }

  async expireExpiredInterims(): Promise<number> {
    const now = new Date();
    const result = await this.interimRepo.update(
      { dateFin: LessThanOrEqual(now), statut: 'ACTIF' },
      { statut: 'EXPIRE' },
    );
    return result.affected || 0;
  }
}
