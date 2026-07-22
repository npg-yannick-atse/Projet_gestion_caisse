import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EncaissementService } from './encaissement.service';
import { EncaissementDto } from './dto/encaissement.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';

@ApiTags('Financier / Encaissements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('encaissements')
export class EncaissementController {
  constructor(private readonly encaissementService: EncaissementService) {}

  @Post()
  @ApiOperation({ summary: 'Encaisser de l\'argent dans une caisse (client, dotation…)' })
  encaisser(@Body() dto: EncaissementDto, @CurrentUser() user: JwtPayload) {
    return this.encaissementService.encaisser({
      caisseId: dto.caisseId,
      montant: dto.montant,
      userId: user.sub,
      clientNom: dto.clientNom,
      clientNumero: dto.clientNumero,
      motif: dto.motif,
      reference: dto.reference,
    });
  }
}
