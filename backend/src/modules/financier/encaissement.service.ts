import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Caisse } from './entities/caisse.entity';
import { Devise } from './entities/devise.entity';
import { Operation } from '@modules/transactionnel/entities/operation.entity';
import { EcritureComptable } from '@modules/transactionnel/entities/ecriture-comptable.entity';
import { LedgerService } from '@modules/transactionnel/ledger.service';
import { AuthorizationService } from '@modules/security/authorization.service';

interface EncaissementInput {
  caisseId: string;
  montant: string;
  /** Devise reçue. Par défaut, la devise déclarée de la caisse. */
  deviseId?: string;
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
   * Devise retenue pour l'encaissement : celle demandée si elle est fournie et
   * active, sinon la devise déclarée de la caisse.
   *
   * On refuse une devise inconnue ou désactivée plutôt que de retomber
   * silencieusement sur celle de la caisse : le montant serait enregistré dans
   * une autre monnaie que celle réellement reçue, et le solde deviendrait faux.
   */
  private async resolveDevise(
    demandee: string | undefined,
    caisse: Caisse,
    manager: EntityManager,
  ): Promise<string> {
    if (!demandee || String(demandee) === String(caisse.deviseId)) {
      return String(caisse.deviseId);
    }
    const devise = await manager.getRepository(Devise).findOne({ where: { id: demandee as any } });
    if (!devise) throw new NotFoundException(`Devise ${demandee} introuvable`);
    if (devise.estActif === false) {
      throw new BadRequestException(`La devise ${devise.code} est désactivée.`);
    }
    return String(devise.id);
  }

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
    await this.authz.assertPermission(
      input.userId,
      'ENCAISSEMENT_CREER',
      'effectuer un encaissement',
    );
    await this.authz.assertCaisseInPerimeter(input.userId, input.caisseId);

    return this.dataSource.transaction(async (manager) => {
      const caisse = await manager.getRepository(Caisse).findOne({ where: { id: input.caisseId } });
      if (!caisse) throw new NotFoundException(`Caisse ${input.caisseId} introuvable`);
      if (caisse.statut !== 'OUVERTE') {
        throw new BadRequestException(`La caisse ${caisse.code} est fermée`);
      }

      // Devise de l'encaissement. Une caisse a bien une devise DÉCLARÉE, mais
      // elle peut en détenir d'autres : un client qui paie en dollars ne doit
      // pas être enregistré en francs sous prétexte que la caisse est en XOF.
      // La devise de la caisse ne sert donc que de valeur par défaut.
      const deviseId = await this.resolveDevise(input.deviseId, caisse, manager);

      const operation = await this.ledgerService.createOperation(
        {
          typeOperation: 'ENCAISSEMENT',
          caisseId: caisse.id,
          montant: input.montant,
          deviseId,
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
      const recetteAcc = { compteId: caisse.id, typeCompte: 'RECETTE' as const, deviseId };
      const caisseAcc = { compteId: caisse.id, typeCompte: 'CAISSE' as const, deviseId };
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
