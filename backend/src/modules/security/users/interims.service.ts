import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Interim } from '../entities/interim.entity';
import { User } from '../entities/user.entity';
import { Permission } from '../entities/permission.entity';
import { UserProfil } from '../entities/user-profil.entity';
import { AuthorizationService } from '../authorization.service';
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
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
    @InjectRepository(UserProfil)
    private readonly userProfilRepo: Repository<UserProfil>,
    private readonly authz: AuthorizationService,
  ) {}

  /**
   * Sécurité anti-escalade : on ne peut déléguer (via un intérim) qu'un rôle / profil /
   * permission que l'INITIATEUR possède réellement. Sans cela, un utilisateur pourrait
   * se créer un intérim lui déléguant ADMINISTRATEUR (les droits délégués sont cumulés
   * par AuthorizationService pour le remplaçant). Les admins peuvent tout déléguer.
   */
  private async assertCanDelegate(initiateurId: string, dto: CreateInterimDto): Promise<void> {
    if (await this.authz.isAdmin(initiateurId)) return;

    if (dto.roleTransfereId) {
      const roles = await this.authz.getEffectiveRoles(initiateurId);
      if (!roles.some((r) => String(r.id) === String(dto.roleTransfereId))) {
        throw new ForbiddenException("Vous ne pouvez déléguer qu'un rôle que vous possédez.");
      }
    }

    if (dto.permissionId) {
      const perm = await this.permissionRepo.findOne({ where: { id: dto.permissionId as any } });
      const codes = await this.authz.getEffectivePermissions(initiateurId);
      if (!perm || !codes.has(perm.code)) {
        throw new ForbiddenException("Vous ne pouvez déléguer qu'une permission que vous possédez.");
      }
    }

    if (dto.profilTransfereId) {
      const profils = await this.userProfilRepo.find({ where: { userId: initiateurId as any } });
      if (!profils.some((p) => String(p.profilId) === String(dto.profilTransfereId))) {
        throw new ForbiddenException("Vous ne pouvez déléguer qu'un profil que vous détenez.");
      }
    }
  }

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

  async create(dto: CreateInterimDto, currentUserId: string): Promise<Interim> {
    // L'initiateur est TOUJOURS l'utilisateur authentifié : on ignore toute valeur
    // d'initiateurId fournie dans le body (anti-usurpation).
    const initiateurId = currentUserId;
    const initiateur = await this.userRepo.findOne({ where: { id: initiateurId } });
    if (!initiateur || !initiateur.estActif) {
      throw new NotFoundException('Initiateur introuvable ou inactif');
    }

    // Anti-escalade : on ne délègue que ce qu'on possède.
    await this.assertCanDelegate(initiateurId, dto);

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
      initiateurId: initiateurId as any,
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
