import { BudgetMensuelService } from './budget-mensuel.service';

/**
 * Un réajustement mensuel manqué doit LAISSER SA RAISON sur le portefeuille.
 *
 * L'échec ne partait que dans un avertissement de journal côté serveur :
 * l'écran montrait un portefeuille à 0 en face d'un budget d'un milliard, sans
 * un mot. On redémarrait le backend en croyant débloquer la situation, et il
 * ne se passait rien de visible — le vrai motif étant que la caisse source,
 * vidée, ne pouvait pas financer la recharge.
 */
function monter({ echec }: { echec?: string } = {}) {
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
    transaction: jest.fn(async (cb: any) => cb({ getRepository: jest.fn(() => repo) })),
  };

  const ledger = {
    calculateBalance: jest.fn(async () => '0'),
    mouvementCaissePortefeuille: jest.fn(async () => {
      if (echec) throw new Error(echec);
      return {};
    }),
  };

  return { service: new BudgetMensuelService(dataSource as any, ledger as any), majs };
}

describe('réajustement mensuel : la raison de l’échec est conservée', () => {
  const messageCaisseVide =
    'La caisse C_CI_01_XOF ne détient pas assez de XOF (disponible : 0.0000). Approvisionnez-la dans cette devise avant de recharger.';

  it('écrit la raison sur le portefeuille quand la caisse est vide', async () => {
    const { service, majs } = monter({ echec: messageCaisseVide });

    const n = await service.reconcileAll();

    expect(n).toBe(0);
    const maj = majs.find((m) => m.valeurs.budgetResetErreur);
    expect(maj?.valeurs.budgetResetErreur).toBe(messageCaisseVide);
    expect(maj?.valeurs.budgetResetTenteLe).toBeInstanceOf(Date);
    // Le mois N'EST PAS marqué : la tentative doit se rejouer à l'heure suivante.
    expect(majs.some((m) => m.valeurs.budgetResetMois)).toBe(false);
  });

  it('efface la raison dès qu’un réajustement réussit', async () => {
    const { service, majs } = monter();

    const n = await service.reconcileAll();

    expect(n).toBe(1);
    const maj = majs.find((m) => m.valeurs.budgetResetMois);
    // Sinon un vieux message resterait affiché sur un portefeuille désormais sain.
    expect(maj?.valeurs.budgetResetErreur).toBeNull();
  });

  it('tronque un message trop long plutôt que de faire échouer l’écriture', async () => {
    const { service, majs } = monter({ echec: 'x'.repeat(900) });

    await service.reconcileAll();

    const maj = majs.find((m) => m.valeurs.budgetResetErreur);
    expect(maj?.valeurs.budgetResetErreur).toHaveLength(500);
  });
});
