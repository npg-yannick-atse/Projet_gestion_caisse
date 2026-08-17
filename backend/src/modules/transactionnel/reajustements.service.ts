import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LedgerService } from './ledger.service';
import { AuthorizationService } from '@modules/security/authorization.service';

export interface DemandeReajustement {
  id: string;
  portefeuilleId: string;
  mois: string;
  montant: string;
  sens: 'CAISSE_VERS_PORTEFEUILLE' | 'PORTEFEUILLE_VERS_CAISSE';
  deviseId: string;
  caisseId: string;
  soldeConstate: string;
  plafond: string;
  statut: 'EN_ATTENTE' | 'APPROUVEE' | 'REFUSEE' | 'ECHEC';
  erreur?: string | null;
  createdAt: string;
  portefeuilleLibelle?: string | null;
  caisseLibelle?: string | null;
  deviseCode?: string | null;
}

/**
 * Validation des réajustements de budget mensuel.
 *
 * Le calcul propose, l'humain dispose : aucune somme ne bouge tant qu'une
 * personne habilitée n'a pas approuvé. C'est la leçon des 999 milliards partis
 * d'un portefeuille vers une caisse sans que personne l'ait demandé.
 */
@Injectable()
export class ReajustementsService {
  private readonly logger = new Logger('Reajustements');

  constructor(
    private readonly dataSource: DataSource,
    private readonly ledger: LedgerService,
    private readonly authz: AuthorizationService,
  ) {}

  /** Demandes, filtrées EN BASE par statut. */
  async lister(statut?: string): Promise<DemandeReajustement[]> {
    return this.dataSource.query(
      `SELECT d.id, d.portefeuille_id AS portefeuilleId, d.mois, d.montant, d.sens,
              d.devise_id AS deviseId, d.caisse_id AS caisseId,
              d.solde_constate AS soldeConstate, d.plafond, d.statut, d.erreur,
              d.created_at AS createdAt,
              CONCAT(p.code, ' — ', p.libelle) AS portefeuilleLibelle,
              CONCAT(c.code, ' — ', c.libelle) AS caisseLibelle,
              v.code AS deviseCode
         FROM dbo.trx_demande_reajustement d
         JOIN dbo.fin_portefeuille p ON p.id = d.portefeuille_id
         JOIN dbo.fin_caisse c       ON c.id = d.caisse_id
         JOIN dbo.fin_devise v       ON v.id = d.devise_id
        ${statut ? 'WHERE d.statut = @0' : ''}
        ORDER BY d.id DESC`,
      statut ? [statut] : [],
    );
  }

  /**
   * Approuve une demande ET exécute le mouvement.
   *
   * L'exécution passe par le point d'entrée commun du grand livre, qui vérifie
   * que la caisse détient bien la devise. Une caisse vide fait donc échouer
   * l'approbation : la demande passe en ÉCHEC avec sa raison, plutôt que de
   * creuser un solde négatif en silence. Elle reste rejouable.
   */
  async approuver(id: string, userId: string, commentaire?: string): Promise<DemandeReajustement> {
    await this.authz.assertPermission(
      userId,
      'BUDGET_REAJUSTEMENT_VALIDER',
      'valider un réajustement de budget',
    );
    const demande = await this.chargerEnAttente(id);

    try {
      const txUuid = await this.dataSource.transaction(async (manager) => {
        const r = await this.ledger.mouvementCaissePortefeuille(
          {
            caisseId: String(demande.caisseId),
            portefeuilleId: String(demande.portefeuilleId),
            montant: String(demande.montant),
            sens: demande.sens,
            typeOperation: 'AJUSTEMENT',
            userId,
            reference: `Reset budget ${demande.mois}`,
          },
          manager,
        );
        // Le mois n'est marqué qu'ICI : tant que rien n'a bougé, le portefeuille
        // doit rester candidat au réajustement.
        await manager.query(
          `UPDATE dbo.fin_portefeuille
              SET budget_reset_mois = @0, budget_reset_erreur = NULL, budget_reset_tente_le = SYSUTCDATETIME()
            WHERE id = @1`,
          [demande.mois, String(demande.portefeuilleId)],
        );
        return (r as any)?.operation?.transactionUuid ?? null;
      });

      await this.dataSource.query(
        `UPDATE dbo.trx_demande_reajustement
            SET statut = 'APPROUVEE', decide_par_id = @0, date_decision = SYSUTCDATETIME(),
                commentaire = @1, transaction_uuid = @2, erreur = NULL
          WHERE id = @3`,
        [userId, commentaire ?? null, txUuid, id],
      );
    } catch (e) {
      const raison = (e as Error).message;
      this.logger.warn(`Réajustement ${id} refusé par le grand livre : ${raison}`);
      await this.dataSource.query(
        `UPDATE dbo.trx_demande_reajustement
            SET statut = 'ECHEC', erreur = @0, decide_par_id = @1, date_decision = SYSUTCDATETIME()
          WHERE id = @2`,
        [raison.slice(0, 500), userId, id],
      );
      throw new BadRequestException(raison);
    }

    return (await this.lister()).find((d) => String(d.id) === String(id))!;
  }

  /** Refuse une demande. Rien ne bouge, et le portefeuille reste hors plafond. */
  async refuser(id: string, userId: string, commentaire?: string): Promise<void> {
    await this.authz.assertPermission(
      userId,
      'BUDGET_REAJUSTEMENT_VALIDER',
      'valider un réajustement de budget',
    );
    await this.chargerEnAttente(id);
    await this.dataSource.query(
      `UPDATE dbo.trx_demande_reajustement
          SET statut = 'REFUSEE', decide_par_id = @0, date_decision = SYSUTCDATETIME(), commentaire = @1
        WHERE id = @2`,
      [userId, commentaire ?? null, id],
    );
  }

  private async chargerEnAttente(id: string): Promise<DemandeReajustement> {
    const [d] = await this.dataSource.query(
      `SELECT id, portefeuille_id AS portefeuilleId, mois, montant, sens,
              devise_id AS deviseId, caisse_id AS caisseId, statut
         FROM dbo.trx_demande_reajustement WHERE id = @0`,
      [id],
    );
    if (!d) throw new NotFoundException(`Demande de réajustement ${id} introuvable`);
    // ÉCHEC est rejouable : la caisse a pu être approvisionnée entre-temps.
    if (d.statut !== 'EN_ATTENTE' && d.statut !== 'ECHEC') {
      throw new BadRequestException(`Cette demande est déjà ${d.statut.toLowerCase()}.`);
    }
    return d;
  }
}
