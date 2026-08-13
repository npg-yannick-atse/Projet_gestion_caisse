import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Profil } from '../entities/profil.entity';
import { Permission } from '../entities/permission.entity';
import { ProfilPermission } from '../entities/profil-permission.entity';
import { Role } from '../entities/role.entity';
import { RolePermission } from '../entities/role-permission.entity';
import { CreateProfilDto, UpdateProfilDto } from './dto/profil.dto';
import { AuditPermissionService } from '../audit-permission.service';

@Injectable()
export class ProfilsService {
  constructor(
    @InjectRepository(Profil)
    private readonly profilRepo: Repository<Profil>,
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
    @InjectRepository(ProfilPermission)
    private readonly profilPermissionRepo: Repository<ProfilPermission>,
    private readonly auditPerm: AuditPermissionService,
  ) {}

  async createProfil(dto: CreateProfilDto): Promise<Profil> {
    // withDeleted : la contrainte UNIQUE compte les lignes soft-deleted, que
    // `findOne` masque par défaut — sinon l'écran reçoit une erreur SQL brute.
    const existing = await this.profilRepo.findOne({ where: { code: dto.code }, withDeleted: true });
    if (existing) {
      throw new ConflictException(
        existing.deletedAt
          ? `Le code ${dto.code} est encore occupé par un profil supprimé. Choisissez un autre code.`
          : `Profil avec le code ${dto.code} existe déjà`,
      );
    }
    const profil = this.profilRepo.create(dto);
    return this.profilRepo.save(profil);
  }

  async findAllProfils(): Promise<Profil[]> {
    return this.profilRepo.find({ where: { estActif: true }, order: { libelle: 'ASC' } });
  }

  async findProfil(id: string): Promise<Profil> {
    const profil = await this.profilRepo.findOne({ where: { id } });
    if (!profil) throw new NotFoundException(`Profil ${id} introuvable`);
    return profil;
  }

  async updateProfil(id: string, dto: UpdateProfilDto): Promise<Profil> {
    const profil = await this.findProfil(id);
    if (dto.code && dto.code !== profil.code) {
      const existing = await this.profilRepo.findOne({ where: { code: dto.code }, withDeleted: true });
      if (existing) {
        throw new ConflictException(
          existing.deletedAt
            ? `Le code ${dto.code} est encore occupé par un profil supprimé. Choisissez un autre code.`
            : `Profil avec le code ${dto.code} existe déjà`,
        );
      }
    }
    Object.assign(profil, dto);
    return this.profilRepo.save(profil);
  }

  async removeProfil(id: string): Promise<void> {
    const profil = await this.findProfil(id);
    profil.estActif = false;
    await this.profilRepo.save(profil);
  }

  /**
   * Crée un profil portant les mêmes permissions qu'un rôle.
   *
   * Sert à partir d'un socle connu — « comme un caissier, mais sans le rôle » —
   * puis à l'ajuster. C'est un point de départ, pas un lien : le profil ne suit
   * PAS le rôle. Ajouter une permission au rôle ensuite ne la donne pas au
   * profil, et c'est voulu : deux objets qui se ressemblent au départ n'ont pas
   * à évoluer ensemble sans qu'on l'ait décidé.
   *
   * Ce que la copie NE transporte PAS : tout ce que le rôle décide par son CODE
   * — la visibilité sur les bons d'autrui, le contournement administrateur, le
   * droit de modifier un bon. Ces règles-là lisent le code du rôle en dur ;
   * aucun profil ne peut les obtenir.
   */
  async genererDepuisRole(
    roleId: string,
    code: string,
    libelle: string,
    actorId: string,
  ): Promise<Profil> {
    const role = await this.profilRepo.manager.getRepository(Role).findOne({ where: { id: roleId as any } });
    if (!role) throw new NotFoundException(`Rôle ${roleId} introuvable`);

    const profil = await this.createProfil({
      code,
      libelle,
      description: `Généré depuis le rôle ${role.code}`,
    } as CreateProfilDto);

    const liens = await this.profilRepo.manager
      .getRepository(RolePermission)
      .find({ where: { roleId: roleId as any } });

    for (const lien of liens) {
      await this.assignPermissionToProfil(String(profil.id), String(lien.permissionId), actorId);
    }
    return profil;
  }

  async getProfilPermissions(profilId: string): Promise<Permission[]> {
    await this.findProfil(profilId);
    const links = await this.profilPermissionRepo.find({
      where: { profilId },
      relations: ['permission'],
    });
    return links.map((l) => l.permission).filter((p) => p && p.estActif !== false);
  }

  async assignPermissionToProfil(
    profilId: string,
    permissionId: string,
    actorId?: string,
    ip?: string | null,
  ): Promise<ProfilPermission> {
    await this.findProfil(profilId);
    const permission = await this.permissionRepo.findOne({ where: { id: permissionId } });
    if (!permission) throw new NotFoundException(`Permission ${permissionId} introuvable`);

    const existing = await this.profilPermissionRepo.findOne({ where: { profilId, permissionId } });
    if (existing) {
      throw new ConflictException('Permission déjà assignée à ce profil');
    }
    const pp = this.profilPermissionRepo.create({ profilId, permissionId });
    const saved = await this.profilPermissionRepo.save(pp);
    // Fan-out : tous les utilisateurs rattachés à ce profil GAGNENT cette permission.
    if (actorId) await this.auditPerm.logProfilPermissionChange(profilId, permissionId, 'GAIN', actorId, ip);
    return saved;
  }

  async removePermissionFromProfil(
    profilId: string,
    permissionId: string,
    actorId?: string,
    ip?: string | null,
  ): Promise<void> {
    await this.findProfil(profilId);
    const result = await this.profilPermissionRepo.delete({ profilId, permissionId });
    if (result.affected === 0) {
      throw new NotFoundException('Association profil-permission introuvable');
    }
