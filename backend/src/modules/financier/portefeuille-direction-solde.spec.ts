import { PortefeuillesService } from './portefeuilles.service';

/**
 * Un portefeuille de DIRECTION n'a pas de solde initial propre.
 *
 * Il est alimenté à son plafond au début de chaque mois par le réajustement du
 * budget, qui ramène le disponible EXACTEMENT au budget du centre de coût. Un
 * solde initial saisi à la main y était repris aussitôt : créé à 1 000
 * milliards face à un plafond de 1 milliard, un portefeuille s'est vu retirer
 * 999 milliards, renvoyés en caisse.
 *
 * L'écran a cessé de proposer le champ ; ce test garantit que le SERVEUR
 * l'ignore aussi — un appel direct à l'API ne doit pas le rétablir.
 */
function monter() {
  const cree: any[] = [];
  const repo = {
    findOne: jest.fn(async () => null),
    create: jest.fn((x: any) => x),
    save: jest.fn(async (x: any) => {
      cree.push(x);
      return { id: '9', ...x };
    }),
  };
  const service = new PortefeuillesService(
    repo as any,
    { calculateBalance: jest.fn(async () => '0'), hasEcritures: jest.fn(async () => false) } as any,
    { assertPermissionStrict: jest.fn(async () => undefined), assertPermission: jest.fn(async () => undefined) } as any,
  ) as any;
  // Le budget d'une direction vient du centre de coût : on le fixe.
  service.budgetDirection = jest.fn(async () => '1000000000');
  return { service, cree };
}

describe('solde initial et portefeuille de direction', () => {
  it('ignore le solde initial envoyé pour une DIRECTION', async () => {
    const { service, cree } = monter();

    await service.create(
      {
        code: 'P_CI_XOF',
        libelle: 'Portefeuille CI XOF',
        caisseSourceId: '4',
        deviseId: '1',
        proprietaireType: 'DIRECTION',
        proprietaireId: '28',
        // Le montant qui a causé l'incident : repris dès le réajustement.
        soldeInitial: '1000000000000',
      },
      '2',
    );

    expect(cree[0].soldeInitial).toBe('0');
    // Le budget, lui, est bien hérité du centre de coût.
    expect(cree[0].budgetMensuel).toBe('1000000000');
  });

  it('conserve le solde initial pour un portefeuille personnel', async () => {
    const { service, cree } = monter();

    await service.create(
      {
        code: 'P_LORENE',
        libelle: 'Portefeuille Lorène',
        caisseSourceId: '4',
        deviseId: '1',
        proprietaireType: 'USER',
        proprietaireId: '4',
        soldeInitial: '250000',
      },
      '2',
    );

    // Un portefeuille personnel n'est pas réajusté : son solde initial a du sens.
    expect(cree[0].soldeInitial).toBe('250000');
  });

  it('met zéro quand rien n’est fourni', async () => {
    const { service, cree } = monter();

    await service.create(
      { code: 'P_X', libelle: 'X', caisseSourceId: '4', deviseId: '1', proprietaireType: 'USER', proprietaireId: '4' },
      '2',
    );

    expect(cree[0].soldeInitial).toBe('0');
  });
});
