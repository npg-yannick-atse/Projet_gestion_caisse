import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { User } from '../entities/user.entity';
import { Role } from '../entities/role.entity';
import { UserRole } from '../entities/user-role.entity';
import { Profil } from '../entities/profil.entity';
import { UserProfil } from '../entities/user-profil.entity';
import { UserDivisionAccess } from '../entities/user-division-access.entity';
import { UserNatureComptable } from '../entities/user-nature-comptable.entity';
import { UserCostCenter } from '../entities/user-cost-center.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuditPermissionService } from '../audit-permission.service';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserRole)
    private readonly userRoleRepo: Repository<UserRole>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(UserProfil)
    private readonly userProfilRepo: Repository<UserProfil>,
    @InjectRepository(Profil)
    private readonly profilRepo: Repository<Profil>,
    @InjectRepository(UserDivisionAccess)
    private readonly userDivisionRepo: Repository<UserDivisionAccess>,
    @InjectRepository(UserNatureComptable)
    private readonly userNatureRepo: Repository<UserNatureComptable>,
    @InjectRepository(UserCostCenter)
    private readonly userCostCenterRepo: Repository<UserCostCenter>,
    private readonly auditPerm: AuditPermissionService,
  ) {}

  // ---------- Accès division (restitutions) ----------
  async getDivisionAccess(userId: string): Promise<string[]> {
    await this.findOne(userId);
    const rows = await this.userDivisionRepo.find({ where: { userId } });
    return rows.map((r) => String(r.divisionId));
  }

  async assignDivision(userId: string, divisionId: string, actorId: string): Promise<void> {
    await this.findOne(userId);
    const existing = await this.userDivisionRepo.findOne({ where: { userId, divisionId } });
    if (existing) return;
    await this.userDivisionRepo.save(
      this.userDivisionRepo.create({ userId, divisionId, createdById: actorId }),
    );
  }

  async removeDivision(userId: string, divisionId: string): Promise<void> {
    const result = await this.userDivisionRepo.delete({ userId, divisionId });
    if (result.affected === 0) {
      throw new NotFoundException('Accès division introuvable');
    }
  }

  // ---------- Natures d'opération autorisées (création de bons) ----------
  async getNatureComptableAccess(userId: string): Promise<string[]> {
    await this.findOne(userId);
    const rows = await this.userNatureRepo.find({ where: { userId } });
    return rows.map((r) => String(r.natureComptableId));
  }

  async assignNatureComptable(userId: string, natureComptableId: string, actorId: string): Promise<void> {
    await this.findOne(userId);
    const existing = await this.userNatureRepo.findOne({ where: { userId, natureComptableId } });
    if (existing) return;
    await this.userNatureRepo.save(
      this.userNatureRepo.create({ userId, natureComptableId, createdById: actorId }),
    );
  }

  async removeNatureComptable(userId: string, natureComptableId: string): Promise<void> {
    const result = await this.userNatureRepo.delete({ userId, natureComptableId });
    if (result.affected === 0) {
      throw new NotFoundException('Nature autorisée introuvable');
    }
  }

  /**
   * Centres de coût autorisés EN PROPRE.
   *
   * Le périmètre effectif y ajoute ceux de la direction de l'utilisateur et son
   * centre principal : cette liste ne dit donc pas tout ce qu'il peut imputer,
   * seulement ce qu'on lui a accordé EN PLUS. L'écran le précise.
   */
  async getCostCenterAccess(userId: string): Promise<string[]> {
    await this.findOne(userId);
    const rows = await this.userCostCenterRepo.find({ where: { userId } });
    return rows.map((r) => String(r.costCenterId));
  }

  async assignCostCenter(userId: string, costCenterId: string, actorId: string): Promise<void> {
    await this.findOne(userId);
    const existing = await this.userCostCenterRepo.findOne({ where: { userId, costCenterId } });
    if (existing) return;
    await this.userCostCenterRepo.save(
      this.userCostCenterRepo.create({ userId, costCenterId, estPrincipal: false, createdById: actorId }),
    );
  }

  async removeCostCenter(userId: string, costCenterId: string): Promise<void> {
    const result = await this.userCostCenterRepo.delete({ userId, costCenterId });
    if (result.affected === 0) {
      throw new NotFoundException('Centre de coût autorisé introuvable');
    }
  }

  /* ---------- Affectation par ENSEMBLE -------------------------------------
     « Tout sélectionner » sur 182 natures déclenchait 182 requêtes une à une,
     dont l'échec de la centième laissait un état à moitié appliqué. On envoie
     la sélection complète, et le serveur calcule la différence : seuls les
     changements réels touchent la base. */

  private async remplacerAffectations<T extends Record<string, any>>(
    repo: { find: Function; save: Function; delete: Function; create: Function },
    userId: string,
    champ: string,
    idsVoulus: string[],
    actorId: string,
    extra: Partial<T> = {},
  ): Promise<string[]> {
    await this.findOne(userId);
    const rows: T[] = await repo.find({ where: { userId } });
    const avant = new Set(rows.map((r) => String(r[champ])));
    const apres = new Set(idsVoulus.map(String));

    for (const id of [...apres].filter((x) => !avant.has(x))) {
      await repo.save(repo.create({ userId, [champ]: id, createdById: actorId, ...extra }));
    }
    for (const id of [...avant].filter((x) => !apres.has(x))) {
      await repo.delete({ userId, [champ]: id });
    }
    return [...apres];
  }

  setDivisions(userId: string, divisionIds: string[], actorId: string): Promise<string[]> {
    return this.remplacerAffectations(this.userDivisionRepo as any, userId, 'divisionId', divisionIds, actorId);
  }

  setNaturesOperation(userId: string, natureIds: string[], actorId: string): Promise<string[]> {
    return this.remplacerAffectations(
      this.userNatureRepo as any,
      userId,
      'natureComptableId',
      natureIds,
      actorId,
    );
  }

  /**
   * Recopie sur `cibleId` TOUT ce qui fait le périmètre de `sourceId`.
   *
   * Un profil ne peut pas transporter ça : divisions, natures et centres de coût
   * vivent dans des tables attachées à la personne, pas dans un paquet de
   * permissions. D'où un geste utilisateur → utilisateur.
   *
   * La cible est REMPLACÉE, pas complétée : « les mêmes accès que X » veut dire
   * les mêmes, pas les siens plus ceux de X. Un cumul silencieux laisserait des
   * droits résiduels que personne ne penserait à retirer.
   *
   * Volontairement HORS du clonage :
   *  - la direction, qui relève de l'identité dans l'organigramme, pas des droits ;
   *  - les permissions exceptionnelles, accordées à une personne pour un motif
   *    et une durée qui n'ont pas de sens transposés ;
   *  - les droits exercés au titre d'un intérim, qui sont temporaires.
   */
  async clonerDroits(
    sourceId: string,
    cibleId: string,
    actorId: string,
    ip?: string | null,
    /**
     * REMPLACER — la cible devient exactement la source. Pour une recrue au
     * même poste : c'est un clone, et les droits propres de la cible n'ont pas
     * à survivre.
     *
     * AJOUTER — les droits de la source s'ajoutent aux siens, rien n'est
     * retiré. C'est le mode d'un remplacement : le remplaçant doit continuer
     * son propre travail. Remplacer lui ferait perdre son rôle CAISSIER, ses
     * caisses et ses natures — il ne pourrait plus encaisser.
     */
    mode: 'REMPLACER' | 'AJOUTER' = 'REMPLACER',
  ): Promise<{
    roles: number;
    profils: number;
    divisions: number;
    natures: number;
    costCenters: number;
  }> {
    if (String(sourceId) === String(cibleId)) {
      throw new BadRequestException('La source et la destination du clonage sont la même personne.');
    }
    await this.findOne(sourceId);
    await this.findOne(cibleId);
    const ajoute = mode === 'AJOUTER';

    // Rôles : on passe par assignRole/removeRole pour conserver la journalisation
    // des gains et pertes de permission, que l'audit exploite.
    const rolesSource = await this.userRoleRepo.find({ where: { userId: sourceId } });
    const rolesCible = await this.userRoleRepo.find({ where: { userId: cibleId } });
    const voulus = new Set(rolesSource.map((r) => String(r.roleId)));
    const actuels = new Set(rolesCible.map((r) => String(r.roleId)));
    for (const roleId of [...voulus].filter((id) => !actuels.has(id))) {
      await this.assignRole(cibleId, roleId, actorId, ip);
    }
    if (!ajoute) {
      for (const roleId of [...actuels].filter((id) => !voulus.has(id))) {
        await this.removeRole(cibleId, roleId, actorId, ip);
      }
    }

    // Profils : la période de validité suit. Un profil prêté jusqu'au 31 doit
    // l'être aussi chez la cible, sinon le clone hérite d'un droit permanent.
    const profilsSource = await this.userProfilRepo.find({ where: { userId: sourceId } });
    const profilsCible = ajoute
      ? await this.userProfilRepo.find({ where: { userId: cibleId } })
      : [];
    const dejaLa = new Set(profilsCible.map((p) => String(p.profilId)));
    if (!ajoute) await this.userProfilRepo.delete({ userId: cibleId });
    for (const p of profilsSource.filter((p) => !dejaLa.has(String(p.profilId)))) {
      await this.userProfilRepo.save(
        this.userProfilRepo.create({
          userId: cibleId,
          profilId: p.profilId,
          dateDebut: p.dateDebut ?? null,
          dateFin: p.dateFin ?? null,
          attribueParId: actorId,
        }),
      );
    }

    // En mode AJOUTER, on réunit les deux périmètres ; en REMPLACER, celui de la
    // source suffit — `setX` se charge de retirer le reste.
    const reunir = async (
      repo: { find: Function },
      champ: string,
      idsSource: string[],
    ): Promise<string[]> => {
      if (!ajoute) return idsSource;
      const actuels: any[] = await repo.find({ where: { userId: cibleId } });
      return [...new Set([...actuels.map((r) => String(r[champ])), ...idsSource])];
    };

    const divisions = await reunir(
      this.userDivisionRepo,
      'divisionId',
      (await this.userDivisionRepo.find({ where: { userId: sourceId } })).map((r) => String(r.divisionId)),
    );
    const natures = await reunir(
      this.userNatureRepo,
      'natureComptableId',
      (await this.userNatureRepo.find({ where: { userId: sourceId } })).map((r) =>
        String(r.natureComptableId),
      ),
    );
    const costCenters = await reunir(
      this.userCostCenterRepo,
      'costCenterId',
      (await this.userCostCenterRepo.find({ where: { userId: sourceId } })).map((r) =>
        String(r.costCenterId),
      ),
    );
    await this.setDivisions(cibleId, divisions, actorId);
    await this.setNaturesOperation(cibleId, natures, actorId);
    await this.setCostCenters(cibleId, costCenters, actorId);

    return {
      roles: voulus.size,
      profils: profilsSource.length,
      divisions: divisions.length,
      natures: natures.length,
      costCenters: costCenters.length,
    };
  }

  setCostCenters(userId: string, costCenterIds: string[], actorId: string): Promise<string[]> {
    // `estPrincipal` reste faux : le centre principal se désigne ailleurs, et
    // une sélection en masse ne doit pas décider qui il est.
    return this.remplacerAffectations(
      this.userCostCenterRepo as any,
      userId,
      'costCenterId',
      costCenterIds,
      actorId,
      { estPrincipal: false } as any,
    );
  }

  /**
   * Profils attribués, enrichis de leur période de validité et de l'état qui en
   * découle. L'écran doit pouvoir distinguer « accordé pour toujours » de
   * « expire vendredi » et de « déjà expiré » — sans quoi un profil éteint
   * s'afficherait comme un profil actif.
   */
  async getProfils(
    userId: string,
  ): Promise<Array<Profil & { dateDebut: Date | null; dateFin: Date | null; statut: 'ACTIF' | 'A_VENIR' | 'EXPIRE' }>> {
    await this.findOne(userId);
    const links = await this.userProfilRepo.find({ where: { userId }, relations: ['profil'] });
    const maintenant = Date.now();
    return links
      .filter((l) => l.profil && l.profil.estActif !== false)
      .map((l) => {
        const debut = l.dateDebut ? new Date(l.dateDebut).getTime() : null;
        const fin = l.dateFin ? new Date(l.dateFin).getTime() : null;
        const statut = debut !== null && debut > maintenant ? 'A_VENIR' : fin !== null && fin < maintenant ? 'EXPIRE' : 'ACTIF';
        return {
          ...l.profil,
          dateDebut: l.dateDebut ?? null,
          dateFin: l.dateFin ?? null,
          statut: statut as 'ACTIF' | 'A_VENIR' | 'EXPIRE',
        };
      });
  }

  /**
   * Attribue un profil, éventuellement pour une durée limitée.
   *
   * Réattribuer un profil déjà présent ne sortait pas en erreur mais ne faisait
   * rien : c'était sans conséquence quand l'attribution était définitive. Avec
   * des dates, ce silence deviendrait un piège — prolonger un profil semblerait
   * fonctionner sans rien changer. On met donc les bornes à jour.
   */
  async assignProfil(
    userId: string,
    profilId: string,
    actorId: string,
    ip?: string | null,
    validite?: { dateDebut?: string | Date | null; dateFin?: string | Date | null },
  ): Promise<void> {
    await this.findOne(userId);
    const profil = await this.profilRepo.findOne({ where: { id: profilId } });
    if (!profil) throw new NotFoundException(`Profil ${profilId} introuvable`);

    const dateDebut = validite?.dateDebut ? new Date(validite.dateDebut) : null;
    const dateFin = validite?.dateFin ? new Date(validite.dateFin) : null;
    if (dateDebut && dateFin && dateFin < dateDebut) {
      throw new BadRequestException(
        'La fin de validité du profil est antérieure à son début : le profil ne serait jamais actif.',
      );
    }

    const existing = await this.userProfilRepo.findOne({ where: { userId, profilId } });
    if (existing) {
      existing.dateDebut = dateDebut;
      existing.dateFin = dateFin;
      await this.userProfilRepo.save(existing);
      return;
    }
    await this.userProfilRepo.save(
      this.userProfilRepo.create({ userId, profilId, attribueParId: actorId, dateDebut, dateFin }),
    );
    await this.auditPerm.logUserProfilChange(userId, profilId, 'GAIN', actorId, ip);
  }

  async removeProfil(userId: string, profilId: string, actorId: string, ip?: string | null): Promise<void> {
    const result = await this.userProfilRepo.delete({ userId, profilId });
    if (result.affected === 0) {
      throw new NotFoundException('Association utilisateur-profil introuvable');
    }
    await this.auditPerm.logUserProfilChange(userId, profilId, 'PERTE', actorId, ip);
  }

  async getRoles(userId: string): Promise<Role[]> {
    await this.findOne(userId);
    const links = await this.userRoleRepo.find({ where: { userId }, relations: ['role'] });
    return links.map((l) => l.role).filter((r) => r && r.estActif !== false);
  }

  async assignRole(userId: string, roleId: string, actorId: string, ip?: string | null): Promise<void> {
    await this.findOne(userId);
    const role = await this.roleRepo.findOne({ where: { id: roleId } });
    if (!role) throw new NotFoundException(`Rôle ${roleId} introuvable`);
    const existing = await this.userRoleRepo.findOne({ where: { userId, roleId } });
    if (existing) return;
    await this.userRoleRepo.save(
      this.userRoleRepo.create({ userId, roleId, attribueParId: actorId }),
    );
    await this.auditPerm.logUserRoleChange(userId, roleId, 'GAIN', actorId, ip);
  }

  async removeRole(userId: string, roleId: string, actorId: string, ip?: string | null): Promise<void> {
    const result = await this.userRoleRepo.delete({ userId, roleId });
    if (result.affected === 0) {
      throw new NotFoundException('Association utilisateur-rôle introuvable');
    }
    await this.auditPerm.logUserRoleChange(userId, roleId, 'PERTE', actorId, ip);
  }

  async create(dto: CreateUserDto): Promise<User> {
    const email = dto.email.toLowerCase();

    // On regarde aussi les soft-deleted : la contrainte UNIQUE (matricule, email)
    // s'applique à toutes les lignes, soft-deleted incluses. Si on retrouve une
    // ligne désactivée correspondante, on la réactive plutôt que d'échouer.
    const existing = await this.userRepo.findOne({
      where: [{ matricule: dto.matricule }, { email }],
      withDeleted: true,
    });

    if (existing && !existing.deletedAt) {
      throw new ConflictException(
        existing.matricule === dto.matricule
          ? `Matricule deja utilise : ${dto.matricule}`
          : `Email deja utilise : ${dto.email}`,
      );
    }

    // L'authentification se fait par LDAP : le mot de passe local n'est pas utilisé.
    // Si non fourni, on stocke un hash aléatoire inutilisable (la colonne est NOT NULL).
    const motDePasseClair = dto.motDePasse ?? randomBytes(24).toString('hex');
    const motDePasseHash = await bcrypt.hash(motDePasseClair, BCRYPT_ROUNDS);

    if (existing && existing.deletedAt) {
      // Réactivation d'un compte précédemment désactivé.
      existing.deletedAt = null;
      existing.deletedById = null;
      existing.estActif = dto.estActif ?? true;
      existing.matricule = dto.matricule;
      existing.nom = dto.nom;
      existing.prenom = dto.prenom;
      existing.email = email;
      existing.telephone = dto.telephone ?? existing.telephone ?? null;
      existing.directionId = dto.directionId ?? existing.directionId ?? null;
      existing.costCenterId = dto.costCenterId ?? existing.costCenterId ?? null;
      existing.accesWeb = dto.accesWeb ?? true;
      existing.accesMobile = dto.accesMobile ?? true;
      if (dto.motDePasse) existing.motDePasseHash = motDePasseHash;
      return this.userRepo.save(existing);
    }

    const user = this.userRepo.create({
      matricule: dto.matricule,
      nom: dto.nom,
      prenom: dto.prenom,
      email,
      telephone: dto.telephone ?? null,
      motDePasseHash,
      directionId: dto.directionId ?? null,
      costCenterId: dto.costCenterId ?? null,
      estActif: dto.estActif ?? true,
      accesWeb: dto.accesWeb ?? true,
      accesMobile: dto.accesMobile ?? true,
    });
    return this.userRepo.save(user);
  }

  private static readonly USER_SORT_MAP: Record<string, keyof User> = {
    matricule: 'matricule',
    nom: 'nom',
    prenom: 'prenom',
    email: 'email',
    estActif: 'estActif',
  };

  findAll(
    opts: {
      search?: string;
      sortBy?: string;
      sortDir?: 'asc' | 'desc';
      /** 'ACTIF' | 'INACTIF' — absent = les deux. */
      statut?: string;
    } = {},
  ): Promise<User[]> {
    const col = UsersService.USER_SORT_MAP[opts.sortBy ?? ''];
    const direction: 'ASC' | 'DESC' = opts.sortDir === 'desc' ? 'DESC' : 'ASC';
    const qb = this.userRepo.createQueryBuilder('u').where('u.deleted_at IS NULL');

    // Filtre par statut, EN BASE comme le reste. La liste mêlait actifs et
    // inactifs sans moyen de les séparer : la tuile « Inactifs » du tableau de
    // bord menait donc à une liste majoritairement active (test du 10/08/2026).
    if (opts.statut === 'ACTIF') qb.andWhere('u.estActif = :a', { a: true });
    else if (opts.statut === 'INACTIF') qb.andWhere('u.estActif = :a', { a: false });

    // Recherche EN BASE sur nom, prénom (dans les deux ordres), matricule et email.
    if (opts.search && opts.search.trim()) {
      const q = `%${opts.search.trim().replace(/[\\%_[]/g, (c) => `\\${c}`)}%`;
      qb.andWhere(
        "(u.nom LIKE :q ESCAPE :e OR u.prenom LIKE :q ESCAPE :e " +
          "OR (u.prenom + ' ' + u.nom) LIKE :q ESCAPE :e " +
          "OR (u.nom + ' ' + u.prenom) LIKE :q ESCAPE :e " +
          'OR u.matricule LIKE :q ESCAPE :e OR u.email LIKE :q ESCAPE :e)',
        { q, e: '\\' },
      );
    }

    if (col) {
      qb.orderBy(`u.${col}`, direction);
    } else {
      qb.orderBy('u.nom', 'ASC').addOrderBy('u.prenom', 'ASC');
    }
    return qb.getMany();
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!user) throw new NotFoundException(`Utilisateur ${id} introuvable`);
    return user;
  }

  findByMatricule(matricule: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { matricule, deletedAt: IsNull() } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email: email.toLowerCase(), deletedAt: IsNull() } });
  }

  /**
   * Username = préfixe de l'email (ex. « yannick.atse » → yannick.atse@npgandour.com).
   * Les métacaractères LIKE (`%`, `_`, `[`, `\`) sont échappés pour empêcher un
   * identifiant comme « % » de matcher tous les comptes (usurpation en mode LOCAL).
   */
  findByUsername(username: string): Promise<User | null> {
    const escaped = username.toLowerCase().replace(/[\\%_[]/g, (c) => `\\${c}`);
    return this.userRepo
      .createQueryBuilder('u')
      .where('u.email LIKE :pattern ESCAPE :esc', { pattern: `${escaped}@%`, esc: '\\' })
      .andWhere('u.deletedAt IS NULL')
      .getOne();
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    Object.assign(user, {
      ...dto,
      email: dto.email ? dto.email.toLowerCase() : user.email,
    });
    return this.userRepo.save(user);
  }

  async softDelete(id: string, actorId: string): Promise<void> {
    const user = await this.findOne(id);
    user.deletedAt = new Date();
    user.deletedById = actorId;
    user.estActif = false;
    await this.userRepo.save(user);
  }

  async updateLastConnection(id: string): Promise<void> {
    await this.userRepo.update({ id }, { derniereConnexion: new Date() });
  }

  async verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
