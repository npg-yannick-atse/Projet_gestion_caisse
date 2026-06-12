import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Profil } from '../entities/profil.entity';
import { Permission } from '../entities/permission.entity';
import { ProfilPermission } from '../entities/profil-permission.entity';
import { CreateProfilDto, UpdateProfilDto } from './dto/profil.dto';

@Injectable()
export class ProfilsService {
  constructor(
    @InjectRepository(Profil)
    private readonly profilRepo: Repository<Profil>,
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
    @InjectRepository(ProfilPermission)
    private readonly profilPermissionRepo: Repository<ProfilPermission>,
  ) {}

  async createProfil(dto: CreateProfilDto): Promise<Profil> {
    const existing = await this.profilRepo.findOne({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException(`Profil avec le code ${dto.code} existe déjà`);
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
      const existing = await this.profilRepo.findOne({ where: { code: dto.code } });
      if (existing) {
        throw new ConflictException(`Profil avec le code ${dto.code} existe déjà`);
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

  async getProfilPermissions(profilId: string): Promise<Permission[]> {
    await this.findProfil(profilId);
    const links = await this.profilPermissionRepo.find({
      where: { profilId },
      relations: ['permission'],
    });
    return links.map((l) => l.permission).filter((p) => p && p.estActif !== false);
  }

  async assignPermissionToProfil(profilId: string, permissionId: string): Promise<ProfilPermission> {
    await this.findProfil(profilId);
    const permission = await this.permissionRepo.findOne({ where: { id: permissionId } });
    if (!permission) throw new NotFoundException(`Permission ${permissionId} introuvable`);

    const existing = await this.profilPermissionRepo.findOne({ where: { profilId, permissionId } });
    if (existing) {
      throw new ConflictException('Permission déjà assignée à ce profil');
    }
    const pp = this.profilPermissionRepo.create({ profilId, permissionId });
    return this.profilPermissionRepo.save(pp);
  }

  async removePermissionFromProfil(profilId: string, permissionId: string): Promise<void> {
    await this.findProfil(profilId);
    const result = await this.profilPermissionRepo.delete({ profilId, permissionId });
    if (result.affected === 0) {
      throw new NotFoundException('Association profil-permission introuvable');
    }
  }
}
