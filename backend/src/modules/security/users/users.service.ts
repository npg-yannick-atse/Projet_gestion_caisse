import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { User } from '../entities/user.entity';
import { Role } from '../entities/role.entity';
import { UserRole } from '../entities/user-role.entity';
import { Profil } from '../entities/profil.entity';
import { UserProfil } from '../entities/user-profil.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

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
  ) {}

  async getProfils(userId: string): Promise<Profil[]> {
    await this.findOne(userId);
    const links = await this.userProfilRepo.find({ where: { userId }, relations: ['profil'] });
    return links.map((l) => l.profil).filter((p) => p && p.estActif !== false);
  }

  async assignProfil(userId: string, profilId: string, actorId: string): Promise<void> {
    await this.findOne(userId);
    const profil = await this.profilRepo.findOne({ where: { id: profilId } });
    if (!profil) throw new NotFoundException(`Profil ${profilId} introuvable`);
    const existing = await this.userProfilRepo.findOne({ where: { userId, profilId } });
    if (existing) return;
    await this.userProfilRepo.save(
      this.userProfilRepo.create({ userId, profilId, attribueParId: actorId }),
    );
  }

  async removeProfil(userId: string, profilId: string): Promise<void> {
    const result = await this.userProfilRepo.delete({ userId, profilId });
    if (result.affected === 0) {
      throw new NotFoundException('Association utilisateur-profil introuvable');
    }
  }

  async getRoles(userId: string): Promise<Role[]> {
    await this.findOne(userId);
    const links = await this.userRoleRepo.find({ where: { userId }, relations: ['role'] });
    return links.map((l) => l.role).filter((r) => r && r.estActif !== false);
  }

  async assignRole(userId: string, roleId: string, actorId: string): Promise<void> {
    await this.findOne(userId);
    const role = await this.roleRepo.findOne({ where: { id: roleId } });
    if (!role) throw new NotFoundException(`Rôle ${roleId} introuvable`);
    const existing = await this.userRoleRepo.findOne({ where: { userId, roleId } });
    if (existing) return;
    await this.userRoleRepo.save(
      this.userRoleRepo.create({ userId, roleId, attribueParId: actorId }),
    );
  }

  async removeRole(userId: string, roleId: string): Promise<void> {
    const result = await this.userRoleRepo.delete({ userId, roleId });
    if (result.affected === 0) {
      throw new NotFoundException('Association utilisateur-rôle introuvable');
    }
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

  findAll(opts: { sortBy?: string; sortDir?: 'asc' | 'desc' } = {}): Promise<User[]> {
    const col = UsersService.USER_SORT_MAP[opts.sortBy ?? ''];
    const direction: 'ASC' | 'DESC' = opts.sortDir === 'desc' ? 'DESC' : 'ASC';
    return this.userRepo.find({
      where: { deletedAt: IsNull() },
      order: col
        ? ({ [col]: direction } as any)
        : { nom: 'ASC', prenom: 'ASC' },
    });
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
