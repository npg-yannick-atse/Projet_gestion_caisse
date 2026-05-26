import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const existing = await this.userRepo.findOne({
      where: [{ matricule: dto.matricule }, { email: dto.email }],
    });
    if (existing) {
      throw new ConflictException(
        existing.matricule === dto.matricule
          ? `Matricule deja utilise : ${dto.matricule}`
          : `Email deja utilise : ${dto.email}`,
      );
    }

    const motDePasseHash = await bcrypt.hash(dto.motDePasse, BCRYPT_ROUNDS);

    const user = this.userRepo.create({
      matricule: dto.matricule,
      nom: dto.nom,
      prenom: dto.prenom,
      email: dto.email.toLowerCase(),
      telephone: dto.telephone ?? null,
      motDePasseHash,
      directionId: dto.directionId ?? null,
      costCenterId: dto.costCenterId ?? null,
      estActif: dto.estActif ?? true,
    });
    return this.userRepo.save(user);
  }

  findAll(): Promise<User[]> {
    return this.userRepo.find({
      where: { deletedAt: IsNull() },
      order: { nom: 'ASC', prenom: 'ASC' },
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
