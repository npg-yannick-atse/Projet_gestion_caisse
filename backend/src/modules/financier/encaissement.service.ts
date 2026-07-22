import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Caisse } from './entities/caisse.entity';
import { Operation } from '@modules/transactionnel/entities/operation.entity';
import { EcritureComptable } from '@modules/transactionnel/entities/ecriture-comptable.entity';
import { LedgerService } from '@modules/transactionnel/ledger.service';
import { AuthorizationService } from '@modules/security/authorization.service';

interface EncaissementInput {
  caisseId: string;
  montant: string;
  userId: string;
  clientNom?: string;
  clientNumero?: string;
  motif?: string;
  reference?: string;
}

@Injectable()
export class EncaissementService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly ledgerService: LedgerService,
    private readonly authz: AuthorizationService,
  ) {}

  /**
   * Encaissement : fait ENTRER de l'argent dans une caisse (miroir du décaissement).
   * Partie double : CRÉDIT caisse / DÉBIT recette (solde = Σcrédit − Σdébit, donc
   * la caisse monte). Opération + écritures dans une seule transaction ACID.
   */
  async encaisser(
    input: EncaissementInput,
  ): Promise<{ operation: Operation; ecritures: [EcritureComptable, EcritureComptable] }> {
    if (parseFloat(input.montant) <= 0) {
      throw new BadRequestException('Le montant doit être positif');
    }

    // Autorisation : encaissement réservé aux caissiers (+ admins), sur une caisse de son périmètre.
    await this.authz.assertAnyRole(input.userId, ['CAISSIER'], 'effectuer un encaissement');
    await this.authz.assertCaisseInPerimeter(input.userId, input.caisseId);

    return this.dataSource.transaction(async (manager) => {
      const caisse = await manager.getRepository(Caisse).findOne({ where: { id: input.caisseId } });
      if (!caisse) throw new NotFoundException(`Caisse ${input.caisseId} introuvable`);
      if (caisse.statut !== 'OUVERTE') {
        throw new BadRequestException(`La caisse ${caisse.code} est fermée`);
      }

      const operation = await this.ledgerService.createOperation(
        {
          typeOperation: 'ENCAISSEMENT',
          caisseId: caisse.id,
          montant: input.montant,
          deviseId: caisse.deviseId,
          userId: input.userId,
          reference: input.reference,
          clientNom: input.clientNom,
          clientNumero: input.clientNumero,
          motif: input.motif,
        },
        manager,
      );

      // Partie double : DÉBIT recette / CRÉDIT caisse (la caisse monte).
      // La contrepartie RECETTE est rattachée à la caisse (compteId = caisse) pour
      // rester traçable et regroupable par caisse.
      const recetteAcc = { compteId: caisse.id, typeCompte: 'RECETTE' as const, deviseId: caisse.deviseId };
      const caisseAcc = { compteId: caisse.id, typeCompte: 'CAISSE' as const, deviseId: caisse.deviseId };
      const ecritures = await this.ledgerService.createPairedEcritures(
        recetteAcc,
        caisseAcc,
        input.montant,
        operation.transactionUuid,
        manager,
      );

      return { operation, ecritures };
    });
  }
}
