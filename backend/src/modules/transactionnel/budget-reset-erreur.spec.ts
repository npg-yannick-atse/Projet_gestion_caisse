import { BudgetMensuelService } from './budget-mensuel.service';

/**
 * Le réajustement mensuel PROPOSE, il ne déplace plus l'argent.
 *
 * Il portait autrefois chaque portefeuille à son plafond en débitant sa caisse,
 * tout seul, au premier passage du mois. C'est ainsi que 999 milliards sont
 * partis d'un portefeuille vers une caisse, à la surprise générale. Il produit
 * désormais une DEMANDE ; l'exécution attend un accord humain
 * (cf. reajustement-validation.spec.ts).
 *
 * Ce fichier couvrait l'ancien comportement — la raison d'échec écrite sur le
 * portefeuille au moment où le mouvement échouait. Ce moment n'existe plus ici,
 * mais le filet reste : si la CRÉATION de la demande échoue, la raison
 * s'inscrit toujours, pour qu'un portefeuille à 0 ne reste jamais muet.
 */
function monter({ jour = '1', echecInsert }: { jour?: string; echecInsert?: string } = {}) {
  const portefeuille = {
    id: '7',
    code: 'P_CI_XOF',
    deviseId: '1',
    caisseSourceId: '4',
    soldeInitial: '0',
    budgetMensuel: '1000000000',
    budgetResetMois: null,
    estActif: true,
  };
  const majs: any[] = [];
  const sql: string[] = [];

  const repo = {
    find: jest.fn(async () => [portefeuille]),
    update: jest.fn(async (critere: any, valeurs: any) => {
      majs.push({ critere, valeurs });
      return { affected: 1 };
    }),
    createQueryBuilder: jest.fn(() => ({
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(async () => ({ userId: '2' })),
    })),
  };

  const dataSource = {
    getRepository: jest.fn(() => repo),
    query: jest.fn(async (q: string) => {
      sql.push(q.replace(/\s+/g, ' ').trim());
      if (q.includes('app_parametre')) return [{ valeur: jour }];
      // Aucune demande vivante préexistante.
      if (q.includes('SELECT TOP 1 id FROM dbo.trx_demande_reajustement')) return [];
      if (q.includes('INSERT INTO dbo.trx_demande_reajustement') && echecInsert) {
        throw new Error(echecInsert);
      }
      return [];
    }),
    transaction: jest.fn(async (cb: any) => cb({ getRepository: jest.fn(() => repo) })),
  };
  const ledger = { calculateBalance: jest.fn(async () => '0') };

  return { service: new BudgetMensuelService(dataSource as any, ledger as any), majs, sql };
}

describe('réajustement mensuel : proposition, pas exécution', () => {
  it('crée une demande au lieu de déplacer les fonds', async () => {
    const { service, sql, majs } = monter();

    const n = await service.reconcileAll();

    expect(n).toBe(1);
    expect(sql.some((q) => q.includes('INSERT INTO dbo.trx_demande_reajustement'))).toBe(true);
    // Le mois N'EST PAS marqué : rien n'a bougé, le portefeuille reste candidat.
    expect(majs.some((m) => m.valeurs.budgetResetMois)).toBe(false);
  });

  it('ne produit rien tant que le jour du mois n’est pas venu', async () => {
    // Paramètre à 31 : au 17 du mois, il est trop tôt.
    const { service, sql } = monter({ jour: '31' });

    const n = await service.reconcileAll();

    expect(n).toBe(0);
    expect(sql.some((q) => q.includes('INSERT INTO dbo.trx_demande_reajustement'))).toBe(false);
  });

  it('inscrit la raison sur le portefeuille si la demande ne peut pas être créée', async () => {
    const { service, majs } = monter({ echecInsert: 'Violation de contrainte' });

    await service.reconcileAll();

    // Sans cette trace, un portefeuille à 0 resterait muet — c'est le défaut
    // qui a fait redémarrer le backend en vain le 17/08/2026.
    const maj = majs.find((m) => m.valeurs.budgetResetErreur);
    expect(maj?.valeurs.budgetResetErreur).toBe('Violation de contrainte');
    expect(maj?.valeurs.budgetResetTenteLe).toBeInstanceOf(Date);
  });

  it('tronque une raison trop longue plutôt que de faire échouer l’écriture', async () => {
    const { service, majs } = monter({ echecInsert: 'x'.repeat(900) });

    await service.reconcileAll();

    expect(majs.find((m) => m.valeurs.budgetResetErreur)?.valeurs.budgetResetErreur).toHaveLength(500);
  });
});
