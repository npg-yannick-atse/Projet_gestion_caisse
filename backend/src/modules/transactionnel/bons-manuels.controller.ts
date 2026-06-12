import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { BonsManuelsService } from './bons-manuels.service';
import { CreateCarnetDto } from './dto/create-carnet.dto';
import { CreateBonManuelDto } from './dto/create-bon-manuel.dto';
import { CarnetStatut } from './entities/carnet.entity';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';

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
  @ApiOperation({ summary: 'Lister les bons manuels (tous pour admin, sinon les siens)' })
  findBonsManuels(@CurrentUser() user: JwtPayload) {
    return this.service.findBonsManuels(user.sub);
  }
}
