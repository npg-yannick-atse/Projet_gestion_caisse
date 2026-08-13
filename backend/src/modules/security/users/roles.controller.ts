import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GenerationDto } from './dto/generation.dto';
import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { CreatePermissionDto, UpdatePermissionDto, AssignPermissionToRoleDto, RemovePermissionFromRoleDto } from './dto/permission.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';
import { AuthorizationService } from '../authorization.service';

/**
 * Sécurité : toute mutation du référentiel de droits exige ADMIN_ROLE (cf. migration 0040).
 * Les lectures (liste des rôles, des permissions, permissions d'un rôle) restent
 * ouvertes aux utilisateurs authentifiés : elles alimentent les libellés et les
 * sélecteurs de plusieurs écrans (intérims, utilisateurs, profils).
 */
@ApiTags('Security / Roles & Permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('roles')
export class RolesController {
  constructor(
    private readonly rolesService: RolesService,
    private readonly authz: AuthorizationService,
  ) {}

  // Rôles
  @Post()
  @ApiOperation({ summary: 'Créer un rôle' })
  async createRole(@Body() dto: CreateRoleDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'ADMIN_ROLE', 'créer un rôle');
    return this.rolesService.createRole(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les rôles actifs' })
  findAllRoles() {
    return this.rolesService.findAllRoles();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un rôle par id' })
  findRole(@Param('id') id: string) {
    return this.rolesService.findRole(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un rôle' })
  async updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(user.sub, 'ADMIN_ROLE', 'modifier un rôle');
    return this.rolesService.updateRole(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer un rôle' })
  async removeRole(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'ADMIN_ROLE', 'supprimer un rôle');
    await this.rolesService.removeRole(id);
  }

  // Permissions
  @Post('generer-depuis-profil/:profilId')
  @ApiOperation({ summary: "Créer un rôle portant les permissions d'un profil" })
  async genererDepuisProfil(
    @Param('profilId') profilId: string,
    @Body() dto: GenerationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(user.sub, 'ADMIN_ROLE', 'générer un rôle depuis un profil');
    return this.rolesService.genererDepuisProfil(profilId, dto.code, dto.libelle, user.sub);
  }

  @Post('permissions')
  @ApiOperation({ summary: 'Créer une permission' })
  async createPermission(@Body() dto: CreatePermissionDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'ADMIN_ROLE', 'créer une permission');
    return this.rolesService.createPermission(dto);
  }

  @Get('permissions/list')
  @ApiOperation({ summary: 'Lister les permissions actives' })
  findAllPermissions() {
    return this.rolesService.findAllPermissions();
  }

  @Get('permissions/:id')
  @ApiOperation({ summary: 'Obtenir une permission par id' })
  findPermission(@Param('id') id: string) {
    return this.rolesService.findPermission(id);
  }

  @Patch('permissions/:id')
  @ApiOperation({ summary: 'Mettre à jour une permission' })
  async updatePermission(
    @Param('id') id: string,
    @Body() dto: UpdatePermissionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(user.sub, 'ADMIN_ROLE', 'modifier une permission');
    return this.rolesService.updatePermission(id, dto);
  }

  @Delete('permissions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une permission' })
  async removePermission(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'ADMIN_ROLE', 'supprimer une permission');
    await this.rolesService.removePermission(id);
  }

  // Role-Permission associations
  @Post(':roleId/permissions/:permissionId')
  @ApiOperation({ summary: 'Assigner une permission à un rôle' })
  async assignPermission(
    @Param('roleId') roleId: string,
    @Param('permissionId') permissionId: string,
    @CurrentUser() user: JwtPayload,
    @Ip() ip: string,
  ) {
    await this.authz.assertPermission(user.sub, 'ADMIN_ROLE', 'assigner une permission à un rôle');
    return this.rolesService.assignPermissionToRole(roleId, permissionId, user.sub, ip);
  }

  @Delete(':roleId/permissions/:permissionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Retirer une permission d\'un rôle' })
  async removePermissionFromRole(
    @Param('roleId') roleId: string,
    @Param('permissionId') permissionId: string,
    @CurrentUser() user: JwtPayload,
    @Ip() ip: string,
  ) {
    await this.authz.assertPermission(user.sub, 'ADMIN_ROLE', 'retirer une permission d\'un rôle');
    await this.rolesService.removePermissionFromRole(roleId, permissionId, user.sub, ip);
  }

  @Get(':roleId/permissions')
  @ApiOperation({ summary: 'Lister les permissions d\'un rôle' })
  getRolePermissions(@Param('roleId') roleId: string) {
    return this.rolesService.getRolePermissions(roleId);
  }
}
