import { PortefeuillesService } from './portefeuilles.service';

/**
 * Un seul portefeuille principal par caisse.
 *
 * La base l'impose par un index unique filtré. Le service doit donc DESTITUER
 * l'ancien avant d'en promouvoir un nouveau : sans cela, la désignation
 * remonterait une violation d'unicité SQL brute au lieu de faire ce qu'on
 * attend — remplacer. « Principal » est une place, pas une étiquette qu'on
 * distribue.
 */
function monter(pfExistant?: any) {
  const destitutions: any[] = [];
  const enregistres: any[] = [];

  const qb = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn(function (this: any, _sql: string, params: any) {
      destitutions.push(params);
      return this;
    }),
    andWhere: jest.fn(function (this: any, _sql: string, params: any) {
      destitutions[destitutions.length - 1] = { ...destitutions[destitutions.length - 1], ...params };
      return this;
    }),
    execute: jest.fn(async () => ({ affected: 1 })),
  };

  const repo = {
    findOne: jest.fn(async () => pfExistant ?? null),
    create: jest.fn((x: any) => x),
    save: jest.fn(async (x: any) => {
      enregistres.push(x);
      return { id: '9', ...x };
    }),
    createQueryBuilder: jest.fn(() => qb),
  };

  const service = new PortefeuillesService(
    repo as any,
    { calculateBalance: jest.fn(async () => '0'), hasEcritures: jest.fn(async () => false) } as any,
    { assertPermissionStrict: jest.fn(async () => undefined), assertPermission: jest.fn(async () => undefined) } as any,
  ) as any;
  service.budgetDirection = jest.fn(async () => '1000000000');

  return { service, destitutions, enregistres };
}

const base = {
  code: 'P_X',
  libelle: 'X',
  caisseSourceId: '4',
  deviseId: '1',
  proprietaireType: 'USER' as const,
  proprietaireId: '4',
};

describe('portefeuille principal', () => {
  it('destitue le principal de la caisse quand on en crée un nouveau', async () => {
    const { service, destitutions, enregistres } = monter();

    await service.create({ ...base, estPrincipal: true }, '2');

    expect(destitutions).toHaveLength(1);
    expect(destitutions[0]).toMatchObject({ c: '4' });
    expect(enregistres[0].estPrincipal).toBe(true);
  });

  it('ne destitue personne quand le nouveau n’est pas principal', async () => {
    const { service, destitutions, enregistres } = monter();

    await service.create({ ...base, estPrincipal: false }, '2');

    expect(destitutions).toHaveLength(0);
    expect(enregistres[0].estPrincipal).toBe(false);
  });

  it('à la promotion, épargne le portefeuille promu lui-même', async () => {
    // Sans l'exclusion par id, la destitution effacerait le drapeau qu'on vient
    // de poser — le portefeuille se destituerait lui-même.
    const existant = { id: '7', caisseSourceId: '4', estPrincipal: false, proprietaireType: 'USER' };
    const { service, destitutions } = monter(existant);

    await service.update('7', { estPrincipal: true }, '2');

    expect(destitutions[0]).toMatchObject({ c: '4', id: '7' });
  });

  it('retirer la désignation ne promeut personne', async () => {
    const existant = { id: '7', caisseSourceId: '4', estPrincipal: true, proprietaireType: 'USER' };
    const { service, destitutions } = monter(existant);

    await service.update('7', { estPrincipal: false }, '2');

    // Mieux vaut aucun principal qu'un successeur désigné au hasard.
    expect(destitutions).toHaveLength(0);
    expect(existant.estPrincipal).toBe(false);
  });
});

describe('portefeuille principal : ni plafond ni solde initial', () => {
  it('naît à zéro et sans budget mensuel', async () => {
    // Il alimente la caisse, il n'en reçoit pas : lui poser un plafond le
    // ferait entrer dans le réajustement, donc réclamer de l'argent à la
    // caisse qu'il est censé financer.
    const { service, enregistres } = monter();

    await service.create(
      { ...base, estPrincipal: true, soldeInitial: '5000000', budgetMensuel: '900000' },
      '2',
    );

    expect(enregistres[0].estPrincipal).toBe(true);
    expect(enregistres[0].soldeInitial).toBe('0');
    expect(enregistres[0].budgetMensuel).toBeNull();
  });

  it('perd son plafond en devenant principal', async () => {
    const existant = {
      id: '7',
      caisseSourceId: '4',
      estPrincipal: false,
      proprietaireType: 'USER',
      budgetMensuel: '900000',
    };
    const { service } = monter(existant);

    await service.update('7', { estPrincipal: true }, '2');

    expect(existant.budgetMensuel).toBeNull();
  });

  it('un portefeuille ordinaire garde son plafond', async () => {
    const { service, enregistres } = monter();

    await service.create({ ...base, estPrincipal: false, budgetMensuel: '900000' }, '2');

    expect(enregistres[0].budgetMensuel).toBe('900000');
  });
});
