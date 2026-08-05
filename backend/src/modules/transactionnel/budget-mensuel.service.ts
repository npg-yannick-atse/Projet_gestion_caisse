import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { DataSource, IsNull, Not } from 'typeorm';
import { Portefeuille } from '@modules/financier/entities/portefeuille.entity';
import { Role } from '@modules/security/entities/role.entity';
import { UserRole } from '@modules/security/entities/user-role.entity';
import { LedgerService } from './ledger.service';
import { TypeCompte } from './entities/ecriture-comptable.entity';

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
  async reconcileAll(): Promise<number> {
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
        this.logger.warn(`réajustement du portefeuille ${pf.id} échoué : ${(e as Error).message}`);
      }
    }
    if (n > 0) this.logger.log(`Budget mensuel ${mois} : ${n} portefeuille(s) réajusté(s).`);
    return n;
  }

  /** Réajuste un portefeuille à son plafond, en transaction, puis marque le mois traité. */
  private async resetOne(pf: Portefeuille, mois: string, userId: string): Promise<void> {
    const cap = Number(pf.budgetMensuel);
    // Disponible réel = solde initial + mouvements (même définition que
    // getSoldeDetail et la garde de recharge inverse) : on réajuste le disponible
    // EXACTEMENT au plafond, sinon un soldeInitial > 0 finance au-dessus du plafond.
    const soldeInitial = Number(pf.soldeInitial || 0);
    const solde =
      soldeInitial +
      // Dans la devise du portefeuille : additionner plusieurs devises fausserait
      // le réajustement du plafond mensuel.
      Number(await this.ledger.calculateBalance(String(pf.id), 'PORTEFEUILLE', String(pf.deviseId)));
    const delta = Number((cap - solde).toFixed(4));

    await this.dataSource.transaction(async (manager) => {
      if (delta !== 0) {
        const montant = Math.abs(delta).toFixed(4);
        const op = await this.ledger.createOperation(
          {
            typeOperation: 'AJUSTEMENT',
            caisseId: String(pf.caisseSourceId),
            portefeuilleId: String(pf.id),
            montant,
            deviseId: String(pf.deviseId),
            userId,
            reference: `Reset budget ${mois}`,
          },
          manager,
        );
        const caisseLeg = {
          compteId: String(pf.caisseSourceId),
          typeCompte: 'CAISSE' as TypeCompte,
          deviseId: String(pf.deviseId),
        };
        const ptfLeg = {
          compteId: String(pf.id),
          typeCompte: 'PORTEFEUILLE' as TypeCompte,
          deviseId: String(pf.deviseId),
        };
        // delta > 0 : recharge (caisse → portefeuille) ; delta < 0 : reprise (portefeuille → caisse).
        const [debit, credit] = delta > 0 ? [caisseLeg, ptfLeg] : [ptfLeg, caisseLeg];
        await this.ledger.createPairedEcritures(debit, credit, montant, op.transactionUuid, manager);
      }
      await manager.getRepository(Portefeuille).update({ id: pf.id as any }, { budgetResetMois: mois });
    });
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
