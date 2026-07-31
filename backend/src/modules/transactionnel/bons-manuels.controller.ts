import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { BonsManuelsService } from './bons-manuels.service';
import { CreateCarnetDto } from './dto/create-carnet.dto';
import { CreateBonManuelDto } from './dto/create-bon-manuel.dto';
import { CarnetStatut } from './entities/carnet.entity';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';

/**
 * Sécurité : les contrôles sont portés par le service (BonsManuelsService), qui a
 * besoin du contexte métier — CARNET_GERER pour créer/clôturer un carnet,
 * BON_MANUEL_CREER pour émettre un bon manuel, plus la vérification que le carnet
 * appartient bien au caissier. Les lectures sont scopées : un non-admin ne voit
 * que ses propres carnets et bons manuels.
 */
@ApiTags('Transactionnel / Bons manuels')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class BonsManuelsController {
  constructor(private readonly service: BonsManuelsService) {}

  // ---------- Carnets ----------

  @Post('carnets')
  @ApiOperation({ summary: 'Créer un carnet de bons manuels (admin)' })
  createCarnet(@Body() dto: CreateCarnetDto, @CurrentUser() user: JwtPayload) {
    return this.service.createCarnet(dto, user.sub);
  }

  @Get('carnets')
  @ApiOperation({ summary: 'Lister les carnets (tous pour admin, sinon les siens)' })
  @ApiQuery({ name: 'statut', required: false })
  findCarnets(@CurrentUser() user: JwtPayload, @Query('statut') statut?: string) {
    return this.service.findCarnets(user.sub, statut as CarnetStatut | undefined);
  }

  @Get('carnets/:id')
  @ApiOperation({ summary: 'Obtenir un carnet' })
  findCarnet(@Param('id') id: string) {
    return this.service.findCarnet(id);
  }

  @Patch('carnets/:id/cloturer')
  @ApiOperation({ summary: 'Clôturer un carnet (admin)' })
  cloturerCarnet(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.cloturerCarnet(id, user.sub);
  }

  // ---------- Bons manuels ----------

  @Post('bons-manuels')
  @ApiOperation({ summary: 'Créer un bon manuel (décaissement direct, caissier)' })
  createBonManuel(@Body() dto: CreateBonManuelDto, @CurrentUser() user: JwtPayload) {
    return this.service.createBonManuel(dto, user.sub);
  }

  @Get('bons-manuels')
  @ApiOperation({ summary: 'Lister les bons manuels (recherche + dates + tri BD ; tous pour admin, sinon les siens)' })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'Date de décaissement min (YYYY-MM-DD, incluse)' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'Date de décaissement max (YYYY-MM-DD, incluse)' })
  findBonsManuels(
    @CurrentUser() user: JwtPayload,
    @Query('search') search?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    return this.service.findBonsManuels(user.sub, {
      search,
      dateFrom,
      dateTo,
      sortBy,
      sortDir: sortDir === 'asc' ? 'asc' : sortDir === 'desc' ? 'desc' : undefined,
    });
  }
}
