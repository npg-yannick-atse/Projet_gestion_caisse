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
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';
import { Roles } from '@modules/auth/decorators/roles.decorator';
import { PrepareBonCaisseDto, UpdateBonCaisseDto } from './dto/bon-caisse.dto';

@ApiTags('Transactionnel / BonsCaisse')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bons-caisse')
export class BonsCaisseController {
  constructor(private readonly bonsCaisseService: BonsCaisseService) {}

  @Post('prepare')
  @Roles('CAISSIER')
  @ApiOperation({ summary: 'Caissier : preparer le decaissement d\'un sous-bon VALIDE' })
  async prepare(
    @Body() dto: PrepareBonCaisseDto,
    @CurrentUser() user: JwtPayload,
  ) {
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
  @Roles('CAISSIER')
  @ApiOperation({ summary: 'Caissier : ajuster les champs editables (statut PREPARE uniquement)' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateBonCaisseDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bonsCaisseService.updateBonCaisse(id, dto, user.sub);
  }

  @Post(':id/finalize')
  @Roles('CAISSIER')
  @ApiOperation({ summary: 'Caissier : finaliser le decaissement (passe sous-bon en DECAISSE)' })
  async finalize(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bonsCaisseService.finalizeDecaissement(id, user.sub);
  }

  @Post(':id/cancel')
  @Roles('CAISSIER')
  @ApiOperation({ summary: 'Caissier : annuler une preparation (statut != FINALISE)' })
  async cancel(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bonsCaisseService.cancelPrepare(id, user.sub);
  }
}
