import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreditService } from './credit.service';
import { CreateCreditDto, UpdateCreditDto } from './dto/credit.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';
import { AuthorizationService } from '@modules/security/authorization.service';

@ApiTags('Financier / Crédits')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('credits')
export class CreditController {
  constructor(
    private readonly creditService: CreditService,
    private readonly authz: AuthorizationService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lister les crédits (de sa direction ; tous pour un admin) — filtre date + tri BD' })
  list(
    @CurrentUser() user: JwtPayload,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    return this.creditService.list(user.sub, {
      dateFrom,
      dateTo,
      sortBy,
      sortDir: sortDir === 'asc' ? 'asc' : sortDir === 'desc' ? 'desc' : undefined,
    });
  }

  @Post()
  @ApiOperation({ summary: 'Créer une demande de crédit (sans décaissement)' })
  async create(@Body() dto: CreateCreditDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'CREDIT_DEMANDER', 'demander un crédit');
    return this.creditService.create(dto, user.sub);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifier une demande en attente (montant / mois / commentaire)' })
  async update(@Param('id') id: string, @Body() dto: UpdateCreditDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'CREDIT_DEMANDER', 'modifier une demande de crédit');
    return this.creditService.update(id, dto, user.sub);
  }

  @Post(':id/approuver')
  @ApiOperation({ summary: 'Approuver une demande de crédit (DAF)' })
  async approuver(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'CREDIT_VALIDER', 'approuver un crédit');
    return this.creditService.approuver(id, user.sub);
  }

  @Post(':id/rejeter')
  @ApiOperation({ summary: 'Rejeter une demande de crédit (DAF)' })
  async rejeter(
    @Param('id') id: string,
    @Body() body: { commentaire?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(user.sub, 'CREDIT_VALIDER', 'rejeter un crédit');
    return this.creditService.rejeter(id, user.sub, body?.commentaire);
  }

  @Post(':id/annuler')
  @ApiOperation({ summary: 'Annuler sa propre demande en attente' })
  async annuler(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'CREDIT_DEMANDER', 'annuler une demande de crédit');
    return this.creditService.annuler(id, user.sub);
  }

  @Post(':id/traiter')
  @ApiOperation({ summary: 'Décaisser un crédit approuvé (caissier) — l\'argent sort ici' })
  async traiter(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'CREDIT_DECAISSER', 'décaisser un crédit');
    return this.creditService.traiter(id, user.sub);
  }

  @Post(':id/solder')
  @ApiOperation({ summary: 'Solder (clôturer) un crédit en cours (DAF)' })
  async solder(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'CREDIT_VALIDER', 'solder un crédit');
    return this.creditService.solder(id, user.sub);
  }
}
