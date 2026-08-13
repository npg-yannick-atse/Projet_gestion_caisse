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
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProfilsService } from './profils.service';
import { CreateProfilDto, UpdateProfilDto } from './dto/profil.dto';
import { GenerationDto } from './dto/generation.dto';
import { AffectationEnMasseDto } from './dto/affectation-masse.dto';
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

  @Post('generer-depuis-utilisateur/:userId')
  @ApiOperation({
    summary: "Créer un profil rassemblant toutes les permissions effectives d'un utilisateur",
  })
  async genererDepuisUtilisateur(
    @Param('userId') userId: string,
    @Body() dto: GenerationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(
      user.sub,
      'PROFIL_GERER',
      "générer un profil depuis les droits d'un utilisateur",
    );
    return this.profilsService.genererDepuisUtilisateur(
      userId,
      dto.code,
      dto.libelle,
      user.sub,
      this.authz,
    );
  }

  /* ---- Périmètres portés par le profil (migration 0067) -------------------
     Trois paires lecture / écriture. L'écriture reçoit la sélection COMPLÈTE :
     un aller-retour par case laisserait la base et l'écran en désaccord si l'un
     d'eux échouait. La lecture reste ouverte, comme celle des permissions —
     l'écran de création de bon en dépend. */

  @Get(':profilId/cost-centers')
  @ApiOperation({ summary: 'Centres de coût portés par un profil' })
  getProfilCostCenters(@Param('profilId') profilId: string) {
    return this.profilsService.getPerimetreProfil(profilId, 'cost-centers');
  }

  @Put(':profilId/cost-centers')
  @ApiOperation({ summary: 'Choisir les centres de coût portés par un profil' })
  async setProfilCostCenters(
    @Param('profilId') profilId: string,
    @Body() dto: AffectationEnMasseDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(user.sub, 'PROFIL_GERER', 'modifier les centres de coût d’un profil');
    return this.profilsService.setPerimetreProfil(profilId, 'cost-centers', dto.ids ?? [], user.sub);
  }

  @Get(':profilId/divisions')
  @ApiOperation({ summary: 'Divisions portées par un profil' })
  getProfilDivisions(@Param('profilId') profilId: string) {
    return this.profilsService.getPerimetreProfil(profilId, 'divisions');
  }

  @Put(':profilId/divisions')
  @ApiOperation({ summary: 'Choisir les divisions portées par un profil' })
  async setProfilDivisions(
    @Param('profilId') profilId: string,
    @Body() dto: AffectationEnMasseDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(user.sub, 'PROFIL_GERER', 'modifier les divisions d’un profil');
    return this.profilsService.setPerimetreProfil(profilId, 'divisions', dto.ids ?? [], user.sub);
  }

  @Get(':profilId/natures-operation')
  @ApiOperation({ summary: 'Natures portées par un profil' })
  getProfilNatures(@Param('profilId') profilId: string) {
    return this.profilsService.getPerimetreProfil(profilId, 'natures-operation');
  }

  @Put(':profilId/natures-operation')
  @ApiOperation({ summary: 'Choisir les natures portées par un profil' })
  async setProfilNatures(
    @Param('profilId') profilId: string,
    @Body() dto: AffectationEnMasseDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(user.sub, 'PROFIL_GERER', 'modifier les natures d’un profil');
    return this.profilsService.setPerimetreProfil(profilId, 'natures-operation', dto.ids ?? [], user.sub);
  }

  @Get(':profilId/roles')
  @ApiOperation({ summary: 'Rôles portés par un profil' })
  getProfilRoles(@Param('profilId') profilId: string) {
    return this.profilsService.getPerimetreProfil(profilId, 'roles');
  }

  @Put(':profilId/roles')
  @ApiOperation({ summary: 'Choisir les rôles portés par un profil' })
  async setProfilRoles(
    @Param('profilId') profilId: string,
    @Body() dto: AffectationEnMasseDto,
    @CurrentUser() user: JwtPayload,
  ) {
    // ADMIN_ROLE, comme pour attacher une permission — et pour une raison plus
    // forte : un profil portant SUPER_ADMIN rend administrateur quiconque le
    // reçoit. PROFIL_GERER, qui suffit à renommer un profil, serait trop faible.
    await this.authz.assertPermission(user.sub, 'ADMIN_ROLE', 'attacher un rôle à un profil');
    return this.profilsService.setPerimetreProfil(profilId, 'roles', dto.ids ?? [], user.sub);
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
