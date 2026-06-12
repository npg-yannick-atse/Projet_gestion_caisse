import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RechargeService } from './recharge.service';
import { RechargeDto } from './dto/recharge.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';

@ApiTags('Financier / Recharges')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('recharges')
export class RechargeController {
  constructor(private readonly rechargeService: RechargeService) {}

  @Post()
  @ApiOperation({ summary: 'Recharger un portefeuille depuis sa caisse source' })
  recharge(@Body() dto: RechargeDto, @CurrentUser() user: JwtPayload) {
    return this.rechargeService.recharge({
      caisseId: dto.caisseId,
      portefeuilleId: dto.portefeuilleId,
      montant: dto.montant,
      userId: user.sub,
      reference: dto.reference,
    });
  }
}
