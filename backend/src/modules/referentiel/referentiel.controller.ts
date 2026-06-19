import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReferentielService } from './referentiel.service';
import { TypePartenaire } from './entities/partenaire.entity';
import { CreatePartenaireDto } from './dto/create-partenaire.dto';
import { CreateCostCenterDto } from './dto/create-cost-center.dto';
import { CreateNatureOperationDto } from './dto/create-nature-operation.dto';
import { UpdateNatureOperationDto } from './dto/update-nature-operation.dto';
import { CreatePlanComptableDto } from './dto/create-plan-comptable.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';
import { Roles } from '@modules/auth/decorators/roles.decorator';

@ApiTags('Référentiel')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ReferentielController {
  constructor(private readonly referentiel: ReferentielService) {}

  @Get('partenaires')
  @ApiOperation({ summary: 'Lister les partenaires (clients/fournisseurs) actifs' })
  listPartenaires(@Query('type') type?: TypePartenaire) {
    return this.referentiel.listPartenaires(type);
  }

  @Post('partenaires')
  @Roles('ADMINISTRATEUR')
  @ApiOperation({ summary: 'Créer un partenaire (client / fournisseur)' })
  createPartenaire(@Body() dto: CreatePartenaireDto, @CurrentUser() user: JwtPayload) {
    return this.referentiel.createPartenaire(dto, user.sub);
  }

  @Get('partenaires/:id')
  @ApiOperation({ summary: 'Obtenir un partenaire' })
  findPartenaire(@Param('id') id: string) {
    return this.referentiel.findPartenaire(id);
  }

  @Delete('partenaires/:id')
  @Roles('ADMINISTRATEUR')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Désactiver un partenaire (soft-delete)' })
  async deletePartenaire(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.referentiel.deletePartenaire(id, user.sub);
  }

  @Get('cost-centers')
  @ApiOperation({ summary: 'Lister les centres de coût actifs' })
  listCostCenters() {
    return this.referentiel.listCostCenters();
  }

  @Post('cost-centers')
  @Roles('ADMINISTRATEUR')
  @ApiOperation({ summary: 'Créer un centre de coût' })
  createCostCenter(@Body() dto: CreateCostCenterDto, @CurrentUser() user: JwtPayload) {
    return this.referentiel.createCostCenter(dto, user.sub);
  }

  @Delete('cost-centers/:id')
  @Roles('ADMINISTRATEUR')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Désactiver un centre de coût (soft-delete)' })
  async deleteCostCenter(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.referentiel.deleteCostCenter(id, user.sub);
  }

  @Get('type-bons')
  @ApiOperation({ summary: 'Lister les types de bon actifs' })
  listTypeBons() {
    return this.referentiel.listTypeBons();
  }

  @Get('natures-operation')
  @ApiOperation({ summary: 'Lister les natures d\'opération actives' })
  listNaturesOperation() {
    return this.referentiel.listNaturesOperation();
  }

  @Post('natures-operation')
  @Roles('ADMINISTRATEUR')
  @ApiOperation({ summary: 'Créer une nature d\'opération' })
  createNatureOperation(@Body() dto: CreateNatureOperationDto, @CurrentUser() user: JwtPayload) {
    return this.referentiel.createNatureOperation(dto, user.sub);
  }

  @Patch('natures-operation/:id')
  @Roles('ADMINISTRATEUR')
  @ApiOperation({ summary: 'Modifier une nature d\'opération' })
  updateNatureOperation(
    @Param('id') id: string,
    @Body() dto: UpdateNatureOperationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.referentiel.updateNatureOperation(id, dto, user.sub);
  }

  @Delete('natures-operation/:id')
  @Roles('ADMINISTRATEUR')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Désactiver une nature d\'opération (soft-delete)' })
  async deleteNatureOperation(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.referentiel.deleteNatureOperation(id, user.sub);
  }

  @Get('natures-comptable')
  @ApiOperation({ summary: 'Lister les natures comptables actives' })
  listNaturesComptable() {
    return this.referentiel.listNaturesComptable();
  }

  @Get('plan-comptable')
  @ApiOperation({ summary: 'Lister le plan comptable actif' })
  listPlanComptable() {
    return this.referentiel.listPlanComptable();
  }

  @Post('plan-comptable')
  @Roles('ADMINISTRATEUR')
  @ApiOperation({ summary: 'Créer un compte du plan comptable' })
  createPlanComptable(@Body() dto: CreatePlanComptableDto, @CurrentUser() user: JwtPayload) {
    return this.referentiel.createPlanComptable(dto, user.sub);
  }

  @Delete('plan-comptable/:id')
  @Roles('ADMINISTRATEUR')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Désactiver un compte (soft-delete)' })
  async deletePlanComptable(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.referentiel.deletePlanComptable(id, user.sub);
  }

  @Get('sites')
  @ApiOperation({ summary: 'Lister les sites actifs' })
  listSites() {
    return this.referentiel.listSites();
  }
}
