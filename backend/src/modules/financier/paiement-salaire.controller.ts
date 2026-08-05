import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaiementSalaireService } from './paiement-salaire.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';
import { AuthorizationService } from '@modules/security/authorization.service';

class PayerSalaireDto {
  @IsNotEmpty() @IsString() employeId!: string;
  @IsOptional() @IsString() periode?: string;
  @IsOptional() @IsString() montant?: string;
  @IsIn(['CAISSE', 'PORTEFEUILLE']) sourceType!: 'CAISSE' | 'PORTEFEUILLE';
  @IsNotEmpty() @IsString() sourceId!: string;
  @IsNotEmpty() @IsString() deviseId!: string;
  @IsOptional() @IsString() @MaxLength(400) commentaire?: string;
}

class AnnulerPaiementDto {
  @IsOptional() @IsString() @MaxLength(400) motif?: string;
}

/**
 * Salaires : consultation des montants et versement depuis une caisse.
 *
 * Deux droits distincts, volontairement séparés :
 *   EMPLOYE_VOIR_SALAIRE  voir les montants (donnée sensible)
 *   SALAIRE_PAYER         sortir l'argent
 * Consulter la grille n'autorise donc pas à payer, et inversement.
 */
@ApiTags('Financier / Salaires')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('salaires')
export class PaiementSalaireController {
  constructor(
    private readonly service: PaiementSalaireService,
    private readonly authz: AuthorizationService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Grille des salaires d’une période, avec le paiement déjà effectué' })
  @ApiQuery({ name: 'periode', required: false, description: 'AAAA-MM (défaut : mois courant)' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'directionId', required: false })
  async lister(
    @CurrentUser() user: JwtPayload,
    @Query('periode') periode?: string,
    @Query('search') search?: string,
    @Query('directionId') directionId?: string,
  ) {
    await this.authz.assertPermission(
      user.sub,
      'EMPLOYE_VOIR_SALAIRE',
      'consulter les salaires',
    );
    return this.service.listerPourPeriode(periode ?? '', { search, directionId });
  }

  @Get('employe/:employeId')
  @ApiOperation({ summary: 'Historique des paiements de salaire d’un employé' })
  async historique(@Param('employeId') employeId: string, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(
      user.sub,
      'EMPLOYE_VOIR_SALAIRE',
      "consulter l'historique des salaires",
    );
    return this.service.historique(employeId);
  }

  @Post('payer')
  @ApiOperation({ summary: 'Verser un salaire depuis une caisse ou un portefeuille' })
  async payer(@Body() dto: PayerSalaireDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'SALAIRE_PAYER', 'payer un salaire');
    return this.service.payer(dto, user.sub);
  }

  @Post(':id/annuler')
  @ApiOperation({ summary: 'Annuler un paiement (contrepasse l’écriture)' })
  async annuler(
    @Param('id') id: string,
    @Body() dto: AnnulerPaiementDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(user.sub, 'SALAIRE_PAYER', 'annuler un paiement de salaire');
    return this.service.annuler(id, user.sub, dto.motif);
  }
}
