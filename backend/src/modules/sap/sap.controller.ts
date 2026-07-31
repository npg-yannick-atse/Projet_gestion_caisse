import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SapService } from './sap.service';
import { PosterPieceDto } from './dto/poster-piece.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';
import { AuthorizationService } from '@modules/security/authorization.service';

/**
 * Sécurité (cf. migration 0040) — remplace les gardes @Roles('DAF') :
 *   SAP_SYNCHRONISER     : synchronisation des référentiels depuis SAP
 *   SAP_ECRITURE_ENVOYER : contrôle / post / contrepassation d'une pièce
 *   SAP_MAPPING_GERER    : mapping comptes et centres de coût
 *   SAP_CONSULTER        : diagnostic de connectivité
 *
 * Les VÉRIFICATIONS MÉTIER (client, commande, fournisseur, comptes, mapping en
 * lecture) restent ouvertes : elles sont appelées pendant la saisie d'un bon et
 * lors de la création d'un partenaire, y compris par un simple demandeur.
 */
@ApiTags('SAP')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sap')
export class SapController {
  constructor(
    private readonly sap: SapService,
    private readonly authz: AuthorizationService,
  ) {}

  @Get('ping')
  @ApiOperation({ summary: 'Test de connectivité SAP (STFC_CONNECTION)' })
  async ping(@CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'SAP_CONSULTER', 'tester la connexion SAP');
    return this.sap.ping();
  }

  @Get('client/:code')
  @ApiOperation({ summary: 'Vérifier un client par son code (KUNNR)' })
  client(@Param('code') code: string) {
    return this.sap.verifierClient(code);
  }

  @Get('commande/:numero')
  @ApiOperation({ summary: "Vérifier une commande d'achat par son numéro (EBELN)" })
  commande(@Param('numero') numero: string) {
    return this.sap.verifierCommande(numero);
  }

  @Get('fournisseur/:code')
  @ApiOperation({ summary: 'Vérifier un fournisseur par son code (LIFNR)' })
  fournisseur(@Param('code') code: string) {
    return this.sap.verifierFournisseur(code);
  }

  @Post('sync/comptes')
  @ApiOperation({ summary: 'Synchroniser le plan comptable PCGG depuis SAP (ajoute les nouveaux)' })
  async syncComptes(@CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(
      user.sub,
      'SAP_SYNCHRONISER',
      'synchroniser le plan comptable',
    );
    return this.sap.synchroniserComptes();
  }

  @Post('sync/fournisseurs')
  @ApiOperation({ summary: 'Synchroniser les fournisseurs depuis SAP (ajoute les nouveaux)' })
  async syncFournisseurs(@CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(
      user.sub,
      'SAP_SYNCHRONISER',
      'synchroniser les fournisseurs',
    );
    return this.sap.synchroniserFournisseurs();
  }

  @Get('comptes')
  @ApiOperation({ summary: 'Lister les comptes généraux postables (société, plan PCGG)' })
  comptes(@Query('q') q?: string, @Query('societe') societe?: string) {
    return this.sap.getComptes(q, societe || undefined);
  }

  @Post('ecriture/check')
  @ApiOperation({ summary: 'Contrôler une pièce comptable SANS l’écrire (BAPI_ACC_DOCUMENT_CHECK)' })
  async checkEcriture(@Body() dto: PosterPieceDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(
      user.sub,
      'SAP_ECRITURE_ENVOYER',
      'contrôler une pièce comptable',
    );
    return this.sap.checkPiece(dto);
  }

  @Post('ecriture/post')
  @ApiOperation({ summary: 'Poster réellement une pièce comptable (BAPI_ACC_DOCUMENT_POST + COMMIT)' })
  async posterEcriture(@Body() dto: PosterPieceDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(
      user.sub,
      'SAP_ECRITURE_ENVOYER',
      'poster une pièce comptable',
    );
    return this.sap.posterPiece(dto);
  }

  @Post('ecriture/contrepasser')
  @ApiOperation({ summary: 'Contrepasser (annuler) une pièce postée (BAPI_ACC_DOCUMENT_REV_POST)' })
  async contrepasser(
    @Body() body: { objKey: string; motif?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(
      user.sub,
      'SAP_ECRITURE_ENVOYER',
      'contrepasser une pièce comptable',
    );
    return this.sap.contrepasser(body.objKey, body.motif);
  }

  @Post('operations/:id/envoyer')
  @ApiOperation({ summary: 'Envoyer une opération vers SAP (construit + poste la pièce, idempotent)' })
  async envoyerOperation(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(
      user.sub,
      'SAP_ECRITURE_ENVOYER',
      'envoyer une opération vers SAP',
    );
    return this.sap.envoyerOperation(id);
  }

  @Get('mapping')
  @ApiOperation({ summary: 'Mapping comptable type_compte → compte SAP' })
  getMapping() {
    return this.sap.getMapping();
  }

  @Post('mapping')
  @ApiOperation({ summary: 'Définir le compte SAP d’un type de compte' })
  async setMapping(
    @Body() body: { typeCompte: string; compteSap: string | null },
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(
      user.sub,
      'SAP_MAPPING_GERER',
      'modifier le mapping comptable SAP',
    );
    return this.sap.setMappingCompte(body.typeCompte, body.compteSap);
  }

  @Get('cost-centers')
  @ApiOperation({ summary: 'Mapping des centres de coût (app → SAP)' })
  getCostCenters() {
    return this.sap.getCostCenterMapping();
  }

  @Get('cost-centers/search')
  @ApiOperation({ summary: 'Lister/rechercher les centres de coût SAP (domaine 2251)' })
  searchCostCentersSap(@Query('q') q?: string) {
    return this.sap.getCostCentersSap(q);
  }

  @Post('cost-centers')
  @ApiOperation({ summary: 'Définir le centre de coût SAP d’un centre de coût app' })
  async setCostCenter(
    @Body() body: { costCenterApp: string; costCenterSap: string | null },
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(
      user.sub,
      'SAP_MAPPING_GERER',
      'modifier le mapping des centres de coût SAP',
    );
    return this.sap.setCostCenterMapping(body.costCenterApp, body.costCenterSap);
  }
}
