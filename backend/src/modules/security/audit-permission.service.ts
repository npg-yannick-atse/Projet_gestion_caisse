import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ChangementPermission,
  TypeChangementPermission,
} from '@modules/audit/entities/changement-permission.entity';
import { RolePermission } from './entities/role-permission.entity';
import { ProfilPermission } from './entities/profil-permission.entity';
import { UserRole } from './entities/user-role.entity';
import { UserProfil } from './entities/user-profil.entity';

/**
 * Alimente `aud_changement_permission` (append-only).
 *
 * Granularité = une ligne par (utilisateur concerné × permission) impactée :
 *  - attribuer/retirer un RÔLE à un user  → 1 ligne par permission du rôle ;
 *  - attribuer/retirer un PROFIL à un user → 1 ligne par permission du profil ;
 *  - ajouter/retirer une permission à un RÔLE/PROFIL → fan-out sur tous les users
 *    qui portent ce rôle/profil.
 *
 * Best-effort : une erreur d'écriture d'audit ne doit jamais bloquer l'action métier.
 */
@Injectable()
export class AuditPermissionService {
  private readonly logger = new Logger(AuditPermissionService.name);

  constructor(
    @InjectRepository(ChangementPermission)
    private readonly repo: Repository<ChangementPermission>,
    @InjectRepository(RolePermission)
    private readonly rolePermRepo: Repository<RolePermission>,
    @InjectRepository(ProfilPermission)
    private readonly profilPermRepo: Repository<ProfilPermission>,
    @InjectRepository(UserRole)
    private readonly userRoleRepo: Repository<UserRole>,
    @InjectRepository(UserProfil)
    private readonly userProfilRepo: Repository<UserProfil>,
  ) {}

  private async write(rows: Array<Partial<ChangementPermission>>): Promise<void> {
    if (rows.length === 0) return;
    try {
      await this.repo.insert(rows as any);
    } catch (e) {
      this.logger.warn(`Audit changement permission non écrit : ${(e as Error).message}`);
    }
  }

  /**
   * Exécute une collecte de lignes d'audit en mode best-effort : toute erreur de
   * LECTURE (find) est absorbée et journalisée, jamais propagée — l'action métier
   * (déjà committée) ne doit pas remonter un 500 à cause de l'audit.
   */
  private async safeCollect<T>(fn: () => Promise<T[]>): Promise<T[]> {
    try {
      return await fn();
    } catch (e) {
      this.logger.warn(`Audit changement permission (lecture) échoué : ${(e as Error).message}`);
      return [];
    }
  }

  /** Rôle attribué/retiré à un utilisateur → 1 ligne par permission du rôle. */
  async logUserRoleChange(
    userId: string,
    roleId: string,
    type: TypeChangementPermission,
    acteurId: string,
    ip?: string | null,
  ): Promise<void> {
    const links = await this.safeCollect(() => this.rolePermRepo.find({ where: { roleId } }));
    await this.write(
      links.map((l) => ({
        userConcerneId: userId,
        permissionId: l.permissionId,
        typeAction: type,
        source: 'ROLE',
        sourceId: roleId,
        acteurId,
        adresseIp: ip ?? null,
      })),
    );
  }

  /** Profil attribué/retiré à un utilisateur → 1 ligne par permission du profil. */
  async logUserProfilChange(
    userId: string,
    profilId: string,
    type: TypeChangementPermission,
    acteurId: string,
    ip?: string | null,
  ): Promise<void> {
    const links = await this.safeCollect(() => this.profilPermRepo.find({ where: { profilId } }));
    await this.write(
      links.map((l) => ({
        userConcerneId: userId,
        permissionId: l.permissionId,
        typeAction: type,
        source: 'PROFIL',
        sourceId: profilId,
        acteurId,
        adresseIp: ip ?? null,
      })),
    );
  }

  /** Permission ajoutée/retirée à un RÔLE → fan-out sur tous les users du rôle. */
  async logRolePermissionChange(
    roleId: string,
    permissionId: string,
    type: TypeChangementPermission,
    acteurId: string,
    ip?: string | null,
  ): Promise<void> {
    const users = await this.safeCollect(() => this.userRoleRepo.find({ where: { roleId } }));
    await this.write(
      users.map((u) => ({
        userConcerneId: u.userId,
        permissionId,
        typeAction: type,
        source: 'ROLE',
        sourceId: roleId,
        acteurId,
        adresseIp: ip ?? null,
      })),
    );
  }

  /** Permission ajoutée/retirée à un PROFIL → fan-out sur tous les users du profil. */
  async logProfilPermissionChange(
    profilId: string,
    permissionId: string,
    type: TypeChangementPermission,
    acteurId: string,
    ip?: string | null,
  ): Promise<void> {
    const users = await this.safeCollect(() => this.userProfilRepo.find({ where: { profilId } }));
    await this.write(
      users.map((u) => ({
        userConcerneId: u.userId,
        permissionId,
        typeAction: type,
        source: 'PROFIL',
        sourceId: profilId,
        acteurId,
        adresseIp: ip ?? null,
      })),
    );
  }
}
