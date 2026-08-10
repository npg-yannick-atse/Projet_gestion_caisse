import { Body, Controller, Get, Param, Patch, Post, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreditService } from './credit.service';
import { CreditRemboursementService } from './credit-remboursement.service';
import { CreateCreditDto, UpdateCreditDto } from './dto/credit.dto';
import { AnnulerRemboursementDto, ApprouverCreditDto, CreateRemboursementDto } from './dto/credit-remboursement.dto';
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
    private readonly remboursements: CreditRemboursementService,
    private readonly authz: AuthorizationService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Lister les crédits (de sa direction ; tous pour un admin) — filtres date/direction + tri BD',
  })
  list(
    @CurrentUser() user: JwtPayload,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('directionId') directionId?: string,
  ) {
    return this.creditService.list(user.sub, {
      dateFrom,
      dateTo,
      directionId,
      sortBy,
      sortDir: sortDir === 'asc' ? 'asc' : sortDir === 'desc' ? 'desc' : undefined,
    });
  }

  @Get('export')
  @ApiOperation({
    summary: 'Exporter les crédits vers Excel, avec remboursé / reste dû / retard',
  })
  async exportExcel(
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('directionId') directionId?: string,
    @Query('statut') statut?: string,
    @Query('enRetard') enRetard?: string,
  ) {
    const buf = await this.creditService.exportExcel(user.sub, {
      dateFrom,
      dateTo,
      directionId,
      statut,
      enRetard: enRetard === 'true' || enRetard === '1',
      sortBy,
      sortDir: sortDir === 'asc' ? 'asc' : sortDir === 'desc' ? 'desc' : undefined,
    });
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="credits.xlsx"',
    });
    return new StreamableFile(buf);
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
  @ApiOperation({
    summary: 'Approuver une demande de crédit (DAF), avec ou sans prélèvement sur salaire',
  })
  async approuver(
    @Param('id') id: string,
    @Body() dto: ApprouverCreditDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(user.sub, 'CREDIT_VALIDER', 'approuver un crédit');
    return this.creditService.approuver(
      id,
      user.sub,
      dto?.prelevementSalaire ?? false,
      dto?.modeReplanification ?? 'ALLONGER',
    );
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

  // --- Remboursements -------------------------------------------------------

  @Get('situations')
  @ApiOperation({
    summary: 'Situation (remboursé / reste / retard) de plusieurs crédits — pour la liste',
  })
  async situations(@CurrentUser() user: JwtPayload, @Query('ids') ids?: string) {
    // Sans `ids`, on renvoie la situation des crédits que l'utilisateur peut
    // déjà voir : la liste est cloisonnée par direction, la situation aussi.
    const cibles = ids
      ? ids.split(',').map((s) => s.trim()).filter(Boolean)
      : (await this.creditService.list(user.sub)).map((c) => String(c.id));
    return this.remboursements.situations(cibles);
  }

  @Get(':id/situation')
  @ApiOperation({ summary: "Situation détaillée d'un crédit, calculée sur les versements réels" })
  situation(@Param('id') id: string) {
    return this.remboursements.situation(id);
  }

  @Get(':id/remboursements')
  @ApiOperation({ summary: "Versements encaissés au titre d'un crédit" })
  listRemboursements(@Param('id') id: string) {
    return this.remboursements.list(id);
  }

  @Post(':id/remboursements')
  @ApiOperation({ summary: "Enregistrer un versement réellement encaissé — l'argent rentre ici" })
  async enregistrerRemboursement(
    @Param('id') id: string,
    @Body() dto: CreateRemboursementDto,
    @CurrentUser() user: JwtPayload,
  ) {
    // Strict : encaisser touche à l'argent, un admin ne doit pas contourner la
    // permission par simple appartenance au rôle (même règle que CAISSE_*).
    await this.authz.assertPermissionStrict(
      user.sub,
      'CREDIT_REMBOURSER',
      'enregistrer un remboursement de crédit',
    );
    return this.remboursements.enregistrer(id, dto, user.sub);
  }

  @Post('remboursements/:rembId/annuler')
  @ApiOperation({ summary: 'Annuler un versement saisi par erreur (contre-passation)' })
  async annulerRemboursement(
    @Param('rembId') rembId: string,
    @Body() dto: AnnulerRemboursementDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermissionStrict(
      user.sub,
      'CREDIT_REMBOURSER',
      'annuler un remboursement de crédit',
    );
    return this.remboursements.annuler(rembId, user.sub, dto?.motif);
  }
}
