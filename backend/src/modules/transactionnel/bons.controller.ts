import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Bon } from './entities/bon.entity';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BonsService } from './bons.service';
import { AuthorizationService } from '@modules/security/authorization.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';
import { UpdateBonDto, UpdateSousBonDto } from './dto/update-bon.dto';
import { CreateBonDto } from './dto/create-bon.dto';
import { DecaisserBonDto } from './dto/decaisser-bon.dto';

/**
 * Voir les bons de TOUS les demandeurs — sinon on ne voit que les siens, quel
 * que soit le `demandeurId` passé dans l'URL.
 *
 * C'était une liste de CODES DE RÔLE écrite ici même. Un rôle créé depuis
 * l'écran n'y figurait donc jamais : on pouvait lui donner BON_VALIDER sans
 * qu'il voie un seul bon à valider — le droit sans la vue. La règle est
 * devenue une permission (migration 0066), accordée aux mêmes rôles qu'avant,
 * et désormais portable par n'importe quel rôle ou profil.
 */
const PERM_VOIR_TOUS_LES_BONS = 'BON_VOIR_TOUS';

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
  /**
   * Vrai si l'utilisateur voit les bons d'autrui. Les administrateurs passent
   * toujours : leur contournement reste une identité, non une permission.
   */
  private async peutVoirTousLesBons(userId: string): Promise<boolean> {
    if (await this.authz.isAdmin(userId)) return true;
    return this.authz.hasPermission(userId, PERM_VOIR_TOUS_LES_BONS);
  }

  private async resolveDemandeurFilter(
    user: JwtPayload,
    clientDemandeurId?: string,
  ): Promise<string | undefined> {
    // `assertPermission` = contournement administrateur OU permission détenue ;
    // `hasPermission` couvre rôles, profils, permissions individuelles et intérims.
    const privileged = await this.peutVoirTousLesBons(user.sub);
    return privileged ? clientDemandeurId : user.sub;
  }

  /**
   * Même principe pour « les bons que j'ai traités » : chacun peut interroger
   * SES propres décisions, mais lire celles d'un autre validateur suppose un
   * rôle privilégié. Sans ce garde-fou, `?validateurId=12` exposerait l'activité
   * de n'importe quel collègue à qui sait forger l'URL.
   */
  private async resolveValidateurFilter(
    user: JwtPayload,
    clientValidateurId?: string,
  ): Promise<string | undefined> {
    if (!clientValidateurId) return undefined;
    if (String(clientValidateurId) === String(user.sub)) return user.sub;
    const privileged = await this.peutVoirTousLesBons(user.sub);
    return privileged ? clientValidateurId : user.sub;
  }

  /**
   * Charge un bon en vérifiant le droit de LECTURE (anti-IDOR) : mêmes règles que la
   * liste — les rôles privilégiés voient tout, sinon on ne voit que ses propres bons.
   * Lève NotFound si le bon n'existe pas, Forbidden s'il est hors périmètre.
   */
  private async loadReadableBon(user: JwtPayload, id: string): Promise<Bon> {
    const bon = await this.bonsService.findOne(id);
    // Son propre bon : toujours lisible.
    if (String(bon.demandeurId) === String(user.sub)) return bon;
    // Droit de tout voir : voit ce bon.
    if (await this.peutVoirTousLesBons(user.sub)) return bon;
    // Droit métier accordé via un PROFIL (sans rôle privilégié) : quiconque peut
    // valider ou décaisser un bon doit pouvoir le lire pour agir dessus.
    const canByPermission =
      (await this.authz.hasPermission(user.sub, 'BON_DECAISSER')) ||
      (await this.authz.hasPermission(user.sub, 'BON_VALIDER'));
    if (canByPermission) return bon;
    throw new ForbiddenException("Vous n'avez pas accès à ce bon.");
  }

  @Post()
  @ApiOperation({ summary: 'Créer un bon avec ses sous-bons' })
  async create(@Body() dto: CreateBonDto, @CurrentUser() user: JwtPayload) {
    return this.bonsService.createBon({
      ...dto,
      // La fusion des natures (migration 0070) a renommé le champ, mais le web
      // et surtout l'APK DÉJÀ INSTALLÉ envoient encore `natureOperationId`.
      // Sans cette reprise, chaque création est refusée pour « nature requise ».
      soubons: dto.soubons.map((sb) => ({
        ...sb,
        natureComptableId: sb.natureComptableId ?? sb.natureOperationId ?? null,
      })),
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
    @Query('validateurId') validateurId?: string,
    @Query('extension') extension?: string,
    @Query('statutExtension') statutExtension?: string,
    @Query('search') search?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    const effectiveDemandeurId = await this.resolveDemandeurFilter(user, demandeurId);
    const effectiveValidateurId = await this.resolveValidateurFilter(user, validateurId);
    return this.bonsService.findAll({
      statut: statut as any,
      period: period as any,
      typeBonId,
      demandeurId: effectiveDemandeurId,
      validateurId: effectiveValidateurId,
      extension: extension === '1' || extension === 'true',
      statutExtension,
      search,
      dateFrom,
      dateTo,
      sortBy,
      sortDir: sortDir === 'asc' ? 'asc' : sortDir === 'desc' ? 'desc' : undefined,
    });
  }

  @Get('stats/par-statut')
  @ApiOperation({
    summary: 'Nombre de bons par statut sur une plage — restriction automatique par rôle',
  })
  async getParStatut(
    @CurrentUser() user: JwtPayload,
    @Query('demandeurId') demandeurId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const effectiveDemandeurId = await this.resolveDemandeurFilter(user, demandeurId);
    return this.bonsService.compterParStatut({
      demandeurId: effectiveDemandeurId,
      dateFrom,
      dateTo,
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
    const periods = ['today', 'week', 'month', 'quarter', 'all'] as const;
    return this.bonsService.getByDirection({
      period: (periods as readonly string[]).includes(period ?? '') ? (period as (typeof periods)[number]) : undefined,
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
  async findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.loadReadableBon(user, id);
  }

  @Get(':id/soubons')
  @ApiOperation({ summary: 'Lister les sous-bons d\'un bon' })
  async getSoubons(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.loadReadableBon(user, id); // contrôle d'accès au bon parent
    return this.bonsService.getSousBoinsOfBon(id);
  }

  @Get(':id/impression')
  @ApiOperation({ summary: 'Obtenir la dernière impression du bon (null si non imprimé)' })
  async getImpression(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.loadReadableBon(user, id); // contrôle d'accès au bon parent
    return this.bonsService.getLatestImpression(id);
  }

  @Get(':id/validations')
  @ApiOperation({ summary: 'Historique des validations du bon (validateur, décision, commentaire)' })
  async getValidations(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.loadReadableBon(user, id); // contrôle d'accès au bon parent
    return this.bonsService.getValidations(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Modifier un bon (porteur) — VALIDATEUR ou permission BON_MODIFIER_SPEC, statut CREE uniquement',
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateBonDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bonsService.updateBon(id, user.sub, dto);
  }

  @Patch(':bonId/soubons/:sousBonId')
  @ApiOperation({
    summary:
      'Modifier un sous-bon — VALIDATEUR ou permission BON_MODIFIER_SPEC, statut CREE uniquement',
  })
  async updateSousBon(
    @Param('bonId') bonId: string,
    @Param('sousBonId') sousBonId: string,
    @Body() dto: UpdateSousBonDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.bonsService.updateSousBon(bonId, sousBonId, user.sub, dto);
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
  @ApiOperation({ summary: 'Décaisser un bon (permission BON_DECAISSER)' })
  async decaisser(
    @Param('id') id: string,
    @Body() dto: DecaisserBonDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(user.sub, 'BON_DECAISSER', 'décaisser un bon');
    return this.bonsService.decaisserBon(id, user.sub, dto.beneficiaire, dto.beneficiairePiece, dto.modifications);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Annuler un bon' })
  async cancel(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.bonsService.cancelBon(id, user.sub);
  }
}
