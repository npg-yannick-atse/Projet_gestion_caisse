import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ReferentielService } from './referentiel.service';
import { TypePartenaire } from './entities/partenaire.entity';
import { CreatePartenaireDto } from './dto/create-partenaire.dto';
import { UpdatePartenaireDto } from './dto/update-partenaire.dto';
import { CreateCostCenterDto } from './dto/create-cost-center.dto';
import { UpdateCostCenterDto } from './dto/update-cost-center.dto';
import { CreateNatureOperationDto } from './dto/create-nature-operation.dto';
import { UpdateNatureOperationDto } from './dto/update-nature-operation.dto';
import { CreatePlanComptableDto } from './dto/create-plan-comptable.dto';
import { CreatePaysDto, CreateDivisionDto } from './dto/pays.dto';
import { LierCostCentersDto, LierNaturesDto } from './dto/lier-nature-cost-center.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';
import { AuthorizationService } from '@modules/security/authorization.service';

/**
 * Sécurité : une permission par objet de référentiel pour les mutations
 * (PARTENAIRE_GERER, COST_CENTER_GERER, NATURE_OPERATION_GERER,
 * PLAN_COMPTABLE_GERER, PAYS_GERER — cf. migration 0040).
 *
 * Les LECTURES restent volontairement ouvertes à tout utilisateur authentifié :
 * partenaires, centres de coût, natures d'opération, pays, divisions et types de
 * bon alimentent les sélecteurs du formulaire de création de bon, sur le web
 * comme sur l'application mobile. Les verrouiller bloquerait les demandeurs.
 */
@ApiTags('Référentiel')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ReferentielController {
  constructor(
    private readonly referentiel: ReferentielService,
    private readonly authz: AuthorizationService,
  ) {}

  @Get('partenaires')
  @ApiOperation({ summary: 'Lister les partenaires (clients/fournisseurs) actifs' })
  listPartenaires(
    @Query('type') type?: TypePartenaire,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('limit') limit?: string,
  ) {
    return this.referentiel.listPartenaires(type, {
      search,
      sortBy,
      sortDir: sortDir === 'desc' ? 'desc' : sortDir === 'asc' ? 'asc' : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('partenaires')
  @ApiOperation({ summary: 'Créer un partenaire (client / fournisseur)' })
  async createPartenaire(@Body() dto: CreatePartenaireDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'PARTENAIRE_GERER', 'créer un partenaire');
    return this.referentiel.createPartenaire(dto, user.sub);
  }

  @Get('partenaires/:id')
  @ApiOperation({ summary: 'Obtenir un partenaire' })
  findPartenaire(@Param('id') id: string) {
    return this.referentiel.findPartenaire(id);
  }

  @Patch('partenaires/:id')
  @ApiOperation({ summary: 'Modifier un partenaire' })
  async updatePartenaire(@Param('id') id: string, @Body() dto: UpdatePartenaireDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'PARTENAIRE_GERER', 'modifier un partenaire');
    return this.referentiel.updatePartenaire(id, dto, user.sub);
  }

  @Delete('partenaires/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Désactiver un partenaire (soft-delete)' })
  async deletePartenaire(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'PARTENAIRE_GERER', 'supprimer un partenaire');
    await this.referentiel.deletePartenaire(id, user.sub);
  }

  @Get('cost-centers')
  @ApiOperation({ summary: 'Lister les centres de coût actifs' })
  listCostCenters(@Query('search') search?: string, @Query('sortBy') sortBy?: string, @Query('sortDir') sortDir?: string) {
    return this.referentiel.listCostCenters({
      search,
      sortBy,
      sortDir: sortDir === 'desc' ? 'desc' : sortDir === 'asc' ? 'asc' : undefined,
    });
  }

  @Post('cost-centers')
  @ApiOperation({ summary: 'Créer un centre de coût' })
  async createCostCenter(@Body() dto: CreateCostCenterDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'COST_CENTER_GERER', 'créer un centre de coût');
    return this.referentiel.createCostCenter(dto, user.sub);
  }

  @Patch('cost-centers/:id')
  @ApiOperation({ summary: 'Mettre à jour un centre de coût (code non modifiable)' })
  async updateCostCenter(
    @Param('id') id: string,
    @Body() dto: UpdateCostCenterDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(user.sub, 'COST_CENTER_GERER', 'modifier un centre de coût');
    return this.referentiel.updateCostCenter(id, dto, user.sub);
  }

  @Delete('cost-centers/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Désactiver un centre de coût (soft-delete)' })
  async deleteCostCenter(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'COST_CENTER_GERER', 'supprimer un centre de coût');
    await this.referentiel.deleteCostCenter(id, user.sub);
  }

  @Get('type-bons')
  @ApiOperation({ summary: 'Lister les types de bon actifs' })
  listTypeBons() {
    return this.referentiel.listTypeBons();
  }

  @Get('natures-operation')
  @ApiOperation({ summary: 'Lister les natures d\'opération actives' })
  listNaturesOperation(
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('limit') limit?: string,
  ) {
    return this.referentiel.listNaturesOperation({
      search,
      sortBy,
      sortDir: sortDir === 'desc' ? 'desc' : sortDir === 'asc' ? 'asc' : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('natures-operation')
  @ApiOperation({ summary: 'Créer une nature d\'opération' })
  async createNatureOperation(@Body() dto: CreateNatureOperationDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(
      user.sub,
      'NATURE_OPERATION_GERER',
      "créer une nature d'opération",
    );
    return this.referentiel.createNatureOperation(dto, user.sub);
  }

  @Patch('natures-operation/:id')
  @ApiOperation({ summary: 'Modifier une nature d\'opération' })
  async updateNatureOperation(
    @Param('id') id: string,
    @Body() dto: UpdateNatureOperationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(
      user.sub,
      'NATURE_OPERATION_GERER',
      "modifier une nature d'opération",
    );
    return this.referentiel.updateNatureOperation(id, dto, user.sub);
  }

  @Delete('natures-operation/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Désactiver une nature d\'opération (soft-delete)' })
  async deleteNatureOperation(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(
      user.sub,
      'NATURE_OPERATION_GERER',
      "supprimer une nature d'opération",
    );
    await this.referentiel.deleteNatureOperation(id, user.sub);
  }

  @Get('natures-comptable')
  @ApiOperation({ summary: 'Lister les natures comptables actives (recherche + tri en base)' })
  listNaturesComptable(
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('limit') limit?: string,
  ) {
    return this.referentiel.listNaturesComptable({
      search,
      sortBy,
      sortDir: sortDir === 'desc' ? 'desc' : sortDir === 'asc' ? 'asc' : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  /* ---- Liaison nature comptable ↔ centre de coût (migration 0065) ----------
     La même relation se lit et s'écrit des deux côtés : depuis une nature on
     choisit ses centres de coût, depuis un centre de coût on choisit ses
     natures. La lecture est ouverte à tous ; l'écriture exige NATURE_CC_LIER. */

  @Get('natures-comptable/:id/cost-centers')
  @ApiOperation({ summary: 'Centres de coût liés à une nature comptable' })
  costCentersDeNature(@Param('id') id: string) {
    return this.referentiel.costCentersDeNature(id);
  }

  @Put('natures-comptable/:id/cost-centers')
  @ApiOperation({ summary: 'Choisir les centres de coût d’une nature comptable' })
  async lierNatureAuxCostCenters(
    @Param('id') id: string,
    @Body() dto: LierCostCentersDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermissionStrict(
      user.sub,
      'NATURE_CC_LIER',
      'lier une nature comptable à des centres de coût',
    );
    return this.referentiel.lierNatureAuxCostCenters(id, dto.costCenterIds ?? [], user.sub);
  }

  @Get('cost-centers/:id/natures-comptable')
  @ApiOperation({ summary: 'Natures comptables liées à un centre de coût' })
  naturesDeCostCenter(@Param('id') id: string) {
    return this.referentiel.naturesDeCostCenter(id);
  }

  @Put('cost-centers/:id/natures-comptable')
  @ApiOperation({ summary: 'Choisir les natures comptables d’un centre de coût' })
  async lierCostCenterAuxNatures(
    @Param('id') id: string,
    @Body() dto: LierNaturesDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermissionStrict(
      user.sub,
      'NATURE_CC_LIER',
      'lier un centre de coût à des natures comptables',
    );
    return this.referentiel.lierCostCenterAuxNatures(id, dto.natureComptableIds ?? [], user.sub);
  }

  @Get('plan-comptable/stats')
  @ApiOperation({ summary: 'Compteurs du plan comptable par type de compte (GROUP BY en base)' })
  statsPlanComptable() {
    return this.referentiel.statsPlanComptable();
  }

  @Get('plan-comptable')
  @ApiOperation({ summary: 'Lister le plan comptable actif (recherche + filtre type + tri en base)' })
  @ApiQuery({ name: 'typeCompte', required: false })
  listPlanComptable(
    @Query('search') search?: string,
    @Query('typeCompte') typeCompte?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('limit') limit?: string,
  ) {
    return this.referentiel.listPlanComptable({
      search,
      typeCompte,
      sortBy,
      sortDir: sortDir === 'desc' ? 'desc' : sortDir === 'asc' ? 'asc' : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('plan-comptable')
  @ApiOperation({ summary: 'Créer un compte du plan comptable' })
  async createPlanComptable(@Body() dto: CreatePlanComptableDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(
      user.sub,
      'PLAN_COMPTABLE_GERER',
      'créer un compte du plan comptable',
    );
    return this.referentiel.createPlanComptable(dto, user.sub);
  }

  @Delete('plan-comptable/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Désactiver un compte (soft-delete)' })
  async deletePlanComptable(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(
      user.sub,
      'PLAN_COMPTABLE_GERER',
      'supprimer un compte du plan comptable',
    );
    await this.referentiel.deletePlanComptable(id, user.sub);
  }

  @Get('sites')
  @ApiOperation({ summary: 'Lister les sites actifs' })
  listSites() {
    return this.referentiel.listSites();
  }

  // ---------- Pays ----------
  @Get('pays')
  @ApiOperation({ summary: 'Lister les pays actifs' })
  listPays(@Query('search') search?: string, @Query('sortBy') sortBy?: string, @Query('sortDir') sortDir?: string) {
    return this.referentiel.listPays({
      search,
      sortBy,
      sortDir: sortDir === 'desc' ? 'desc' : sortDir === 'asc' ? 'asc' : undefined,
    });
  }

  @Post('pays')
  @ApiOperation({ summary: 'Créer un pays' })
  async createPays(@Body() dto: CreatePaysDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'PAYS_GERER', 'créer un pays');
    return this.referentiel.createPays(dto, user.sub);
  }

  @Delete('pays/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Désactiver un pays (soft-delete)' })
  async deletePays(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'PAYS_GERER', 'supprimer un pays');
    await this.referentiel.deletePays(id, user.sub);
  }

  // ---------- Division ----------
  @Get('divisions')
  @ApiOperation({ summary: 'Lister les divisions actives (filtre pays + recherche + tri en base)' })
  @ApiQuery({ name: 'paysId', required: false })
  listDivisions(
    @Query('paysId') paysId?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    return this.referentiel.listDivisions(paysId, {
      search,
      sortBy,
      sortDir: sortDir === 'desc' ? 'desc' : sortDir === 'asc' ? 'asc' : undefined,
    });
  }

  @Post('divisions')
  @ApiOperation({ summary: 'Créer une division' })
  async createDivision(@Body() dto: CreateDivisionDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'PAYS_GERER', 'créer une division');
    return this.referentiel.createDivision(dto, user.sub);
  }

  @Delete('divisions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Désactiver une division (soft-delete)' })
  async deleteDivision(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'PAYS_GERER', 'supprimer une division');
    await this.referentiel.deleteDivision(id, user.sub);
  }
}
