import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../entities/role.entity';
import { Permission } from '../entities/permission.entity';
import { RolePermission } from '../entities/role-permission.entity';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { CreatePermissionDto, UpdatePermissionDto } from './dto/permission.dto';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
    @InjectRepository(RolePermission)
    private readonly rolePermissionRepo: Repository<RolePermission>,
  ) {}

  async createRole(dto: CreateRoleDto): Promise<Role> {
    const existing = await this.roleRepo.findOne({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException(`Rôle avec le code ${dto.code} existe déjà`);
    }

    const role = this.roleRepo.create(dto);
    return this.roleRepo.save(role);
  }

  async createPermission(dto: CreatePermissionDto): Promise<Permission> {
    const existing = await this.permissionRepo.findOne({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException(`Permission avec le code ${dto.code} existe déjà`);
    }

    const permission = this.permissionRepo.create(dto);
    return this.permissionRepo.save(permission);
  }

  async findAllRoles(): Promise<Role[]> {
    return this.roleRepo.find({
      where: { estActif: true },
      order: { libelle: 'ASC' },
    });
  }

  async findAllPermissions(): Promise<Permission[]> {
    return this.permissionRepo.find({
      where: { estActif: true },
      order: { module: 'ASC', code: 'ASC' },
    });
  }

  async findRole(id: string): Promise<Role> {
    const role = await this.roleRepo.findOne({ where: { id } });
    if (!role) throw new NotFoundException(`Rôle ${id} introuvable`);
    return role;
  }

  async findPermission(id: string): Promise<Permission> {
    const permission = await this.permissionRepo.findOne({ where: { id } });
    if (!permission) throw new NotFoundException(`Permission ${id} introuvable`);
    return permission;
  }

  async updateRole(id: string, dto: UpdateRoleDto): Promise<Role> {
    const role = await this.findRole(id);

    if (role.estSysteme && dto.code) {
      throw new BadRequestException('Impossible de modifier le code d\'un rôle système');
    }

    if (dto.code && dto.code !== role.code) {
      const existing = await this.roleRepo.findOne({ where: { code: dto.code } });
      if (existing) {
        throw new ConflictException(`Rôle avec le code ${dto.code} existe déjà`);
      }
    }

    Object.assign(role, dto);
    return this.roleRepo.save(role);
  }

  async updatePermission(id: string, dto: UpdatePermissionDto): Promise<Permission> {
    const permission = await this.findPermission(id);

    if (dto.code && dto.code !== permission.code) {
      const existing = await this.permissionRepo.findOne({ where: { code: dto.code } });
      if (existing) {
        throw new ConflictException(`Permission avec le code ${dto.code} existe déjà`);
      }
    }

    Object.assign(permission, dto);
    return this.permissionRepo.save(permission);
  }

  async assignPermissionToRole(roleId: string, permissionId: string): Promise<RolePermission> {
    await this.findRole(roleId);
    await this.findPermission(permissionId);

    const existing = await this.rolePermissionRepo.findOne({
      where: { roleId, permissionId },
    });
    if (existing) {
      throw new ConflictException('Permission déjà assignée à ce rôle');
    }

    const rp = this.rolePermissionRepo.create({ roleId, permissionId });
    return this.rolePermissionRepo.save(rp);
  }

  async removePermissionFromRole(roleId: string, permissionId: string): Promise<void> {
    await this.findRole(roleId);
    await this.findPermission(permissionId);

    const result = await this.rolePermissionRepo.delete({
      roleId,
      permissionId,
    });

    if (result.affected === 0) {
      throw new NotFoundException('Association rôle-permission introuvable');
    }
  }

  async getRolePermissions(roleId: string): Promise<Permission[]> {
    await this.findRole(roleId);

    const rolePermissions = await this.rolePermissionRepo.find({
      where: { roleId },
      relations: ['permission'],
    });

    return rolePermissions.map(rp => rp.permission);
  }

  async removeRole(id: string): Promise<void> {
    const role = await this.findRole(id);

    if (role.estSysteme) {
      throw new BadRequestException('Impossible de supprimer un rôle système');
    }

    role.estActif = false;
    await this.roleRepo.save(role);
  }

  async removePermission(id: string): Promise<void> {
    const permission = await this.findPermission(id);
    permission.estActif = false;
    await this.permissionRepo.save(permission);
  }
}
