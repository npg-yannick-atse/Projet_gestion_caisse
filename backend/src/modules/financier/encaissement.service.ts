import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Caisse } from './entities/caisse.entity';
import { Devise } from './entities/devise.entity';
import { Operation } from '@modules/transactionnel/entities/operation.entity';
import { EcritureComptable } from '@modules/transactionnel/entities/ecriture-comptable.entity';
import { LedgerService } from '@modules/transactionnel/ledger.service';
import { AuthorizationService } from '@modules/security/authorization.service';
import { TauxChangeService } from './taux-change.service';

interface EncaissementInput {
  caisseId: string;
  montant: string;
  /** Devise reçue. Par défaut, la devise déclarée de la caisse. */
  deviseId?: string;
  /**
   * Taux RÉELLEMENT obtenu pour cet encaissement. L'écran le pré-remplit avec
   * le cours du jour et le caissier le corrige s'il a eu autre chose : ce qui
   * arrive ici est donc ce qu'il a validé, pas une estimation.
   *
   * Absent = on ne sait pas ; rien n'est figé et la consolidation retombera sur
   * le cours du jour.
   */
  tauxApplique?: string;
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
    private readonly tauxChange: TauxChangeService,
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
   * Fige ce que l'encaissement a valu, quand un taux a été validé à la saisie.
   *
   * On NE retombe PAS sur le cours du jour quand rien n'est fourni : ce serait
   * enregistrer une estimation là où la colonne promet un fait. L'absence est
   * une information — elle dit « on ne sait pas », et la consolidation sait
   * déjà quoi en faire.
   *
   * Le résultat est arrondi aux décimales de la devise de référence, et figé :
   * l'arrondi d'aujourd'hui ne doit pas dépendre d'un recalcul de demain.
   */
  private async figerConversion(
    tauxSaisi: string | undefined,
    deviseRecue: string,
    montant: string,
    caisse: Caisse,
    manager: EntityManager,
  ): Promise<{
    /** Devise et montant réellement CRÉDITÉS en caisse. */
    deviseCreditee: string;
    montantCredite: string;
    tauxApplique?: string;
    contreValeur?: string;
    deviseContreValeurId?: string;
  }> {
    const memeDevise = String(deviseRecue) === String(caisse.deviseId);

    if (memeDevise) {
      if (tauxSaisi) {
        const d = await manager.getRepository(Devise).findOne({ where: { id: deviseRecue as any } });
        throw new BadRequestException(
          `Un taux n'a pas de sens ici : l'argent est déjà en ${d?.code ?? 'cette devise'}.`,
        );
      }
      return { deviseCreditee: String(caisse.deviseId), montantCredite: montant };
    }

    // DÉCISION MÉTIER (12/08/2026) : les devises étrangères sont converties AU
    // GUICHET. Le coffre ne conserve donc pas d'euros — il reçoit leur
    // contre-valeur dans SA devise. Sans taux, on ne saurait pas quoi créditer :
    // il devient obligatoire dès que les devises diffèrent.
    const [recue, cible] = await Promise.all([
      manager.getRepository(Devise).findOne({ where: { id: deviseRecue as any } }),
      manager.getRepository(Devise).findOne({ where: { id: caisse.deviseId as any } }),
    ]);
    if (!tauxSaisi) {
      throw new BadRequestException(
        `Indiquez le taux appliqué pour convertir les ${recue?.code ?? 'devises reçues'} ` +
          `en ${cible?.code ?? 'devise de la caisse'}.`,
      );
    }

    const taux = parseFloat(tauxSaisi);
    if (!Number.isFinite(taux) || taux <= 0) {
      throw new BadRequestException('Le taux appliqué doit être un nombre supérieur à zéro.');
    }

    // L'arrondi est FIGÉ aux décimales de la devise créditée : recalculé plus
    // tard, il donnerait un écart et plus personne ne saurait lequel fait foi.
    const credite = (parseFloat(montant) * taux).toFixed(cible?.nbDecimales ?? 4);
    if (!(parseFloat(credite) > 0)) {
      throw new BadRequestException(
        `La conversion donne ${credite} ${cible?.code ?? ''} : vérifiez le montant et le taux.`,
      );
    }

    return {
      deviseCreditee: String(caisse.deviseId),
      montantCredite: credite,
      tauxApplique: tauxSaisi,
      // La contre-valeur EST ce qui est entré en caisse. Elle n'est plus une
      // information parallèle : c'est le montant de l'écriture.
      contreValeur: credite,
      deviseContreValeurId: String(caisse.deviseId),
    };
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
      const deviseRecue = await this.resolveDevise(input.deviseId, caisse, manager);
      const { deviseCreditee, montantCredite, ...conversion } = await this.figerConversion(
        input.tauxApplique,
        deviseRecue,
        input.montant,
        caisse,
        manager,
      );

      // L'opération garde ce que le CLIENT A REMIS (montant + devise reçue) ;
      // la conversion dit ce qui est entré en caisse. Les deux sont des faits,
      // et aucun ne se déduit de l'autre une fois le taux du jour périmé.
      const operation = await this.ledgerService.createOperation(
        {
          typeOperation: 'ENCAISSEMENT',
          caisseId: caisse.id,
          montant: input.montant,
          deviseId: deviseRecue,
          userId: input.userId,
          reference: input.reference,
          clientNom: input.clientNom,
          clientNumero: input.clientNumero,
          motif: input.motif,
          ...conversion,
        },
        manager,
      );

      // Partie double : DÉBIT recette / CRÉDIT caisse (la caisse monte).
      // Les écritures portent le montant CRÉDITÉ, dans la devise de la caisse :
      // les devises étrangères sont converties au guichet, le coffre n'en
      // conserve pas. La contrepartie RECETTE est rattachée à la caisse pour
      // rester traçable et regroupable par caisse.
      const recetteAcc = { compteId: caisse.id, typeCompte: 'RECETTE' as const, deviseId: deviseCreditee };
      const caisseAcc = { compteId: caisse.id, typeCompte: 'CAISSE' as const, deviseId: deviseCreditee };
      const ecritures = await this.ledgerService.createPairedEcritures(
        recetteAcc,
        caisseAcc,
        montantCredite,
        operation.transactionUuid,
        manager,
      );

      return { operation, ecritures };
    });
  }
}
