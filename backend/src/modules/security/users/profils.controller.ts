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
import { ProfilsService } from './profils.service';
import { CreateProfilDto, UpdateProfilDto } from './dto/profil.dto';
import { GenerationDto } from './dto/generation.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';
import { AuthorizationService } from '../authorization.service';

/**
 * Sécurité : gestion des profils sur PROFIL_GERER, composition d'un profil (ajout /
 * retrait de permissions) sur ADMIN_ROLE — attribuer une permission reste un acte
 * d'administration du référentiel de droits (cf. migration 0040).
 */
@ApiTags('Security / Profils')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('profils')
export class ProfilsController {
  constructor(
    private readonly profilsService: ProfilsService,
    private readonly authz: AuthorizationService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Créer un profil' })
  async createProfil(@Body() dto: CreateProfilDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'PROFIL_GERER', 'créer un profil');
    return this.profilsService.createProfil(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les profils actifs' })
  findAllProfils() {
    return this.profilsService.findAllProfils();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un profil par id' })
  findProfil(@Param('id') id: string) {
    return this.profilsService.findProfil(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un profil' })
  async updateProfil(
    @Param('id') id: string,
    @Body() dto: UpdateProfilDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(user.sub, 'PROFIL_GERER', 'modifier un profil');
    return this.profilsService.updateProfil(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer (désactiver) un profil' })
  async removeProfil(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'PROFIL_GERER', 'supprimer un profil');
    await this.profilsService.removeProfil(id);
  }

  // Profil ↔ Permission
  @Post('generer-depuis-role/:roleId')
  @ApiOperation({ summary: "Créer un profil portant les permissions d'un rôle" })
  async genererDepuisRole(
    @Param('roleId') roleId: string,
    @Body() dto: GenerationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(user.sub, 'PROFIL_GERER', 'générer un profil depuis un rôle');
    return this.profilsService.genererDepuisRole(roleId, dto.code, dto.libelle, user.sub);
  }

  @Get(':profilId/permissions')
  @ApiOperation({ summary: "Lister les permissions d'un profil" })
  getProfilPermissions(@Param('profilId') profilId: string) {
    return this.profilsService.getProfilPermissions(profilId);
  }

  @Post(':profilId/permissions/:permissionId')
  @ApiOperation({ summary: 'Assigner une permission à un profil' })
  async assignPermission(
    @Param('profilId') profilId: string,
    @Param('permissionId') permissionId: string,
    @CurrentUser() user: JwtPayload,
    @Ip() ip: string,
  ) {
    await this.authz.assertPermission(
      user.sub,
      'ADMIN_ROLE',
      'assigner une permission à un profil',
    );
    return this.profilsService.assignPermissionToProfil(profilId, permissionId, user.sub, ip);
  }

  @Delete(':profilId/permissions/:permissionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Retirer une permission d'un profil" })
  async removePermission(
    @Param('profilId') profilId: string,
    @Param('permissionId') permissionId: string,
    @CurrentUser() user: JwtPayload,
    @Ip() ip: string,
  ) {
    await this.authz.assertPermission(
      user.sub,
      'ADMIN_ROLE',
      "retirer une permission d'un profil",
    );
    await this.profilsService.removePermissionFromProfil(profilId, permissionId, user.sub, ip);
  }
}
