import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { DataSource, IsNull, Not } from 'typeorm';
import { Portefeuille } from '@modules/financier/entities/portefeuille.entity';
import { Role } from '@modules/security/entities/role.entity';
import { UserRole } from '@modules/security/entities/user-role.entity';
import { LedgerService } from './ledger.service';

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 h

/**
 * Budget mensuel (Modèle A — recharge mensuelle, sans report).
 * Au passage dans un nouveau mois, chaque portefeuille ayant un `budgetMensuel`
 * est réajusté EXACTEMENT à ce plafond :
 *   - solde < plafond  → recharge du manque (DÉBIT caisse source / CRÉDIT portefeuille)
 *   - solde > plafond  → reprise du reliquat (DÉBIT portefeuille / CRÉDIT caisse source)
 * Idempotent via `budget_reset_mois` (un seul réajustement par mois et par portefeuille).
 * Déclenché au démarrage puis toutes les heures (planificateur léger, sans dépendance).
 */
@Injectable()
export class BudgetMensuelService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('BudgetMensuel');
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly dataSource: DataSource,
    private readonly ledger: LedgerService,
  ) {}

  onModuleInit(): void {
    this.reconcileAll().catch((e) => this.logger.warn(`reset budget initial échoué : ${(e as Error).message}`));
    this.timer = setInterval(() => {
      this.reconcileAll().catch((e) => this.logger.warn(`reset budget échoué : ${(e as Error).message}`));
    }, CHECK_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Mois courant au format 'YYYY-MM' (UTC). */
  private currentMonth(): string {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Réajuste tous les portefeuilles à plafond mensuel non encore réinitialisés ce mois.
   * Renvoie le nombre de portefeuilles traités.
   */
  /**
   * Le jour du mois est-il venu ? (paramètre `BUDGET_RESET_JOUR`, 1 par défaut)
   *
   * Un « 31 » sur un mois de trente jours ne doit pas SAUTER le mois : on le
   * ramène au dernier jour. Sans ce repli, février ne serait jamais réajusté.
   *
   * La comparaison est un « au-delà ou égal », pas une égalité : si personne
   * n'allume le serveur le jour dit, la demande se produit au prochain passage
   * plutôt que d'attendre le mois suivant.
   */
  private async jourVenu(): Promise<boolean> {
    const [row] = await this.dataSource.query(
      `SELECT valeur FROM dbo.app_parametre WHERE cle = 'BUDGET_RESET_JOUR'`,
    );
    const voulu = Math.max(1, Math.min(31, Number(row?.valeur ?? 1) || 1));
    const maintenant = new Date();
    const dernierJour = new Date(
      Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() + 1, 0),
    ).getUTCDate();
    return maintenant.getUTCDate() >= Math.min(voulu, dernierJour);
  }

  async reconcileAll(): Promise<number> {
    if (!(await this.jourVenu())) return 0;
    const mois = this.currentMonth();
    const repo = this.dataSource.getRepository(Portefeuille);
    const cibles = await repo.find({ where: { estActif: true, budgetMensuel: Not(IsNull()) } });
    const aTraiter = cibles.filter((p) => p.budgetResetMois !== mois && p.budgetMensuel != null);
    if (aTraiter.length === 0) return 0;

    const systemUserId = await this.resolveSystemUserId();
    if (!systemUserId) {
      this.logger.warn('Aucun utilisateur administrateur trouvé : réajustement du budget mensuel ignoré.');
      return 0;
    }

    let n = 0;
    for (const pf of aTraiter) {
      try {
        await this.resetOne(pf, mois, systemUserId);
        n++;
      } catch (e) {
        const raison = (e as Error).message;
        this.logger.warn(`réajustement du portefeuille ${pf.id} échoué : ${raison}`);
        /*
         * L'ÉCHEC S'ÉCRIT. Il ne partait que dans ce journal : l'écran montrait
         * un portefeuille à 0 en face d'un budget d'un milliard, sans un mot,
         * et l'on redémarrait le backend en croyant débloquer la situation.
         *
         * Écrit HORS de la transaction de `resetOne` — celle-ci a été annulée,
         * y consigner l'erreur l'aurait effacée avec le reste.
         */
        await repo
          .update(
            { id: pf.id as any },
            { budgetResetErreur: raison.slice(0, 500), budgetResetTenteLe: new Date() },
          )
          .catch(() => undefined);
      }
    }
    if (n > 0) this.logger.log(`Budget mensuel ${mois} : ${n} portefeuille(s) réajusté(s).`);
    return n;
  }

  /**
   * Produit la DEMANDE de réajustement d'un portefeuille — sans toucher à l'argent.
   *
   * Le réajustement déplaçait autrefois les fonds tout seul : au premier passage
   * du mois, il portait le portefeuille à son plafond en débitant sa caisse,
   * sans que personne l'ait décidé. C'est ainsi que 999 milliards sont partis
   * d'un portefeuille vers une caisse, à la surprise générale.
   *
   * Il PROPOSE désormais. L'écart est calculé et consigné avec le solde et le
   * plafond qui l'ont produit — de quoi juger sans refaire l'addition — et
   * l'exécution attend un accord explicite.
   */
  private async resetOne(pf: Portefeuille, mois: string, _userId: string): Promise<void> {
    const cap = Number(pf.budgetMensuel);
    // Disponible réel = solde initial + mouvements (même définition que
    // getSoldeDetail et la garde de recharge inverse).
    const soldeInitial = Number(pf.soldeInitial || 0);
    const solde =
      soldeInitial +
      // Dans la devise du portefeuille : additionner plusieurs devises fausserait
      // le réajustement du plafond mensuel.
      Number(await this.ledger.calculateBalance(String(pf.id), 'PORTEFEUILLE', String(pf.deviseId)));
    const delta = Number((cap - solde).toFixed(4));

    // Déjà exactement au plafond : rien à proposer, le mois est réputé traité.
    if (delta === 0) {
      await this.dataSource
        .getRepository(Portefeuille)
        .update(
          { id: pf.id as any },
          { budgetResetMois: mois, budgetResetErreur: null, budgetResetTenteLe: new Date() },
        );
      return;
    }

    // Une demande vivante existe déjà pour ce mois : on n'en empile pas une
    // seconde à chaque passage horaire.
    const [dejaLa] = await this.dataSource.query(
      `SELECT TOP 1 id FROM dbo.trx_demande_reajustement
        WHERE portefeuille_id = @0 AND mois = @1 AND statut IN ('EN_ATTENTE', 'APPROUVEE')`,
      [String(pf.id), mois],
    );
    if (dejaLa) return;

    await this.dataSource.query(
      `INSERT INTO dbo.trx_demande_reajustement
         (portefeuille_id, mois, montant, sens, devise_id, caisse_id, solde_constate, plafond)
       VALUES (@0, @1, @2, @3, @4, @5, @6, @7)`,
      [
        String(pf.id),
        mois,
        Math.abs(delta).toFixed(4),
        delta > 0 ? 'CAISSE_VERS_PORTEFEUILLE' : 'PORTEFEUILLE_VERS_CAISSE',
        String(pf.deviseId),
        String(pf.caisseSourceId),
        solde.toFixed(4),
        cap.toFixed(4),
      ],
    );

    this.logger.log(
      `Demande de réajustement créée : portefeuille ${pf.id}, ${mois}, ${Math.abs(delta).toFixed(4)}.`,
    );
  }

  /** Premier utilisateur admin (acteur « système » des écritures de réajustement). */
  private async resolveSystemUserId(): Promise<string | null> {
    const row: { userId?: string } | undefined = await this.dataSource
      .getRepository(UserRole)
      .createQueryBuilder('ur')
      .innerJoin(Role, 'r', 'r.id = ur.role_id')
      .where('r.code IN (:...codes)', { codes: ['SUPER_ADMIN', 'ADMINISTRATEUR'] })
      .select('ur.user_id', 'userId')
      .getRawOne();
    return row?.userId ? String(row.userId) : null;
  }
}
