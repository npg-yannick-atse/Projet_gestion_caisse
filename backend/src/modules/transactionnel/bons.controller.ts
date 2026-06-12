import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BonsService } from './bons.service';
import { AuthorizationService } from '@modules/security/authorization.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';

/**
 * Rôles qui ont accès à TOUS les bons (pas de restriction au demandeur).
 * Tout autre profil (DEMANDEUR pur) ne voit que ses propres bons, peu importe
 * le paramètre demandeurId fourni dans la query.
 */
const ROLES_VOIENT_TOUS_LES_BONS = new Set([
  'SUPER_ADMIN',
  'ADMINISTRATEUR',
  'VALIDATEUR',
  'CAISSIER',
  'GESTIONNAIRE_PORTEFEUILLE',
]);

interface CreateBonRequest {
  typeBonId: string;
  soubons: Array<{
    libelle: string;
    montant: string;
    partenaireId?: string | null;
    numeroBl: string;
    codeManutention: string;
    costCenterId: string;
    natureOperationId: string;
    caisseId: string;
    portefeuilleId: string;
    deviseId: string;
    numeroClient?: string;
    description?: string;
  }>;
  estRecurrent?: boolean;
  frequenceRecurrence?: 'MENSUEL' | 'TRIMESTRIEL' | 'SEMESTRIEL' | 'ANNUEL';
  demandeExtension?: boolean;
  descriptionExtension?: string;
  porteur?: string;
}

@ApiTags('Transactionnel / Bons')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bons')
export class BonsController {
  constructor(
    private readonly bonsService: BonsService,
    private readonly authz: AuthorizationService,
  ) {}

  /**
   * Calcule le demandeurId effectif à appliquer à la requête.
   * - Si l'utilisateur a un rôle privilégié → on respecte le paramètre passé
   *   par le client (ou undefined si non fourni).
   * - Sinon (DEMANDEUR pur) → on force au sub du JWT, ce qui empêche un
   *   demandeur de consulter les bons de quelqu'un d'autre via un curl direct.
   */
  private async resolveDemandeurFilter(
    user: JwtPayload,
    clientDemandeurId?: string,
  ): Promise<string | undefined> {
    // Rôles effectifs (assignés + délégués par un intérim actif).
    const codes = await this.authz.getUserRoleCodes(user.sub);
    const privileged = Array.from(codes).some((c) => ROLES_VOIENT_TOUS_LES_BONS.has(c));
    return privileged ? clientDemandeurId : user.sub;
  }

  @Post()
  @ApiOperation({ summary: 'Créer un bon avec ses sous-bons' })
  async create(@Body() dto: CreateBonRequest, @CurrentUser() user: JwtPayload) {
    return this.bonsService.createBon({
      ...dto,
      demandeurId: user.sub,
    }, user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les bons (filtres BD + restriction automatique par rôle)' })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query('statut') statut?: string,
    @Query('period') period?: string,
    @Query('typeBonId') typeBonId?: string,
    @Query('demandeurId') demandeurId?: string,
    @Query('extension') extension?: string,
    @Query('statutExtension') statutExtension?: string,
    @Query('search') search?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    const effectiveDemandeurId = await this.resolveDemandeurFilter(user, demandeurId);
    return this.bonsService.findAll({
      statut: statut as any,
      period: period as any,
      typeBonId,
      demandeurId: effectiveDemandeurId,
      extension: extension === '1' || extension === 'true',
      statutExtension,
      search,
      dateFrom,
      dateTo,
      sortBy,
      sortDir: sortDir === 'asc' ? 'asc' : sortDir === 'desc' ? 'desc' : undefined,
    });
  }

  @Get('stats/timeline')
  @ApiOperation({ summary: 'Série journalière (sparklines) — restriction automatique par rôle' })
  async getTimeline(
    @CurrentUser() user: JwtPayload,
    @Query('days') days?: string,
    @Query('statut') statut?: string,
    @Query('demandeurId') demandeurId?: string,
  ) {
    const effectiveDemandeurId = await this.resolveDemandeurFilter(user, demandeurId);
    return this.bonsService.getTimeline({
      days: days ? parseInt(days, 10) : undefined,
      statut: statut as any,
      demandeurId: effectiveDemandeurId,
    });
  }

  @Get('stats/by-direction')
  @ApiOperation({
    summary:
      'Décaissements agrégés par direction (jointure sous_bon → cost_center → direction)',
  })
  async getByDirection(@Query('period') period?: string) {
    return this.bonsService.getByDirection({
      period: period === 'today' || period === 'week' || period === 'month' ? period : undefined,
    });
  }

  @Get('stats/summary')
  @ApiOperation({ summary: "Vue synthétique — restriction automatique par rôle" })
  async getSummary(
    @CurrentUser() user: JwtPayload,
    @Query('demandeurId') demandeurId?: string,
    @Query('validateurId') validateurId?: string,
  ) {
    const effectiveDemandeurId = await this.resolveDemandeurFilter(user, demandeurId);
    return this.bonsService.getSummary({
      demandeurId: effectiveDemandeurId,
      validateurId,
    });
  }

  @Get('perimetre/mine')
  @ApiOperation({ summary: 'Périmètre de création de bon (CC, caisses, portefeuilles autorisés) + indicateur multi-CC' })
  async getMyPerimeter(@CurrentUser() user: JwtPayload) {
    return this.bonsService.getBonPerimeter(user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un bon par id' })
  async findOne(@Param('id') id: string) {
    return this.bonsService.findOne(id);
  }

  @Get(':id/soubons')
  @ApiOperation({ summary: 'Lister les sous-bons d\'un bon' })
  async getSoubons(@Param('id') id: string) {
    return this.bonsService.getSousBoinsOfBon(id);
  }

  @Get(':id/impression')
  @ApiOperation({ summary: 'Obtenir la dernière impression du bon (null si non imprimé)' })
  async getImpression(@Param('id') id: string) {
    return this.bonsService.getLatestImpression(id);
  }

  @Post(':id/validate')
  @ApiOperation({ summary: 'Valider (approuver ou refuser) un bon' })
  async validate(
    @Param('id') id: string,
    @Body() dto: { approuve: boolean; commentaire?: string; porteur?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bonsService.validateBon(id, user.sub, dto.approuve, dto.commentaire, dto.porteur);
  }

  @Post(':id/extension/approuver')
  @ApiOperation({ summary: "Approuver une demande d'extension (mode DECOUVERT ou RECHARGE)" })
  async approuverExtension(
    @Param('id') id: string,
    @Body() dto: { mode: 'DECOUVERT' | 'RECHARGE'; commentaire?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bonsService.approuverExtension(id, user.sub, dto.mode, dto.commentaire);
  }

  @Post(':id/extension/refuser')
  @ApiOperation({ summary: "Refuser une demande d'extension" })
  async refuserExtension(
    @Param('id') id: string,
    @Body() dto: { commentaire?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bonsService.refuserExtension(id, user.sub, dto.commentaire);
  }

  @Post(':id/print')
  @ApiOperation({ summary: 'Imprimer un bon' })
  async print(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.bonsService.printBon(id, user.sub);
  }

  @Post(':id/sign')
  @ApiOperation({ summary: 'Signer un bon (après impression). Le body peut porter signatureImage (PNG base64).' })
  async sign(
    @Param('id') id: string,
    @Body() body: { signatureImage?: string } = {},
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bonsService.signBon(id, user.sub, body.signatureImage);
  }

  @Post(':id/decaisser')
  @ApiOperation({ summary: 'Décaisser un bon (caissier uniquement)' })
  async decaisser(
    @Param('id') id: string,
    @Body() dto: { beneficiaire: string; beneficiairePiece?: string; modifications?: any },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bonsService.decaisserBon(id, user.sub, dto.beneficiaire, dto.beneficiairePiece, dto.modifications);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Annuler un bon' })
  async cancel(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.bonsService.cancelBon(id, user.sub);
  }
}
