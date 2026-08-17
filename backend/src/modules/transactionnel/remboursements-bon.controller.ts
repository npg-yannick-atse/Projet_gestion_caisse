import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsNumberString, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';
import { RemboursementsBonService } from './remboursements-bon.service';
import { IsMontant } from '@common/validators/montant.validator';

export class CreateRemboursementBonDto {
  @ApiProperty({ description: 'Sous-bon décaissé dont une part revient à la caisse' })
  @IsNotEmpty()
  @IsNumberString()
  sousBonId!: string;

  @ApiProperty({ description: 'Montant rendu, strictement positif' })
  @IsNotEmpty()
  @IsMontant()
  montant!: string;

  @ApiProperty({ required: false, description: "Pourquoi cette part n'a pas été dépensée" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motif?: string;
}

@ApiTags('Remboursements de bon')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('remboursements-bon')
export class RemboursementsBonController {
  constructor(private readonly service: RemboursementsBonService) {}

  @Post()
  @ApiOperation({
    summary: "Rendre à la caisse la part non dépensée d'un bon",
    description:
      "Le bon N'EST PAS réécrit : il garde le montant autorisé, et le remboursement dit ce qui " +
      'est revenu. Écriture miroir du décaissement — la charge retombe, la caisse est créditée. ' +
      'Le portefeuille n\'est pas recrédité : le budget du mois reste consommé. ' +
      'Exige la permission BON_REMBOURSER.',
  })
  creer(@Body() dto: CreateRemboursementBonDto, @CurrentUser() user: JwtPayload) {
    return this.service.creer(dto, user.sub);
  }

  @Get('remboursables')
  @ApiOperation({
    summary: "Sous-bons sur lesquels il reste quelque chose à rendre",
    description:
      'Décaissé moins déjà rendu, calculé en base. Filtre facultatif par caisse — le caissier ' +
      'ne voit alors que ce qui peut rentrer dans la sienne.',
  })
  remboursables(@Query('caisseId') caisseId?: string) {
    return this.service.listerRemboursables(caisseId);
  }

  @Get('bon/:bonId')
  @ApiOperation({ summary: "Remboursements enregistrés sur un bon" })
  listerParBon(@Param('bonId') bonId: string) {
    return this.service.listerParBon(bonId);
  }

  @Get('sous-bon/:sousBonId/total')
  @ApiOperation({ summary: 'Total déjà rendu sur un sous-bon' })
  async total(@Param('sousBonId') sousBonId: string) {
    return { sousBonId, total: await this.service.totalRembourse(sousBonId) };
  }
}
