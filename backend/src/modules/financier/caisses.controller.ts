import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CaissesService } from './caisses.service';
import { CreateCaisseDto } from './dto/create-caisse.dto';
import { UpdateCaisseDto } from './dto/update-caisse.dto';
import { OpenCaisseDto } from './dto/open-caisse.dto';
import { CloseCaisseDto } from './dto/close-caisse.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';
import { AuthorizationService } from '@modules/security/authorization.service';

@ApiTags('Financier / Caisses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('caisses')
export class CaissesController {
  constructor(
    private readonly caissesService: CaissesService,
    private readonly authz: AuthorizationService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Créer une caisse (créée FERMÉE)' })
  async create(@Body() dto: CreateCaisseDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'CAISSE_MODIFIER', 'créer une caisse');
    return this.caissesService.create(dto, user.sub);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour une caisse' })
  async update(@Param('id') id: string, @Body() dto: UpdateCaisseDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'CAISSE_MODIFIER', 'modifier une caisse');
    return this.caissesService.update(id, dto, user.sub);
  }

  @Patch(':id/toggle-active')
  @ApiOperation({ summary: 'Activer / désactiver une caisse (refusée si OUVERTE et désactivation demandée)' })
  async toggleActive(
    @Param('id') id: string,
    @Body() dto: { estActif: boolean },
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(user.sub, 'CAISSE_MODIFIER', 'activer/désactiver une caisse');
    return this.caissesService.toggleActif(id, dto.estActif, user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une caisse (soft-delete, refusée si la caisse est ouverte)' })
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'CAISSE_SUPPRIMER', 'supprimer une caisse');
    await this.caissesService.softDelete(id, user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les caisses' })
  findAll() {
    return this.caissesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir une caisse par id' })
  findOne(@Param('id') id: string) {
    return this.caissesService.findOne(id);
  }

  @Get(':id/solde')
  @ApiOperation({ summary: 'Solde courant de la caisse (calculé depuis les écritures)' })
  async getSolde(@Param('id') id: string) {
    const solde = await this.caissesService.getSolde(id);
    return { caisseId: id, typeCompte: 'CAISSE', solde };
  }

  @Get(':id/sessions')
  @ApiOperation({ summary: 'Historique des sessions d\'une caisse' })
  getSessions(@Param('id') id: string) {
    return this.caissesService.getSessions(id);
  }

  @Get(':id/session-courante')
  @ApiOperation({ summary: 'Session ouverte courante (null si la caisse est fermée)' })
  getCurrentSession(@Param('id') id: string) {
    return this.caissesService.getCurrentSession(id);
  }

  @Post(':id/ouvrir')
  @ApiOperation({ summary: 'Ouvrir une caisse (crée une session) — caissier + admins' })
  async open(@Param('id') id: string, @Body() dto: OpenCaisseDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertAnyRole(user.sub, ['CAISSIER'], 'ouvrir une caisse');
    return this.caissesService.open(id, user.sub, dto.soldeOuverture);
  }

  @Post(':id/cloturer')
  @ApiOperation({ summary: 'Clôturer manuellement une caisse — caissier + admins' })
  async close(@Param('id') id: string, @Body() dto: CloseCaisseDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertAnyRole(user.sub, ['CAISSIER'], 'clôturer une caisse');
    return this.caissesService.close(id, user.sub, dto.soldeCloture);
  }
}
