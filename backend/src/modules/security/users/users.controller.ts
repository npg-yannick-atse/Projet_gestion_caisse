import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignProfilDto } from './dto/profil.dto';
import { AffectationEnMasseDto } from './dto/affectation-masse.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';
import { AuthorizationService } from '../authorization.service';

/**
 * Sécurité : modèle « une permission par action » (cf. migration 0040).
 *  - Mutations (création, modification, suppression, attribution de droits) : ADMIN_USER.
 *  - Lecture des droits d'AUTRUI (profils, divisions, natures, permissions) : UTILISATEUR_VOIR.
 *    Consulter SES PROPRES droits reste toujours autorisé (le front en a besoin partout
 *    pour afficher menus et boutons).
 *  - La liste des utilisateurs et leurs rôles restent lisibles par tout utilisateur
 *    authentifié : ils servent d'annuaire (affichage des noms de demandeur, validateur,
 *    caissier, gestionnaire…) dans presque tous les écrans.
 */
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

  /** Consulter les droits d'un utilisateur : soi-même toujours, autrui sur permission. */
  private async assertPeutVoirDroits(cibleId: string, user: JwtPayload, action: string) {
    if (String(cibleId) === String(user.sub)) return;
    await this.authz.assertPermission(user.sub, 'UTILISATEUR_VOIR', action);
  }

  @Post()
  @ApiOperation({ summary: 'Creer un utilisateur' })
  async create(@Body() dto: CreateUserDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'ADMIN_USER', 'créer un utilisateur');
    return this.usersService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les utilisateurs actifs (recherche + tri en base)' })
  findAll(
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('statut') statut?: string,
  ) {
    return this.usersService.findAll({
      search,
      sortBy,
      sortDir: sortDir === 'asc' ? 'asc' : sortDir === 'desc' ? 'desc' : undefined,
      statut: statut === 'ACTIF' || statut === 'INACTIF' ? statut : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un utilisateur par id' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre a jour un utilisateur' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(user.sub, 'ADMIN_USER', 'modifier un utilisateur');
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer (soft-delete) un utilisateur' })
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'ADMIN_USER', 'supprimer un utilisateur');
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
  async getEffectivePermissions(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.assertPeutVoirDroits(id, user, "consulter les permissions d'un utilisateur");
    return [...(await this.authz.getEffectivePermissions(id))];
  }

  @Post(':id/roles/:roleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Attribuer un rôle à un utilisateur' })
  async assignRole(
    @Param('id') id: string,
    @Param('roleId') roleId: string,
    @CurrentUser() user: JwtPayload,
    @Ip() ip: string,
  ) {
    await this.authz.assertPermission(user.sub, 'ADMIN_USER', 'attribuer un rôle');
    if (String(id) === String(user.sub)) {
      throw new ForbiddenException(
        "Vous ne pouvez pas modifier vos propres rôles. Demandez à un autre administrateur.",
      );
    }
    await this.usersService.assignRole(id, roleId, user.sub, ip);
  }

  @Delete(':id/roles/:roleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Retirer un rôle d'un utilisateur" })
  async removeRole(
    @Param('id') id: string,
    @Param('roleId') roleId: string,
    @CurrentUser() user: JwtPayload,
    @Ip() ip: string,
  ) {
    await this.authz.assertPermission(user.sub, 'ADMIN_USER', 'retirer un rôle');
    if (String(id) === String(user.sub)) {
      throw new ForbiddenException(
        "Vous ne pouvez pas modifier vos propres rôles. Demandez à un autre administrateur.",
      );
    }
    await this.usersService.removeRole(id, roleId, user.sub, ip);
  }

  // ---------- Profils d'un utilisateur ----------

  @Get(':id/profils')
  @ApiOperation({ summary: 'Lister les profils attribués à un utilisateur' })
  async getProfils(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.assertPeutVoirDroits(id, user, "consulter les profils d'un utilisateur");
    return this.usersService.getProfils(id);
  }

  @Post(':id/profils/:profilId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Attribuer un profil à un utilisateur' })
  async assignProfil(
    @Param('id') id: string,
    @Param('profilId') profilId: string,
    // Période de validité optionnelle : corps absent ou vide = profil permanent,
    // ce qui préserve le comportement des appels existants (et du mobile).
    @Body() body: AssignProfilDto | undefined,
    @CurrentUser() user: JwtPayload,
    @Ip() ip: string,
  ) {
    await this.authz.assertPermission(user.sub, 'ADMIN_USER', 'attribuer un profil');
    if (String(id) === String(user.sub)) {
      throw new ForbiddenException(
        'Vous ne pouvez pas modifier vos propres profils. Demandez à un autre administrateur.',
      );
    }
    await this.usersService.assignProfil(id, profilId, user.sub, ip, {
      dateDebut: body?.dateDebut ?? null,
      dateFin: body?.dateFin ?? null,
    });
  }

  @Delete(':id/profils/:profilId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Retirer un profil d'un utilisateur" })
  async removeProfil(
    @Param('id') id: string,
    @Param('profilId') profilId: string,
    @CurrentUser() user: JwtPayload,
    @Ip() ip: string,
  ) {
    await this.authz.assertPermission(user.sub, 'ADMIN_USER', 'retirer un profil');
    if (String(id) === String(user.sub)) {
      throw new ForbiddenException(
        'Vous ne pouvez pas modifier vos propres profils. Demandez à un autre administrateur.',
      );
    }
    await this.usersService.removeProfil(id, profilId, user.sub, ip);
  }

  // ---------- Accès division (restitutions) ----------

  @Get(':id/divisions')
  @ApiOperation({ summary: "Lister les divisions auxquelles l'utilisateur a accès" })
  async getDivisions(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.assertPeutVoirDroits(id, user, "consulter les divisions d'un utilisateur");
    return this.usersService.getDivisionAccess(id);
  }

  /* Affectation par ENSEMBLE : sert au « tout sélectionner », qui ferait sinon
     autant de requêtes que d'éléments — et laisserait un état à moitié appliqué
     si l'une d'elles échouait. */

  @Put(':id/divisions')
  @ApiOperation({ summary: 'Remplacer les divisions accessibles à un utilisateur' })
  async setDivisions(
    @Param('id') id: string,
    @Body() dto: AffectationEnMasseDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(user.sub, 'ADMIN_USER', 'modifier les divisions accessibles');
    return this.usersService.setDivisions(id, dto.ids ?? [], user.sub);
  }

  @Put(':id/natures-operation')
  @ApiOperation({ summary: 'Remplacer les natures autorisées à un utilisateur' })
  async setNaturesOperation(
    @Param('id') id: string,
    @Body() dto: AffectationEnMasseDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(user.sub, 'ADMIN_USER', 'modifier les natures autorisées');
    return this.usersService.setNaturesOperation(id, dto.ids ?? [], user.sub);
  }

  @Put(':id/cost-centers')
  @ApiOperation({ summary: 'Remplacer les centres de coût autorisés à un utilisateur' })
  async setCostCenters(
    @Param('id') id: string,
    @Body() dto: AffectationEnMasseDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(user.sub, 'ADMIN_USER', 'modifier les centres de coût autorisés');
    return this.usersService.setCostCenters(id, dto.ids ?? [], user.sub);
  }

  @Post(':id/divisions/:divisionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Donner accès à une division' })
  async assignDivision(
    @Param('id') id: string,
    @Param('divisionId') divisionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(user.sub, 'ADMIN_USER', 'donner accès à une division');
    await this.usersService.assignDivision(id, divisionId, user.sub);
  }

  @Delete(':id/divisions/:divisionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Retirer l'accès à une division" })
  async removeDivision(
    @Param('id') id: string,
    @Param('divisionId') divisionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(user.sub, 'ADMIN_USER', "retirer l'accès à une division");
    await this.usersService.removeDivision(id, divisionId);
  }

  // ---------- Centres de coût autorisés (imputation des bons) ----------

  /**
   * Ces trois routes manquaient : `sec_user_cost_center` était LUE par le
   * périmètre de création de bon, mais rien ne l'écrivait. Autoriser un centre
   * de coût à quelqu'un supposait donc de passer par sa direction — tout ou
   * rien — ou d'écrire en base à la main.
   */
  @Get(':id/cost-centers')
  @ApiOperation({ summary: "Lister les centres de coût autorisés en propre à l'utilisateur" })
  async getCostCenters(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.assertPeutVoirDroits(id, user, "consulter les centres de coût d'un utilisateur");
    return this.usersService.getCostCenterAccess(id);
  }

  @Post(':id/cost-centers/:costCenterId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Autoriser un centre de coût' })
  async assignCostCenter(
    @Param('id') id: string,
    @Param('costCenterId') costCenterId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(user.sub, 'ADMIN_USER', 'autoriser un centre de coût');
    await this.usersService.assignCostCenter(id, costCenterId, user.sub);
  }

  @Delete(':id/cost-centers/:costCenterId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Retirer un centre de coût autorisé' })
  async removeCostCenter(
    @Param('id') id: string,
    @Param('costCenterId') costCenterId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(user.sub, 'ADMIN_USER', 'retirer un centre de coût autorisé');
    await this.usersService.removeCostCenter(id, costCenterId);
  }

  // ---------- Natures d'opération autorisées (création de bons) ----------

  @Get(':id/natures-operation')
  @ApiOperation({ summary: "Lister les natures d'opération autorisées pour l'utilisateur" })
  async getNatureOperations(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.assertPeutVoirDroits(id, user, "consulter les natures d'opération d'un utilisateur");
    return this.usersService.getNatureOperationAccess(id);
  }

  @Post(':id/natures-operation/:natureId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Autoriser une nature d'opération" })
  async assignNatureOperation(
    @Param('id') id: string,
    @Param('natureId') natureId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(
      user.sub,
      'ADMIN_USER',
      "autoriser une nature d'opération",
    );
    await this.usersService.assignNatureOperation(id, natureId, user.sub);
  }

  @Delete(':id/natures-operation/:natureId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Retirer une nature d'opération autorisée" })
  async removeNatureOperation(
    @Param('id') id: string,
    @Param('natureId') natureId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(
      user.sub,
      'ADMIN_USER',
      "retirer une nature d'opération autorisée",
    );
    await this.usersService.removeNatureOperation(id, natureId);
  }
}
