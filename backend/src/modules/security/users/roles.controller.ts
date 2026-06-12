import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { CreatePermissionDto, UpdatePermissionDto, AssignPermissionToRoleDto, RemovePermissionFromRoleDto } from './dto/permission.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';

@ApiTags('Security / Roles & Permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  // Rôles
  @Post()
  @ApiOperation({ summary: 'Créer un rôle' })
  createRole(@Body() dto: CreateRoleDto) {
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
  updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.updateRole(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer un rôle' })
  async removeRole(@Param('id') id: string) {
    await this.rolesService.removeRole(id);
  }

  // Permissions
  @Post('permissions')
  @ApiOperation({ summary: 'Créer une permission' })
  createPermission(@Body() dto: CreatePermissionDto) {
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
  updatePermission(@Param('id') id: string, @Body() dto: UpdatePermissionDto) {
    return this.rolesService.updatePermission(id, dto);
  }

  @Delete('permissions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une permission' })
  async removePermission(@Param('id') id: string) {
    await this.rolesService.removePermission(id);
  }

  // Role-Permission associations
  @Post(':roleId/permissions/:permissionId')
  @ApiOperation({ summary: 'Assigner une permission à un rôle' })
  assignPermission(@Param('roleId') roleId: string, @Param('permissionId') permissionId: string) {
    return this.rolesService.assignPermissionToRole(roleId, permissionId);
  }

  @Delete(':roleId/permissions/:permissionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Retirer une permission d\'un rôle' })
  async removePermissionFromRole(@Param('roleId') roleId: string, @Param('permissionId') permissionId: string) {
    await this.rolesService.removePermissionFromRole(roleId, permissionId);
  }

  @Get(':roleId/permissions')
  @ApiOperation({ summary: 'Lister les permissions d\'un rôle' })
  getRolePermissions(@Param('roleId') roleId: string) {
    return this.rolesService.getRolePermissions(roleId);
  }
}
