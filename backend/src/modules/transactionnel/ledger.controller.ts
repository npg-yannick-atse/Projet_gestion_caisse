import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LedgerService, type OperationScope } from './ledger.service';
import { AuthorizationService } from '@modules/security/authorization.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';
import { Roles } from '@modules/auth/decorators/roles.decorator';

interface CreateOperationRequest {
  typeOperation: 'RECHARGE' | 'DECAISSEMENT' | 'TRANSFERT' | 'AJUSTEMENT';
  caisseId?: string;
  portefeuilleId?: string;
  montant: string;
  deviseId: string;
  reference?: string;
}

interface CreateEcritureRequest {
  compteId: string;
  typeCompte: 'CAISSE' | 'PORTEFEUILLE' | 'GAIN_CHANGE' | 'PERTE_CHANGE';
  debit?: string;
  credit?: string;
  deviseId: string;
  planComptableId?: string;
  costCenterId?: string;
  referenceBonId?: string;
  referenceSousBonId?: string;
}

@ApiTags('Transactionnel / Ledger (Écritures Comptables)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ledger')
export class LedgerController {
  constructor(
    private readonly ledgerService: LedgerService,
    private readonly authz: AuthorizationService,
  ) {}

  // Opérations
  @Post('operations')
  @Roles('ADMINISTRATEUR')
  @ApiOperation({ summary: 'Créer une opération (mouvement caisse/portefeuille) — réservé admin' })
  async createOperation(@Body() dto: CreateOperationRequest, @CurrentUser() user: JwtPayload) {
    return this.ledgerService.createOperation({
      ...dto,
      userId: user.sub,
    });
  }

  /**
   * Résout le contexte de sécurité de l'utilisateur pour le journal des opérations :
   * types autorisés (rôle) + périmètre strict (caisses/portefeuilles accessibles).
   * Bloque les demandeurs purs. Réutilisé par la liste et l'export.
   */
  private async resolveOperationScope(userSub: string): Promise<OperationScope> {
    const codes = await this.authz.getUserRoleCodes(userSub);
    const isAdmin = codes.has('SUPER_ADMIN') || codes.has('ADMINISTRATEUR');
    const isCaissier = codes.has('CAISSIER');
    const isValidateur = codes.has('VALIDATEUR');
    if (!isAdmin && !isCaissier && !isValidateur && codes.has('DEMANDEUR')) {
      throw new ForbiddenException('Accès au journal des opérations refusé.');
    }
    let allowedTypes: string[] | undefined;
    if (!isAdmin) {
      if (isCaissier) allowedTypes = ['RECHARGE', 'DECAISSEMENT'];
      else if (isValidateur) allowedTypes = ['DECAISSEMENT'];
      // sinon (ex. gestionnaire de portefeuille) : pas de restriction de type, mais
      // le périmètre strict ci-dessous s'applique quand même.
    }
    let allowedCaisseIds: string[] | undefined;
    let allowedPortefeuilleIds: string[] | undefined;
    if (!isAdmin) {
      const caisses = await this.authz.getCaissePerimeter(userSub);
      const ptfs = await this.authz.getPortefeuillePerimeter(userSub);
      // null (aucun accès explicite) → tableau vide : ne donne accès à rien via cet axe
      // (l'utilisateur voit tout de même ses propres opérations, cf. scope dans le service).
      allowedCaisseIds = caisses ? Array.from(caisses).map(String) : [];
      allowedPortefeuilleIds = ptfs ? Array.from(ptfs).map(String) : [];
    }
    return { isAdmin, allowedTypes, allowedCaisseIds, allowedPortefeuilleIds, currentUserId: userSub };
  }

  @Get('operations')
  @ApiOperation({ summary: 'Lister les opérations (filtres + tri + périmètre, exécutés en BD)' })
  async findAllOperations(
    @CurrentUser() user: JwtPayload,
    @Query('type') type?: string,
    @Query('search') search?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('portefeuilleId') portefeuilleId?: string,
    @Query('costCenterId') costCenterId?: string,
    @Query('userId') userId?: string,
  ) {
    const scope = await this.resolveOperationScope(user.sub);
    return this.ledgerService.findAllOperations({
      type: type as any,
      search,
      dateFrom,
      dateTo,
      sortBy,
      sortDir: sortDir === 'asc' ? 'asc' : sortDir === 'desc' ? 'desc' : undefined,
      portefeuilleId,
      costCenterId,
      userId,
      scope,
    });
  }

  @Get('operations/export')
  @ApiOperation({ summary: 'Exporter les opérations filtrées en Excel (.xlsx)' })
  async exportOperations(
    @Res() res: Response,
    @CurrentUser() user: JwtPayload,
    @Query('type') type?: string,
    @Query('search') search?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('portefeuilleId') portefeuilleId?: string,
    @Query('costCenterId') costCenterId?: string,
    @Query('userId') userId?: string,
  ) {
    // Mêmes restrictions (rôle + périmètre) et mêmes filtres que la liste.
    const scope = await this.resolveOperationScope(user.sub);
    const buffer = await this.ledgerService.exportOperationsXlsx({
      type: type as any,
      search,
      dateFrom,
      dateTo,
      portefeuilleId,
      costCenterId,
      userId,
      scope,
    });
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="operations.xlsx"',
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  @Get('operations/caisse/:caisseId')
  @ApiOperation({ summary: 'Lister les opérations d\'une caisse' })
  async getCaisseOperations(@Param('caisseId') caisseId: string) {
    return this.ledgerService.getCaisseOperations(caisseId);
  }

  @Get('operations/portefeuille/:portefeuilleId')
  @ApiOperation({ summary: 'Lister les opérations d\'un portefeuille' })
  async getPortefeuilleOperations(@Param('portefeuilleId') portefeuilleId: string) {
    return this.ledgerService.getPortefeuilleOperations(portefeuilleId);
  }

  // Écritures Comptables (Partie Double)
  @Post('ecritures')
  @Roles('ADMINISTRATEUR')
  @ApiOperation({ summary: 'Créer une écriture comptable (immuable) — réservé admin' })
  @HttpCode(HttpStatus.CREATED)
  async createEcriture(@Body() dto: CreateEcritureRequest & { transactionUuid: string }) {
    return this.ledgerService.createEcriture(dto, dto.transactionUuid);
  }

  @Post('ecritures/paired')
  @Roles('ADMINISTRATEUR')
  @ApiOperation({ summary: 'Créer une paire d\'écritures (débit + crédit) équilibrée — réservé admin' })
  async createPaired(
    @Body()
    dto: {
      debit: CreateEcritureRequest & { compteId: string; typeCompte: string };
      credit: CreateEcritureRequest & { compteId: string; typeCompte: string };
      montant: string;
      transactionUuid: string;
    },
  ) {
    return this.ledgerService.createPairedEcritures(
      dto.debit as any,
      dto.credit as any,
      dto.montant,
      dto.transactionUuid,
    );
  }

  @Get('balance/:compteId')
  @ApiOperation({ summary: 'Calculer le solde d\'un compte (SUM(crédits) - SUM(débits))' })
  async calculateBalance(
    @Param('compteId') compteId: string,
    @Query('typeCompte') typeCompte: string,
  ) {
    const balance = await this.ledgerService.calculateBalance(compteId, typeCompte as any);
    return { compteId, typeCompte, balance };
  }

  @Get('transactions/:transactionUuid/verify')
  @ApiOperation({ summary: 'Vérifier que les écritures d\'une transaction sont équilibrées' })
  async verifyTransaction(@Param('transactionUuid') transactionUuid: string) {
    const isBalanced = await this.ledgerService.verifyTransactionBalance(transactionUuid);
    return { transactionUuid, isBalanced, status: isBalanced ? 'OK' : 'ERREUR' };
  }

  @Get('transactions/:transactionUuid/ecritures')
  @ApiOperation({ summary: 'Lister les écritures d\'une transaction' })
  async getTransactionEcritures(@Param('transactionUuid') transactionUuid: string) {
    return this.ledgerService.getTransactionEcritures(transactionUuid);
  }
}
