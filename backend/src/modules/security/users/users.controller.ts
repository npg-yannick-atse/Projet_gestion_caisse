import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';
import { Roles } from '@modules/auth/decorators/roles.decorator';
import { AuthorizationService } from '../authorization.service';

@ApiTags('Security / Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@UseInterceptors(ClassSerializerInterceptor)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly authz: AuthorizationService,
  ) {}

  @Post()
  @Roles('ADMINISTRATEUR')
  @ApiOperation({ summary: 'Creer un utilisateur' })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les utilisateurs actifs (tri serveur)' })
  findAll(@Query('sortBy') sortBy?: string, @Query('sortDir') sortDir?: string) {
    return this.usersService.findAll({
      sortBy,
      sortDir: sortDir === 'asc' ? 'asc' : sortDir === 'desc' ? 'desc' : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un utilisateur par id' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMINISTRATEUR')
  @ApiOperation({ summary: 'Mettre a jour un utilisateur' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMINISTRATEUR')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer (soft-delete) un utilisateur' })
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.usersService.softDelete(id, user.sub);
  }

  // ---------- Rôles d'un utilisateur ----------

  @Get(':id/roles')
  @ApiOperation({ summary: 'Lister les rôles attribués à un utilisateur (assignés uniquement)' })
  getRoles(@Param('id') id: string) {
    return this.usersService.getRoles(id);
  }

  @Get(':id/effective-roles')
  @ApiOperation({ summary: 'Rôles effectifs (assignés + délégués par un intérim actif)' })
  getEffectiveRoles(@Param('id') id: string) {
    return this.authz.getEffectiveRoles(id);
  }

  @Get(':id/permissions')
  @ApiOperation({ summary: 'Permissions effectives (rôles + profils + extra + intérim)' })
  async getEffectivePermissions(@Param('id') id: string) {
    return [...(await this.authz.getEffectivePermissions(id))];
  }

  @Post(':id/roles/:roleId')
  @Roles('ADMINISTRATEUR')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Attribuer un rôle à un utilisateur' })
  async assignRole(
    @Param('id') id: string,
    @Param('roleId') roleId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (String(id) === String(user.sub)) {
      throw new ForbiddenException(
        "Vous ne pouvez pas modifier vos propres rôles. Demandez à un autre administrateur.",
      );
    }
    await this.usersService.assignRole(id, roleId, user.sub);
  }

  @Delete(':id/roles/:roleId')
  @Roles('ADMINISTRATEUR')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Retirer un rôle d'un utilisateur" })
  async removeRole(
    @Param('id') id: string,
    @Param('roleId') roleId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (String(id) === String(user.sub)) {
      throw new ForbiddenException(
        "Vous ne pouvez pas modifier vos propres rôles. Demandez à un autre administrateur.",
      );
    }
    await this.usersService.removeRole(id, roleId);
  }

  // ---------- Profils d'un utilisateur ----------

  @Get(':id/profils')
  @ApiOperation({ summary: 'Lister les profils attribués à un utilisateur' })
  getProfils(@Param('id') id: string) {
    return this.usersService.getProfils(id);
  }

  @Post(':id/profils/:profilId')
  @Roles('ADMINISTRATEUR')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Attribuer un profil à un utilisateur' })
  async assignProfil(
    @Param('id') id: string,
    @Param('profilId') profilId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (String(id) === String(user.sub)) {
      throw new ForbiddenException(
        'Vous ne pouvez pas modifier vos propres profils. Demandez à un autre administrateur.',
      );
    }
    await this.usersService.assignProfil(id, profilId, user.sub);
  }

  @Delete(':id/profils/:profilId')
  @Roles('ADMINISTRATEUR')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Retirer un profil d'un utilisateur" })
  async removeProfil(
    @Param('id') id: string,
    @Param('profilId') profilId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (String(id) === String(user.sub)) {
      throw new ForbiddenException(
        'Vous ne pouvez pas modifier vos propres profils. Demandez à un autre administrateur.',
      );
    }
    await this.usersService.removeProfil(id, profilId);
  }
}
