import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BonsCaisseService } from './bons-caisse.service';
import { AuthorizationService } from '@modules/security/authorization.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';
import { PrepareBonCaisseDto, UpdateBonCaisseDto } from './dto/bon-caisse.dto';

@ApiTags('Transactionnel / BonsCaisse')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bons-caisse')
export class BonsCaisseController {
  constructor(
    private readonly bonsCaisseService: BonsCaisseService,
    private readonly authz: AuthorizationService,
  ) {}

  @Post('prepare')
  @ApiOperation({ summary: 'Préparer le décaissement d\'un sous-bon VALIDE (permission BON_DECAISSER)' })
  async prepare(
    @Body() dto: PrepareBonCaisseDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(user.sub, 'BON_DECAISSER', 'préparer un décaissement');
    return this.bonsCaisseService.prepareDecaissement(dto.bonId, dto.sousBonId, user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un BonCaisse par id' })
  async findOne(@Param('id') id: string) {
    return this.bonsCaisseService.findOne(id);
  }

  @Get('sous-bon/:sousBonId')
  @ApiOperation({ summary: 'Lister les BonCaisse rattaches a un sous-bon' })
  async findBySousBon(@Param('sousBonId') sousBonId: string) {
    return this.bonsCaisseService.findBySousBon(sousBonId);
  }

  @Get('bon/:bonId')
  @ApiOperation({ summary: 'Lister les BonCaisse rattaches a un bon' })
  async findByBon(@Param('bonId') bonId: string) {
    return this.bonsCaisseService.findByBon(bonId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Ajuster les champs éditables (statut PREPARE, permission BON_DECAISSER)' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateBonCaisseDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(user.sub, 'BON_DECAISSER', 'ajuster un décaissement');
    return this.bonsCaisseService.updateBonCaisse(id, dto, user.sub);
  }

  @Post(':id/finalize')
  @ApiOperation({ summary: 'Finaliser le décaissement (sous-bon → DECAISSE, permission BON_DECAISSER)' })
  async finalize(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(user.sub, 'BON_DECAISSER', 'finaliser un décaissement');
    return this.bonsCaisseService.finalizeDecaissement(id, user.sub);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Annuler une préparation (statut != FINALISE, permission BON_DECAISSER)' })
  async cancel(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(user.sub, 'BON_DECAISSER', 'annuler une préparation de décaissement');
    return this.bonsCaisseService.cancelPrepare(id, user.sub);
  }
}
