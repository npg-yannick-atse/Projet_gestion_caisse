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
import { UserDivisionAccess } from './entities/user-division-access.entity';
import { UserNatureOperation } from './entities/user-nature-operation.entity';
import { ProfilCostCenter } from './entities/profil-cost-center.entity';
import { ProfilNatureOperation } from './entities/profil-nature-operation.entity';
import { ProfilDivisionAccess } from './entities/profil-division-access.entity';
import { ProfilRole } from './entities/profil-role.entity';

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

    // Rôles portés par ses PROFILS (migration 0068). Un profil est un paquet
    // complet : sans ça, il transmettait ce qu'on peut faire mais pas ce qu'on
    // est — et son porteur restait bloqué au verrou d'entrée.
    try {
      const ids = await this.rolesViaProfils(userId);
      if (ids.length > 0) {
        const portes = await this.dataSource
          .getRepository(Role)
          .find({ where: { id: In(ids) as any } });
        for (const r of portes) if (r.estActif !== false) byId.set(String(r.id), r);
      }
    } catch (e) {
      console.warn('[authz] rôles effectifs (profils) échoués :', (e as Error).message);
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

    // Rôles portés par ses profils (migration 0068). C'est ici que se joue le
    // statut d'administrateur : `isAdmin` lit ces codes. Un profil portant
    // SUPER_ADMIN rend donc administrateur — c'est voulu, et c'est pourquoi
    // attacher un rôle à un profil exige ADMIN_ROLE.
    try {
      const ids = await this.rolesViaProfils(userId);
      if (ids.length > 0) {
        const portes: Array<{ code: string }> = await this.dataSource
          .getRepository(Role)
          .createQueryBuilder('r')
          .where('r.id IN (:...ids)', { ids })
          .select('r.code', 'code')
          .getRawMany();
        for (const r of portes) codes.add(r.code);
      }
    } catch (e) {
      console.warn('[authz] résolution des rôles via profils échouée :', (e as Error).message);
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
   * Comme assertPermission mais SANS bypass admin : la permission est exigée même
   * pour SUPER_ADMIN / ADMINISTRATEUR. Utilisé là où la gouvernance impose que
   * TOUTE action passe par une permission explicite (ex. caisses & portefeuilles).
   */
  async assertPermissionStrict(userId: string, code: string, action: string): Promise<void> {
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
  async getEffectivePermissions(
    userId: string,
    // `false` pour PHOTOGRAPHIER les droits propres d'un utilisateur : ce qu'il
    // exerce au nom d'un absent est temporaire et ne lui appartient pas. Le
    // recopier dans un profil le rendrait définitif, et transmissible à d'autres.
    opts: { inclureInterim?: boolean } = {},
  ): Promise<Set<string>> {
    const inclureInterim = opts.inclureInterim !== false;
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

    // Profils : seulement ceux VALIDES aujourd'hui (migration 0061). Un profil
    // prêté le temps d'un remplacement s'éteint de lui-même à l'échéance ; deux
    // bornes nulles = permanent, ce qui couvre toutes les attributions d'avant.
    try {
      const maintenant = new Date();
      const profilRows: Array<{ code: string }> = await this.dataSource
        .getRepository(ProfilPermission)
        .createQueryBuilder('pp')
        .innerJoin(UserProfil, 'up', 'up.profil_id = pp.profil_id AND up.user_id = :userId', { userId })
        .innerJoin(Permission, 'p', 'p.id = pp.permission_id')
        .where('(up.date_debut IS NULL OR up.date_debut <= :maintenant)', { maintenant })
        .andWhere('(up.date_fin IS NULL OR up.date_fin >= :maintenant)')
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
      const interims = inclureInterim ? await this.getActiveInterims(userId) : [];
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

  /**
   * Caisses autorisées (accès ECRITURE/ADMIN). `null` = toutes (admin uniquement).
   * SÉMANTIQUE STRICTE : un non-admin sans aucun accès obtient un ensemble VIDE
   * (= aucune caisse), plus de « filet de sécurité ». Il faut donc peupler
   * sec_user_caisse_access pour chaque caissier, sinon il est bloqué.
   */
  async getCaissePerimeter(_userId: string): Promise<Set<string> | null> {
    // DÉCISION MÉTIER (11/08/2026) : chez NPG, un caissier n'est PAS rattaché à
    // une caisse précise — il opère indifféremment sur les caisses de
    // l'entreprise. Le cloisonnement par caisse est donc supprimé : c'est la
    // PERMISSION qui autorise l'action (encaisser, recharger, décaisser…), pas
    // une liste de caisses. `null` = aucune restriction.
    //
    // La table `sec_user_caisse_access` n'a jamais été alimentée — aucun écran
    // ni endpoint ne le permettait — si bien que tout utilisateur non-admin
    // avait un périmètre VIDE et se voyait refuser l'encaissement, la recharge,
    // les transferts et le paiement des salaires. Les quatre comptes portant le
    // rôle CAISSIER étant aussi administrateurs, le défaut est resté invisible
    // jusqu'aux tests du 11/08/2026.
    //
    // L'entité et la table subsistent, inutilisées : les supprimer est une
    // décision de schéma à part (cf. Document/Points_en_attente.md).
    return null;
  }

  /**
   * Portefeuilles autorisés (possédés / direction / gestionnaire). `null` = tous
   * (admin uniquement) ; ensemble VIDE = aucun (sémantique stricte, plus de filet).
   */
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

    // SÉMANTIQUE STRICTE (comme la caisse) : un non-admin sans portefeuille possédé /
    // de sa direction / géré obtient un ensemble VIDE (= aucun portefeuille), pas de filet.
    return set;
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

  /**
   * Identifiants des profils attribués à l'utilisateur.
   *
   * Un profil porte désormais des PÉRIMÈTRES en plus de ses permissions
   * (migration 0067) : centres de coût, natures d'opération et divisions
   * s'ajoutent à ceux accordés en propre. C'est ce qui permet de transmettre
   * les droits d'une personne à une autre par un seul objet.
   */
  private async getProfilIds(userId: string): Promise<string[]> {
    // Seulement les profils VALIDES aujourd'hui : les permissions d'un profil
    // expiré sont déjà écartées, ses périmètres doivent l'être aussi. Sans ce
    // filtre, un profil prêté jusqu'au 31 continuerait d'ouvrir ses divisions
    // le 1er — et l'incohérence serait invisible, puisque les boutons
    // disparaîtraient pendant que les données resteraient accessibles.
    const maintenant = new Date();
    const liens = await this.dataSource
      .getRepository(UserProfil)
      .createQueryBuilder('up')
      .where('up.user_id = :userId', { userId })
      .andWhere('(up.date_debut IS NULL OR up.date_debut <= :maintenant)', { maintenant })
      .andWhere('(up.date_fin IS NULL OR up.date_fin >= :maintenant)')
      .getMany();
    return liens.map((l) => String(l.profilId));
  }

  /**
   * Rôles portés par les profils VALIDES de l'utilisateur (migration 0068).
   *
   * Passe par `getProfilIds`, qui écarte déjà les profils expirés : un profil
   * prêté jusqu'au 31 ne doit pas laisser son rôle actif le 1er.
   */
  private async rolesViaProfils(userId: string): Promise<string[]> {
    const profilIds = await this.getProfilIds(userId);
    if (profilIds.length === 0) return [];
    const rows = await this.dataSource
      .getRepository(ProfilRole)
      .find({ where: { profilId: In(profilIds) as any } });
    return rows.map((r) => String(r.roleId));
  }

  /** Cibles d'un périmètre portées par les profils de l'utilisateur. */
  private async viaProfils<T extends { profilId: string }>(
    userId: string,
    entite: new () => T,
    champ: keyof T,
  ): Promise<string[]> {
    const profilIds = await this.getProfilIds(userId);
    if (profilIds.length === 0) return [];
    const rows = await this.dataSource
      .getRepository(entite)
      .find({ where: { profilId: In(profilIds) as any } });
    return rows.map((r) => String(r[champ]));
  }

  /** Centres de coût portés par les profils de l'utilisateur. */
  async getCostCentersViaProfils(userId: string): Promise<string[]> {
    return this.viaProfils(userId, ProfilCostCenter, 'costCenterId');
  }

  /**
   * Divisions (régions de pays) autorisées pour l'utilisateur.
   * null = toutes (admin). Set (même vide) = liste stricte (aucun repli "tout voir"),
   * car l'accès aux restitutions par division doit être explicitement accordé.
   */
  async getDivisionPerimeter(userId: string): Promise<Set<string> | null> {
    if (await this.isAdmin(userId)) return null;
    const rows = await this.dataSource
      .getRepository(UserDivisionAccess)
      .find({ where: { userId: userId as any } });
    const parProfil = await this.viaProfils(userId, ProfilDivisionAccess, 'divisionId');
    return new Set([...rows.map((r) => String(r.divisionId)), ...parProfil]);
  }

  /**
   * Vérifie que l'utilisateur a accès à la division (sinon Forbidden).
   *
   * Le refus distingue deux causes que le même message confondait : « vous avez
   * des divisions, mais pas celle-là » et « vous n'en avez AUCUNE ». Le second
   * cas n'est pas une erreur de saisie mais une habilitation jamais accordée —
   * et il se produit pour tout nouvel utilisateur, dont aucune division n'a
   * encore été renseignée. Envoyer chercher au mauvais endroit coûte cher.
   */
  async assertDivisionInPerimeter(userId: string, divisionId: string): Promise<void> {
    const perim = await this.getDivisionPerimeter(userId);
    if (perim === null) return; // admin : accès total
    if (perim.size === 0) {
      throw new ForbiddenException(
        "Aucune division ne vous est attribuée : vous ne pouvez pas créer de bon client. " +
          "Demandez à un administrateur de vous donner accès à vos pays d'intervention.",
      );
    }
    if (!perim.has(String(divisionId))) {
      throw new ForbiddenException("Cette division est hors de votre périmètre d'autorisation.");
    }
  }

  /**
   * Natures d'opération autorisées pour l'utilisateur (liste blanche stricte).
   * null = administrateur (aucune restriction). Sinon un Set, éventuellement
   * VIDE : sans attribution, l'utilisateur ne peut utiliser aucune nature.
   */
  async getNatureOperationPerimeter(userId: string): Promise<Set<string> | null> {
    // Volontairement AUCUN bypass admin : le périmètre des natures d'opération
    // s'applique à TOUS, y compris SUPER_ADMIN / ADMINISTRATEUR / DAF. Un
    // utilisateur sans nature affectée (ensemble vide) ne peut en utiliser aucune.
    const rows = await this.dataSource
      .getRepository(UserNatureOperation)
      .find({ where: { userId: userId as any } });
    const parProfil = await this.viaProfils(userId, ProfilNatureOperation, 'natureOperationId');
    return new Set([...rows.map((r) => String(r.natureOperationId)), ...parProfil]);
  }

  /** Vérifie que l'utilisateur a le droit d'utiliser cette nature (sinon Forbidden). */
  async assertNatureInPerimeter(userId: string, natureOperationId: string): Promise<void> {
    const perim = await this.getNatureOperationPerimeter(userId);
    if (perim === null) return; // admin : accès total
    if (!perim.has(String(natureOperationId))) {
      throw new ForbiddenException("Cette nature comptable ne vous est pas autorisée.");
    }
  }
}
