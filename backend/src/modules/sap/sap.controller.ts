import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SapService } from './sap.service';
import { PosterPieceDto } from './dto/poster-piece.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';

@ApiTags('SAP')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sap')
export class SapController {
  constructor(private readonly sap: SapService) {}

  @Get('ping')
  @ApiOperation({ summary: 'Test de connectivité SAP (STFC_CONNECTION)' })
  ping() {
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

  @Get('comptes')
  @ApiOperation({ summary: 'Lister les comptes généraux postables (société, plan PCGG)' })
  comptes(@Query('q') q?: string, @Query('societe') societe?: string) {
    return this.sap.getComptes(q, societe || undefined);
  }

  @Post('ecriture/check')
  @ApiOperation({ summary: 'Contrôler une pièce comptable SANS l’écrire (BAPI_ACC_DOCUMENT_CHECK)' })
  checkEcriture(@Body() dto: PosterPieceDto) {
    return this.sap.checkPiece(dto);
  }

  @Post('ecriture/post')
  @ApiOperation({ summary: 'Poster réellement une pièce comptable (BAPI_ACC_DOCUMENT_POST + COMMIT)' })
  posterEcriture(@Body() dto: PosterPieceDto) {
    return this.sap.posterPiece(dto);
  }

  @Post('ecriture/contrepasser')
  @ApiOperation({ summary: 'Contrepasser (annuler) une pièce postée (BAPI_ACC_DOCUMENT_REV_POST)' })
  contrepasser(@Body() body: { objKey: string; motif?: string }) {
    return this.sap.contrepasser(body.objKey, body.motif);
  }

  @Post('operations/:id/envoyer')
  @ApiOperation({ summary: 'Envoyer une opération vers SAP (construit + poste la pièce, idempotent)' })
  envoyerOperation(@Param('id') id: string) {
    return this.sap.envoyerOperation(id);
  }

  @Get('mapping')
  @ApiOperation({ summary: 'Mapping comptable type_compte → compte SAP' })
  getMapping() {
    return this.sap.getMapping();
  }

  @Post('mapping')
  @ApiOperation({ summary: 'Définir le compte SAP d’un type de compte' })
  setMapping(@Body() body: { typeCompte: string; compteSap: string | null }) {
    return this.sap.setMappingCompte(body.typeCompte, body.compteSap);
  }
}
