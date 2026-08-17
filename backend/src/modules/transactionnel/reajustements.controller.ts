import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';
import { ReajustementsService } from './reajustements.service';

export class DecisionReajustementDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  commentaire?: string;
}

@ApiTags('Réajustements de budget')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reajustements')
export class ReajustementsController {
  constructor(private readonly service: ReajustementsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les demandes de réajustement (filtre statut appliqué en base)' })
  lister(@Query('statut') statut?: string) {
    return this.service.lister(statut);
  }

  @Post(':id/approuver')
  @ApiOperation({
    summary: 'Approuver un réajustement — C’EST ICI que l’argent bouge',
    description:
      "Le mouvement passe par le point d'entrée commun du grand livre : une caisse qui ne détient " +
      'pas la devise fait échouer l’approbation, la demande passe en ÉCHEC avec sa raison et reste ' +
      'rejouable. Exige la permission BUDGET_REAJUSTEMENT_VALIDER.',
  })
  approuver(
    @Param('id') id: string,
    @Body() dto: DecisionReajustementDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.approuver(id, user.sub, dto.commentaire);
  }

  @Post(':id/refuser')
  @ApiOperation({ summary: 'Refuser un réajustement — rien ne bouge' })
  async refuser(
    @Param('id') id: string,
    @Body() dto: DecisionReajustementDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.service.refuser(id, user.sub, dto.commentaire);
    return { ok: true };
  }
}
