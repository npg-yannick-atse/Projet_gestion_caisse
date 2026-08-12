import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CaissesService } from './caisses.service';
import { CreateCaisseDto } from './dto/create-caisse.dto';
import { UpdateCaisseDto } from './dto/update-caisse.dto';
import { OpenCaisseDto } from './dto/open-caisse.dto';
import { CloseCaisseDto } from './dto/close-caisse.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';
import { AuthorizationService } from '@modules/security/authorization.service';
import { TauxChangeService } from './taux-change.service';

@ApiTags('Financier / Caisses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('caisses')
export class CaissesController {
  constructor(
    private readonly caissesService: CaissesService,
    private readonly authz: AuthorizationService,
    private readonly tauxChange: TauxChangeService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Créer une caisse (créée FERMÉE)' })
  async create(@Body() dto: CreateCaisseDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermissionStrict(user.sub, 'CAISSE_MODIFIER', 'créer une caisse');
    return this.caissesService.create(dto, user.sub);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour une caisse' })
  async update(@Param('id') id: string, @Body() dto: UpdateCaisseDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermissionStrict(user.sub, 'CAISSE_MODIFIER', 'modifier une caisse');
    return this.caissesService.update(id, dto, user.sub);
  }

  @Patch(':id/toggle-active')
  @ApiOperation({ summary: 'Activer / désactiver une caisse (refusée si OUVERTE et désactivation demandée)' })
  async toggleActive(
    @Param('id') id: string,
    @Body() dto: { estActif: boolean },
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermissionStrict(user.sub, 'CAISSE_MODIFIER', 'activer/désactiver une caisse');
    return this.caissesService.toggleActif(id, dto.estActif, user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une caisse (soft-delete, refusée si la caisse est ouverte)' })
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermissionStrict(user.sub, 'CAISSE_SUPPRIMER', 'supprimer une caisse');
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
  @ApiOperation({
    summary: 'Solde courant de la caisse, dans sa devise (calculé depuis les écritures)',
  })
  async getSolde(@Param('id') id: string) {
    const solde = await this.caissesService.getSolde(id);
    // `soldes` accompagne systématiquement le solde principal : une caisse peut
    // détenir d'autres devises, et les masquer donnerait une image fausse.
    const soldes = await this.caissesService.getSoldesParDevise(id);
    return { caisseId: id, typeCompte: 'CAISSE', solde, soldes };
  }

  @Get(':id/soldes')
  @ApiOperation({ summary: 'Ventilation du solde de la caisse par devise' })
  async getSoldesParDevise(@Param('id') id: string) {
    return { caisseId: id, soldes: await this.caissesService.getSoldesParDevise(id) };
  }

  @Get(':id/solde-consolide')
  @ApiOperation({
    summary: 'Ce que contient la caisse, converti dans la devise de référence',
    description:
      "Total INDICATIF : la conversion n'engendre aucune écriture comptable. Une devise sans " +
      'taux exploitable est écartée du total et rendue dans `ignorees` — un total amputé qui se ' +
      'présenterait comme complet serait pire que pas de total du tout.',
  })
  async getSoldeConsolide(@Param('id') id: string) {
    const soldes = await this.caissesService.getSoldesParDevise(id);
    // Le total se calcule ICI et non dans le navigateur : sinon chaque écran
    // refait sa propre conversion, et ils finissent par ne plus dire la même chose.
    const consolidation = await this.tauxChange.consolider(
      soldes.map((s) => ({ montant: s.solde, deviseId: s.deviseId })),
    );
    return { caisseId: id, soldes, consolidation };
  }

  @Get(':id/solde-timeline')
  @ApiOperation({ summary: 'Évolution du fond de caisse jour par jour (solde cumulé)' })
  async getSoldeTimeline(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Query('days') days?: string,
  ) {
    // Périmètre : admins → toutes les caisses ; sinon caisse de son accès direct
    // OU caisse qui alimente l'un de ses portefeuilles (cas du gestionnaire).
    if (!(await this.authz.isAdmin(user.sub))) {
      const caisses = await this.authz.getCaissePerimeter(user.sub);
      // Un périmètre `null` signifie « aucune restriction » (cf. getCaissePerimeter).
      let autorise = caisses === null || caisses.has(String(id));
      if (!autorise) {
        const ptfs = await this.authz.getPortefeuillePerimeter(user.sub);
        if (ptfs && ptfs.size > 0) {
          const sources = await this.caissesService.sourceCaisseIds([...ptfs].map(String));
          autorise = sources.includes(String(id));
        }
      }
      if (!autorise) {
        throw new ForbiddenException("Cette caisse est hors de votre périmètre.");
      }
    }
    return this.caissesService.getSoldeTimeline(id, days ? parseInt(days, 10) : 30);
  }

  @Get(':id/flux-timeline')
  @ApiOperation({ summary: 'Flux entrées / sorties du fond de caisse, jour par jour' })
  async getFluxTimeline(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Query('days') days?: string,
  ) {
    // Même périmètre que le solde-timeline : accès direct OU caisse-source d'un portefeuille géré.
    if (!(await this.authz.isAdmin(user.sub))) {
      const caisses = await this.authz.getCaissePerimeter(user.sub);
      // Un périmètre `null` signifie « aucune restriction » (cf. getCaissePerimeter).
      let autorise = caisses === null || caisses.has(String(id));
      if (!autorise) {
        const ptfs = await this.authz.getPortefeuillePerimeter(user.sub);
        if (ptfs && ptfs.size > 0) {
          const sources = await this.caissesService.sourceCaisseIds([...ptfs].map(String));
          autorise = sources.includes(String(id));
        }
      }
      if (!autorise) {
        throw new ForbiddenException("Cette caisse est hors de votre périmètre.");
      }
    }
    return this.caissesService.getFluxTimeline(id, days ? parseInt(days, 10) : 30);
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
    await this.authz.assertPermissionStrict(user.sub, 'CAISSE_OUVRIR', 'ouvrir une caisse');
    return this.caissesService.open(id, user.sub, dto.soldeOuverture);
  }

  @Post(':id/cloturer')
  @ApiOperation({ summary: 'Clôturer manuellement une caisse — caissier + admins' })
  async close(@Param('id') id: string, @Body() dto: CloseCaisseDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermissionStrict(user.sub, 'CAISSE_CLOTURER', 'clôturer une caisse');
    return this.caissesService.close(id, user.sub, dto.soldeCloture);
  }
}
