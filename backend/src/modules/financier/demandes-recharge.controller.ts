import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DemandesRechargeService } from './demandes-recharge.service';
import {
  CreateDemandeRechargeDto,
  RejeterDemandeRechargeDto,
  TraiterDemandeRechargeDto,
} from './dto/create-demande-recharge.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';
import { AuthorizationService } from '@modules/security/authorization.service';
import { DemandeRechargeStatut } from './entities/demande-recharge.entity';

@ApiTags('Financier / Demandes de recharge')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('demandes-recharge')
export class DemandesRechargeController {
  constructor(
    private readonly service: DemandesRechargeService,
    private readonly authz: AuthorizationService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Créer une demande de recharge (montant + motif ; cible = son portefeuille)' })
  create(@Body() dto: CreateDemandeRechargeDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(dto, user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les demandes de recharge (caissier/admin : toutes ; sinon : les siennes)' })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query('statut') statut?: string,
    @Query('search') search?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    // RECHARGE_VOIR_TOUTES remplace la lecture en dur du rôle CAISSIER
    // (migration 0066). Les administrateurs passent par leur contournement.
    const peutToutVoir =
      (await this.authz.isAdmin(user.sub)) ||
      (await this.authz.hasPermission(user.sub, 'RECHARGE_VOIR_TOUTES'));
    return this.service.findAll({
      statut: statut as DemandeRechargeStatut,
      demandeurId: peutToutVoir ? undefined : user.sub,
      search,
      dateFrom,
      dateTo,
      sortBy,
      sortDir: sortDir === 'asc' ? 'asc' : sortDir === 'desc' ? 'desc' : undefined,
    });
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Compteurs par statut (GROUP BY en base), SANS le filtre de statut',
    description:
      "Le filtre de statut est délibérément absent : l'appliquer mettrait à zéro " +
      "les compteurs de tous les onglets sauf celui qui est sélectionné.",
  })
  async stats(
    @CurrentUser() user: JwtPayload,
    @Query('search') search?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    // RECHARGE_VOIR_TOUTES remplace la lecture en dur du rôle CAISSIER
    // (migration 0066). Les administrateurs passent par leur contournement.
    const peutToutVoir =
      (await this.authz.isAdmin(user.sub)) ||
      (await this.authz.hasPermission(user.sub, 'RECHARGE_VOIR_TOUTES'));
    return this.service.statsParStatut({
      demandeurId: peutToutVoir ? undefined : user.sub,
      search,
      dateFrom,
      dateTo,
    });
  }

  @Get('mes-portefeuilles')
  @ApiOperation({ summary: 'Lister les portefeuilles que je peux recharger (pour le choix de cible)' })
  mesPortefeuilles(@CurrentUser() user: JwtPayload) {
    return this.service.getPortefeuillesRechargeables(user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir une demande de recharge' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/traiter')
  @ApiOperation({ summary: 'Traiter (= effectuer la recharge réelle). Caissier uniquement.' })
  traiter(
    @Param('id') id: string,
    @Body() dto: TraiterDemandeRechargeDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.traiter(id, user.sub, dto.montant);
  }

  @Post(':id/rejeter')
  @ApiOperation({ summary: 'Rejeter une demande de recharge. Caissier uniquement.' })
  rejeter(
    @Param('id') id: string,
    @Body() dto: RejeterDemandeRechargeDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.rejeter(id, user.sub, dto.commentaire);
  }

  @Post(':id/annuler')
  @ApiOperation({ summary: 'Annuler sa propre demande (demandeur uniquement)' })
  annuler(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.annuler(id, user.sub);
  }
}
