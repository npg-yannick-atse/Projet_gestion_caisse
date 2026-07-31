import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Caisse } from './entities/caisse.entity';
import { Portefeuille } from './entities/portefeuille.entity';
import { Operation } from '@modules/transactionnel/entities/operation.entity';
import { EcritureComptable } from '@modules/transactionnel/entities/ecriture-comptable.entity';
import { LedgerService } from '@modules/transactionnel/ledger.service';
import { AuthorizationService } from '@modules/security/authorization.service';

export type RechargeSens = 'CAISSE_VERS_PORTEFEUILLE' | 'PORTEFEUILLE_VERS_CAISSE';

interface RechargeInput {
  caisseId: string;
  portefeuilleId: string;
  montant: string;
  userId: string;
  reference?: string;
  /** Sens du mouvement. Par défaut caisse → portefeuille (recharge classique). */
  sens?: RechargeSens;
}

@Injectable()
export class RechargeService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly ledgerService: LedgerService,
    private readonly authz: AuthorizationService,
  ) {}

  /**
   * Recharge un portefeuille depuis sa caisse source.
   * Mouvement interne en partie double : DÉBIT caisse / CRÉDIT portefeuille
   * (solde = Σcrédit − Σdébit, donc la caisse baisse et le portefeuille monte).
   * Opération + écritures dans une seule transaction ACID.
   */
  async recharge(
    input: RechargeInput,
  ): Promise<{ operation: Operation; ecritures: [EcritureComptable, EcritureComptable] }> {
    if (parseFloat(input.montant) <= 0) {
      throw new BadRequestException('Le montant doit être positif');
    }

    // Autorisation : recharge réservée aux caissiers (+ admins), sur une caisse de son périmètre.
    await this.authz.assertPermission(input.userId, 'RECHARGE_EXECUTER', 'effectuer une recharge');
    await this.authz.assertCaisseInPerimeter(input.userId, input.caisseId);

    return this.dataSource.transaction(async (manager) => {
      const caisse = await manager.getRepository(Caisse).findOne({ where: { id: input.caisseId } });
      if (!caisse) throw new NotFoundException(`Caisse ${input.caisseId} introuvable`);
      if (caisse.statut !== 'OUVERTE') {
        throw new BadRequestException(`La caisse ${caisse.code} est fermée`);
      }

      const portefeuille = await manager
        .getRepository(Portefeuille)
        .findOne({ where: { id: input.portefeuilleId } });
      if (!portefeuille) {
        throw new NotFoundException(`Portefeuille ${input.portefeuilleId} introuvable`);
      }
      if (portefeuille.caisseSourceId !== caisse.id) {
        throw new BadRequestException(
          `Le portefeuille ${portefeuille.code} n'est pas rattaché à la caisse ${caisse.code}`,
        );
      }
      if (portefeuille.deviseId !== caisse.deviseId) {
        throw new BadRequestException('Devise incohérente entre la caisse et le portefeuille');
      }

      const sens: RechargeSens = input.sens ?? 'CAISSE_VERS_PORTEFEUILLE';
      const inverse = sens === 'PORTEFEUILLE_VERS_CAISSE';

      // Sens inverse (portefeuille → caisse) : on ne peut pas renvoyer plus que le
      // solde disponible du portefeuille (budget initial + écritures).
      if (inverse) {
        const ledgerBal = await this.ledgerService.calculateBalance(portefeuille.id, 'PORTEFEUILLE');
        const dispo = Number(portefeuille.soldeInitial || 0) + Number(ledgerBal || 0);
        if (parseFloat(input.montant) > dispo) {
          throw new BadRequestException(
            `Solde du portefeuille ${portefeuille.code} insuffisant (disponible : ${dispo.toFixed(4)})`,
          );
        }
      }

      const operation = await this.ledgerService.createOperation(
        {
          typeOperation: 'RECHARGE',
          caisseId: caisse.id,
          portefeuilleId: portefeuille.id,
          montant: input.montant,
          deviseId: caisse.deviseId,
          userId: input.userId,
          reference: input.reference,
        },
        manager,
      );

      // Partie double : DÉBIT (1er) / CRÉDIT (2e). On inverse les deux comptes selon le sens.
      const caisseAcc = { compteId: caisse.id, typeCompte: 'CAISSE' as const, deviseId: caisse.deviseId };
      const ptfAcc = { compteId: portefeuille.id, typeCompte: 'PORTEFEUILLE' as const, deviseId: caisse.deviseId };
      const ecritures = await this.ledgerService.createPairedEcritures(
        inverse ? ptfAcc : caisseAcc,
        inverse ? caisseAcc : ptfAcc,
        input.montant,
        operation.transactionUuid,
        manager,
      );

      return { operation, ecritures };
    });
  }
}
