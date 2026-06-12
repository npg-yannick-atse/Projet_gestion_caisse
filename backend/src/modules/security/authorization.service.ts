import { ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource, In, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { User } from './entities/user.entity';
import { Role } from './entities/role.entity';
import { UserRole } from './entities/user-role.entity';
import { RolePermission } from './entities/role-permission.entity';
import { Permission } from './entities/permission.entity';
import { UserProfil } from './entities/user-profil.entity';
import { ProfilPermission } from './entities/profil-permission.entity';
import { UserPermissionExtra } from './entities/user-permission-extra.entity';
import { Interim } from './entities/interim.entity';
import { Portefeuille } from '@modules/financier/entities/portefeuille.entity';
import { UserCaisseAccess } from './entities/user-caisse-access.entity';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMINISTRATEUR'];

/**
 * Rôles « combinés » : un méta-rôle déplié en plusieurs rôles de base.
 * DAF = Administrateur + Caissier → l'utilisateur cumule les droits des deux.
 * L'expansion est appliquée à la résolution des codes ET des rôles effectifs,
 * si bien que tous les contrôles existants (bypass admin, vérifs caissier,
 * navigation, dashboards, persona) fonctionnent sans modification.
 */
const ROLE_EXPANSION: Record<string, string[]> = {
  DAF: ['ADMINISTRATEUR', 'CAISSIER'],
};

/**
 * Service transverse d'autorisation : résolution des rôles d'un utilisateur et
 * des périmètres caisses / portefeuilles. Le JWT ne portant pas les rôles, tout
 * est résolu en base. Les admins (SUPER_ADMIN / ADMINISTRATEUR) ne sont jamais restreints.
 *
 * Règle « filet de sécurité » : un périmètre vide (données non encore peuplées)
 * renvoie null = aucune restriction, pour ne pas bloquer les utilisateurs.
 */
@Injectable()
export class AuthorizationService {
  constructor(private readonly dataSource: DataSource) {}

  /** Intérims ACTIFS où l'utilisateur est remplaçant, valides à l'instant présent. */
  async getActiveInterims(userId: string): Promise<Interim[]> {
    const now = new Date();
    return this.dataSource.getRepository(Interim).find({
      where: {
        remplacantId: userId as any,
        statut: 'ACTIF',
        dateDebut: LessThanOrEqual(now),
        dateFin: MoreThanOrEqual(now),
      },
    });
  }

  /**
   * Rôles EFFECTIFS d'un utilisateur (objets complets) = rôles assignés ∪ rôles délégués
   * par un intérim actif où il est remplaçant. Sert à l'UI (menu, gardes, dashboards).
   */
  async getEffectiveRoles(userId: string): Promise<Role[]> {
    const byId = new Map<string, Role>();

    const own = await this.dataSource
      .getRepository(UserRole)
      .find({ where: { userId: userId as any }, relations: ['role'] });
    for (const ur of own) {
      if (ur.role && ur.role.estActif !== false) byId.set(String(ur.role.id), ur.role);
    }

    try {
      const roleIds = (await this.getActiveInterims(userId))
        .map((i) => i.roleTransfereId)
        .filter((id): id is string => !!id);
      if (roleIds.length > 0) {
        const delegated = await this.dataSource
          .getRepository(Role)
          .find({ where: { id: In(roleIds) as any } });
        for (const r of delegated) byId.set(String(r.id), r);
      }
    } catch (e) {
      console.warn('[authz] rôles effectifs (intérim) échoués :', (e as Error).message);
    }

    // Dépliage des méta-rôles : on AJOUTE les rôles de base ciblés (ex. DAF →
    // ADMINISTRATEUR + CAISSIER) pour que la navigation et les gardes voient les
    // bons droits, tout en CONSERVANT le méta-rôle lui-même (DAF garde son propre
    // tableau de bord combiné côté front, via le système de persona).
    const metaCodes = [...byId.values()].map((r) => r.code).filter((c) => ROLE_EXPANSION[c]);
    if (metaCodes.length > 0) {
      const targetCodes = [...new Set(metaCodes.flatMap((c) => ROLE_EXPANSION[c]))];
      const targets = await this.dataSource
        .getRepository(Role)
        .find({ where: { code: In(targetCodes) as any } });
      for (const r of targets) {
        if (r.estActif !== false) byId.set(String(r.id), r);
      }
    }

    return [...byId.values()];
  }

  async getUserRoleCodes(userId: string): Promise<Set<string>> {
    const rows: Array<{ code: string }> = await this.dataSource
      .getRepository(UserRole)
      .createQueryBuilder('ur')
      .innerJoin(Role, 'r', 'r.id = ur.role_id')
      .where('ur.user_id = :userId', { userId })
      .select('r.code', 'code')
      .getRawMany();
    const codes = new Set(rows.map((r) => r.code));

    // Cumul : rôles délégués via un intérim actif (le remplaçant garde aussi les siens).
    try {
      const roleIds = (await this.getActiveInterims(userId))
        .map((i) => i.roleTransfereId)
        .filter((id): id is string => !!id);
      if (roleIds.length > 0) {
        const delegated: Array<{ code: string }> = await this.dataSource
          .getRepository(Role)
          .createQueryBuilder('r')
          .where('r.id IN (:...ids)', { ids: roleIds })
          .select('r.code', 'code')
          .getRawMany();
        for (const r of delegated) codes.add(r.code);
      }
    } catch (e) {
      console.warn('[authz] résolution des rôles délégués (intérim) échouée :', (e as Error).message);
    }

    // Dépliage des méta-rôles (ex. DAF → ADMINISTRATEUR + CAISSIER).
    for (const code of [...codes]) {
      for (const expanded of ROLE_EXPANSION[code] ?? []) codes.add(expanded);
    }

    return codes;
  }

  isAdminCodes(codes: Set<string>): boolean {
    return ADMIN_ROLES.some((r) => codes.has(r));
  }

  async isAdmin(userId: string): Promise<boolean> {
    return this.isAdminCodes(await this.getUserRoleCodes(userId));
  }

  /**
   * Lève ForbiddenException si l'utilisateur n'a aucun des rôles autorisés.
   * Les admins passent toujours. Renvoie les codes de rôles (réutilisables).
   */
  async assertAnyRole(userId: string, allowed: string[], action: string): Promise<Set<string>> {
    const codes = await this.getUserRoleCodes(userId);
    if (this.isAdminCodes(codes) || allowed.some((r) => codes.has(r))) return codes;
    throw new ForbiddenException(
      `Action non autorisée (${action}). Rôle requis : ${allowed.join(', ')}.`,
    );
  }

  /**
   * Lève ForbiddenException si l'utilisateur n'a pas la permission requise.
   * Les admins (SUPER_ADMIN / ADMINISTRATEUR) passent toujours.
   */
  async assertPermission(userId: string, code: string, action: string): Promise<void> {
    if (await this.isAdmin(userId)) return;
    if (await this.hasPermission(userId, code)) return;
    throw new ForbiddenException(`Action non autorisée (${action}). Permission requise : ${code}.`);
  }

  /**
   * Permissions effectives d'un utilisateur = union des trois canaux :
   *  - rôles    : sec_user_role → sec_role_permission
   *  - profils  : sec_user_profil → sec_profil_permission
   *  - extra    : sec_user_permission_extra (globales, actives, dans la fenêtre de validité)
   * Un droit obtenu par au moins un canal suffit.
   */
  async getEffectivePermissions(userId: string): Promise<Set<string>> {
    const codes = new Set<string>();

    // Chaque canal est résolu indépendamment : une erreur sur un canal (table absente,
    // schéma non aligné…) ne doit pas faire échouer toute la résolution ni bloquer les
    // flux qui s'appuient sur les permissions (création de bon, etc.).
    try {
      const roleRows: Array<{ code: string }> = await this.dataSource
        .getRepository(RolePermission)
        .createQueryBuilder('rp')
        .innerJoin(UserRole, 'ur', 'ur.role_id = rp.role_id AND ur.user_id = :userId', { userId })
        .innerJoin(Permission, 'p', 'p.id = rp.permission_id')
        .select('p.code', 'code')
        .getRawMany();
      for (const r of roleRows) codes.add(r.code);
    } catch (e) {
      console.warn('[authz] résolution permissions via rôles échouée :', (e as Error).message);
    }

    try {
      const profilRows: Array<{ code: string }> = await this.dataSource
        .getRepository(ProfilPermission)
        .createQueryBuilder('pp')
        .innerJoin(UserProfil, 'up', 'up.profil_id = pp.profil_id AND up.user_id = :userId', { userId })
        .innerJoin(Permission, 'p', 'p.id = pp.permission_id')
        .select('p.code', 'code')
        .getRawMany();
      for (const r of profilRows) codes.add(r.code);
    } catch (e) {
      console.warn('[authz] résolution permissions via profils échouée :', (e as Error).message);
    }

    // Extra : seulement les permissions globales (scope_type NULL), actives et valides aujourd'hui.
    try {
      const now = new Date();
      const extraRows: Array<{ code: string }> = await this.dataSource
        .getRepository(UserPermissionExtra)
        .createQueryBuilder('ext')
        .innerJoin(Permission, 'p', 'p.id = ext.permission_id')
        .where('ext.user_id = :userId', { userId })
        .andWhere('ext.est_actif = 1')
        .andWhere('ext.scope_type IS NULL')
        .andWhere('(ext.date_debut IS NULL OR ext.date_debut <= :now)', { now })
        .andWhere('(ext.date_fin IS NULL OR ext.date_fin >= :now)')
        .select('p.code', 'code')
        .getRawMany();
      for (const r of extraRows) codes.add(r.code);
    } catch (e) {
      console.warn('[authz] résolution permissions via extra échouée :', (e as Error).message);
    }

    // Intérim : permissions déléguées (directe, via rôle, via profil) par les intérims actifs
    // où l'utilisateur est remplaçant. Cumul avec ses propres droits.
    try {
      const interims = await this.getActiveInterims(userId);
      if (interims.length > 0) {
        const permIds = interims.map((i) => i.permissionId).filter((x): x is string => !!x);
        const roleIds = interims.map((i) => i.roleTransfereId).filter((x): x is string => !!x);
        const profilIds = interims.map((i) => i.profilTransfereId).filter((x): x is string => !!x);

        if (permIds.length > 0) {
          const rows: Array<{ code: string }> = await this.dataSource
            .getRepository(Permission)
            .createQueryBuilder('p')
            .where('p.id IN (:...ids)', { ids: permIds })
            .select('p.code', 'code')
            .getRawMany();
          for (const r of rows) codes.add(r.code);
        }
        if (roleIds.length > 0) {
          const rows: Array<{ code: string }> = await this.dataSource
            .getRepository(RolePermission)
            .createQueryBuilder('rp')
            .innerJoin(Permission, 'p', 'p.id = rp.permission_id')
            .where('rp.role_id IN (:...ids)', { ids: roleIds })
            .select('p.code', 'code')
            .getRawMany();
          for (const r of rows) codes.add(r.code);
        }
        if (profilIds.length > 0) {
          const rows: Array<{ code: string }> = await this.dataSource
            .getRepository(ProfilPermission)
            .createQueryBuilder('pp')
            .innerJoin(Permission, 'p', 'p.id = pp.permission_id')
            .where('pp.profil_id IN (:...ids)', { ids: profilIds })
            .select('p.code', 'code')
            .getRawMany();
          for (const r of rows) codes.add(r.code);
        }
      }
    } catch (e) {
      console.warn('[authz] résolution permissions via intérim échouée :', (e as Error).message);
    }

    return codes;
  }

  /** Vrai si l'utilisateur dispose de la permission (via rôle, profil ou extra). */
  async hasPermission(userId: string, code: string): Promise<boolean> {
    return (await this.getEffectivePermissions(userId)).has(code);
  }

  /** Caisses autorisées (accès ECRITURE/ADMIN). null = toutes (admin ou périmètre vide). */
  async getCaissePerimeter(userId: string): Promise<Set<string> | null> {
    if (await this.isAdmin(userId)) return null;
    const rows = await this.dataSource
      .getRepository(UserCaisseAccess)
      .find({ where: { userId: userId as any } });
    const set = new Set<string>();
    for (const a of rows) {
      if (a.niveauAcces === 'ECRITURE' || a.niveauAcces === 'ADMIN') set.add(String(a.caisseId));
    }
    return set.size > 0 ? set : null;
  }

  /** Portefeuilles autorisés (possédés / direction / gestionnaire). null = tous. */
  async getPortefeuillePerimeter(userId: string): Promise<Set<string> | null> {
    if (await this.isAdmin(userId)) return null;
    const user = await this.dataSource.getRepository(User).findOne({ where: { id: userId } });
    const ptfRepo = this.dataSource.getRepository(Portefeuille);
    const set = new Set<string>();

    const owned = await ptfRepo.find({
      where: { proprietaireType: 'USER' as any, proprietaireId: userId as any },
    });
    for (const p of owned) set.add(String(p.id));

    if (user?.directionId) {
      const dir = await ptfRepo.find({
        where: { proprietaireType: 'DIRECTION' as any, proprietaireId: user.directionId as any },
      });
      for (const p of dir) set.add(String(p.id));
    }

    const managed = await ptfRepo.find({ where: { gestionnaireId: userId as any } });
    for (const p of managed) set.add(String(p.id));

    return set.size > 0 ? set : null;
  }

  /** Vérifie qu'une caisse est dans le périmètre de l'utilisateur (sinon Forbidden). */
  async assertCaisseInPerimeter(userId: string, caisseId: string): Promise<void> {
    const perim = await this.getCaissePerimeter(userId);
    if (perim && !perim.has(String(caisseId))) {
      throw new ForbiddenException('Cette caisse est hors de votre périmètre.');
    }
  }

  /** Vérifie qu'un portefeuille est dans le périmètre de l'utilisateur (sinon Forbidden). */
  async assertPortefeuilleInPerimeter(userId: string, portefeuilleId: string): Promise<void> {
    const perim = await this.getPortefeuillePerimeter(userId);
    if (perim && !perim.has(String(portefeuilleId))) {
      throw new ForbiddenException('Ce portefeuille est hors de votre périmètre.');
    }
  }
}
