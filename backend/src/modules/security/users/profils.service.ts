import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Profil } from '../entities/profil.entity';
import { Permission } from '../entities/permission.entity';
import { ProfilPermission } from '../entities/profil-permission.entity';
import { Role } from '../entities/role.entity';
import { RolePermission } from '../entities/role-permission.entity';
import { User } from '../entities/user.entity';
import { UserCostCenter } from '../entities/user-cost-center.entity';
import { UserNatureOperation } from '../entities/user-nature-operation.entity';
import { UserDivisionAccess } from '../entities/user-division-access.entity';
import { UserRole } from '../entities/user-role.entity';
import { ProfilCostCenter } from '../entities/profil-cost-center.entity';
import { ProfilNatureOperation } from '../entities/profil-nature-operation.entity';
import { ProfilDivisionAccess } from '../entities/profil-division-access.entity';
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
   * Sert à partir d'un socle connu puis à l'ajuster. C'est un point de départ,
   * pas un lien : le profil ne suit PAS le rôle. Ajouter une permission au rôle
   * ensuite ne la donne pas au profil, et c'est voulu — deux objets qui se
   * ressemblent au départ n'ont pas à évoluer ensemble sans qu'on l'ait décidé.
   *
   * Depuis la migration 0068, le RÔLE LUI-MÊME est attaché au profil, en plus
   * de ses permissions. Sans cela, un profil « généré depuis CAISSIER » donnait
   * les gestes d'un caissier mais pas son statut : son porteur restait bloqué
   * au verrou d'entrée, et tout ce que le rôle décide par son code — voir les
   * bons d'autrui, contourner les contrôles — lui échappait.
   *
   * Pour un profil de permissions SEULES, il suffit de décocher le rôle dans le
   * volet Rôles : le choix reste ouvert, il n'est simplement plus imposé.
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

    // Le rôle lui-même, pas seulement ses permissions (migration 0068).
    await this.profilRepo.manager.query(
      `IF NOT EXISTS (SELECT 1 FROM dbo.sec_profil_role WHERE profil_id=@0 AND role_id=@1)
       INSERT INTO dbo.sec_profil_role (profil_id, role_id, created_by_id) VALUES (@0, @1, @2)`,
      [String(profil.id), String(roleId), actorId],
    );
    return profil;
  }

  /**
   * Crée un profil rassemblant TOUTES les permissions effectives d'un
   * utilisateur, pour les donner ensuite à quelqu'un d'autre.
   *
   * « Effectives » veut dire : ce qui lui vient de ses rôles, de ses profils,
   * de ses permissions individuelles et de ses intérims en cours — l'ensemble
   * aplati en un seul objet attribuable. C'est la réponse à « donne-lui les
   * mêmes droits qu'elle », sans avoir à retrouver d'où chaque droit provient.
   *
   * Depuis la migration 0068, les RÔLES de la personne sont recopiés eux aussi.
   * Un profil transporte donc ce qu'elle peut faire ET ce qu'elle est : copier
   * un administrateur fabrique bien un administrateur. C'est ce qu'on attend de
   * « donne-lui les mêmes droits », et c'est aussi ce qui rend l'opération
   * sensible — d'où ADMIN_ROLE pour attacher un rôle à un profil.
   *
   * CE QUI NE SUIT TOUJOURS PAS : la direction de la personne, qui relève de
   * l'organigramme et non des droits. Les périmètres, eux, se posent sur le
   * profil lui-même (migration 0067) plutôt que d'être recopiés d'un individu.
   *
   * La copie est ponctuelle : le profil ne suivra pas l'utilisateur d'origine.
   */
  async genererDepuisUtilisateur(
    userId: string,
    code: string,
    libelle: string,
    actorId: string,
    authz: {
      getEffectivePermissions(id: string, opts?: { inclureInterim?: boolean }): Promise<Set<string>>;
    },
  ): Promise<Profil> {
    const utilisateur = await this.profilRepo.manager
      .getRepository(User)
      .findOne({ where: { id: userId as any } });
    if (!utilisateur) throw new NotFoundException(`Utilisateur ${userId} introuvable`);

    // SANS les droits d'intérim : ce que cette personne exerce au nom d'un
    // absent est temporaire et ne lui appartient pas. Les recopier dans un
    // profil les rendrait définitifs, et transmissibles à n'importe qui.
    const codes = [...(await authz.getEffectivePermissions(userId, { inclureInterim: false }))];
    if (codes.length === 0) {
      throw new ConflictException(
        `${utilisateur.prenom} ${utilisateur.nom} n'a aucune permission propre : il n'y a rien à recopier. ` +
          `Les droits exercés au titre d'un intérim ne sont pas repris, car ils sont temporaires.`,
      );
    }

    // On repart des CODES pour retrouver les identifiants : `getEffectivePermissions`
    // aplatit quatre origines et ne rend que des codes.
    const permissions = await this.permissionRepo.find({ where: { code: In(codes) } });

    const profil = await this.createProfil({
      code,
      libelle,
      description: `Généré depuis les droits de ${utilisateur.prenom} ${utilisateur.nom}`,
    } as CreateProfilDto);

    // Les RÔLES de la personne suivent aussi (migration 0068). Sans eux, le
    // profil transmettait ce qu'elle peut faire mais pas ce qu'elle est : son
    // porteur restait bloqué au verrou d'entrée, avec des dizaines de
    // permissions inutilisables.
    const rolesPropres = await this.profilRepo.manager
      .getRepository(UserRole)
      .find({ where: { userId: userId as any } });
    for (const r of rolesPropres) {
      await this.profilRepo.manager.query(
        `IF NOT EXISTS (SELECT 1 FROM dbo.sec_profil_role WHERE profil_id=@0 AND role_id=@1)
         INSERT INTO dbo.sec_profil_role (profil_id, role_id, created_by_id) VALUES (@0, @1, @2)`,
        [String(profil.id), String(r.roleId), actorId],
      );
    }

    for (const permission of permissions) {
      await this.assignPermissionToProfil(String(profil.id), String(permission.id), actorId);
    }

    /**
     * Les PÉRIMÈTRES suivent aussi (migration 0067) : centres de coût, natures
     * d'opération et divisions. Sans eux, le profil donnait le droit d'agir
     * sans dire sur quoi — un demandeur cloné pouvait créer un bon en théorie,
     * et se voyait refuser chaque nature d'opération en pratique.
     *
     * Ce qui NE suit pas, faute de sens : les rôles (leur code déclenche des
     * règles écrites en dur) et les accès aux caisses (un coffre se confie à
     * une personne nommée, pas à un paquet de droits).
     */
    const m = this.profilRepo.manager;
    const copier = async <S extends object, C extends object>(
      source: new () => S,
      cible: new () => C,
      champ: string,
    ) => {
      const lignes = await m.getRepository(source).find({ where: { userId } as never });
      for (const ligne of lignes) {
        const valeur = (ligne as Record<string, unknown>)[champ];
        await m.getRepository(cible).save(
          m.getRepository(cible).create({
            profilId: String(profil.id),
            [champ]: String(valeur),
            createdById: actorId,
          } as never),
        );
      }
      return lignes.length;
    };

    await copier(UserCostCenter, ProfilCostCenter, 'costCenterId');
    await copier(UserNatureOperation, ProfilNatureOperation, 'natureOperationId');
    await copier(UserDivisionAccess, ProfilDivisionAccess, 'divisionId');

    return profil;
  }

  /* ======================================================================
     Périmètres portés par le PROFIL (migration 0067).

     Les trois tables ont la même forme — `profil_id` + une cible — d'où un
     traitement générique plutôt que trois copies. Comme ailleurs, l'écran
     envoie la SÉLECTION COMPLÈTE et le service calcule la différence : les
     liens inchangés ne sont pas réécrits, pour que `created_at` garde son sens.
     ====================================================================== */

  /** Le nom de la table et de la colonne cible, par périmètre. */
  private perimetreProfil(quoi: 'cost-centers' | 'divisions' | 'natures-operation' | 'roles'): {
    table: string;
    colonne: string;
  } {
    switch (quoi) {
      case 'cost-centers':
        return { table: 'sec_profil_cost_center', colonne: 'cost_center_id' };
      case 'divisions':
        return { table: 'sec_profil_division_access', colonne: 'division_id' };
      case 'natures-operation':
        return { table: 'sec_profil_nature_operation', colonne: 'nature_operation_id' };
      case 'roles':
        return { table: 'sec_profil_role', colonne: 'role_id' };
    }
  }

  async getPerimetreProfil(
    profilId: string,
    quoi: 'cost-centers' | 'divisions' | 'natures-operation' | 'roles',
  ): Promise<string[]> {
    await this.findProfil(profilId);
    const { table, colonne } = this.perimetreProfil(quoi);
    const rows: Array<{ id: string }> = await this.profilRepo.manager.query(
      `SELECT ${colonne} AS id FROM dbo.${table} WHERE profil_id = @0`,
      [profilId],
    );
    return rows.map((r) => String(r.id));
  }

  async setPerimetreProfil(
    profilId: string,
    quoi: 'cost-centers' | 'divisions' | 'natures-operation' | 'roles',
    idsVoulus: string[],
    actorId: string,
  ): Promise<string[]> {
    await this.findProfil(profilId);
    const { table, colonne } = this.perimetreProfil(quoi);
    const manager = this.profilRepo.manager;

    const avant = new Set(await this.getPerimetreProfil(profilId, quoi));
    const apres = new Set(idsVoulus.map(String));

    for (const id of [...apres].filter((x) => !avant.has(x))) {
      await manager.query(
        `INSERT INTO dbo.${table} (profil_id, ${colonne}, created_by_id) VALUES (@0, @1, @2)`,
        [profilId, id, actorId],
      );
    }
    const aRetirer = [...avant].filter((x) => !apres.has(x));
    if (aRetirer.length > 0) {
      const ph = aRetirer.map((_, i) => `@${i + 1}`).join(', ');
      await manager.query(
        `DELETE FROM dbo.${table} WHERE profil_id = @0 AND ${colonne} IN (${ph})`,
        [profilId, ...aRetirer],
      );
    }
    return [...apres];
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
    if (actorId) await this.auditPerm.logProfilPermissionChange(profilId, permissionId, 'PERTE', actorId, ip);
  }
}
