import { CaissesService } from './caisses.service';

/**
 * Clôture et ouverture de caisse : un solde PAR DEVISE.
 *
 * Une caisse tenue en XOF peut détenir des dollars et des euros. Enregistrer un
 * `solde_cloture` unique revenait à additionner ces montants — le chiffre 92 180
 * constaté sur la caisse CI01 valait en réalité « 267 180 USD ET −175 000 EUR ».
 *
 * Ces tests vérifient que la fermeture consigne bien une ligne par devise, et
 * que le résumé de session ne porte plus que la devise déclarée de la caisse.
 */

/** Fabrique un service dont la transaction s'exécute sur des dépôts factices. */
function monterService(opts: {
  caisse: any;
  session: any;
  ventilation: Array<{ deviseId: string; code: string | null; solde: string; principale: boolean }>;
  lignesExistantes?: any[];
}) {
  const lignes: any[] = [...(opts.lignesExistantes ?? [])];
  const sessionsSauvees: any[] = [];
  const caissesSauvees: any[] = [];

  const detailRepo = {
    findOne: jest.fn(async ({ where }: any) =>
      lignes.find(
        (l) => String(l.sessionId) === String(where.sessionId) && String(l.deviseId) === String(where.deviseId),
      ) ?? null,
    ),
    create: jest.fn((v: any) => ({ ...v })),
    save: jest.fn(async (v: any) => {
      const i = lignes.findIndex(
        (l) => String(l.sessionId) === String(v.sessionId) && String(l.deviseId) === String(v.deviseId),
      );
      if (i >= 0) lignes[i] = v;
      else lignes.push(v);
      return v;
    }),
  };

  const manager = {
    getRepository: (entity: any) => {
      const nom = entity?.name ?? '';
      if (nom === 'SessionCaisseDevise') return detailRepo;
      if (nom === 'SessionCaisse') {
        return {
          findOne: jest.fn(async () => opts.session),
          create: jest.fn((v: any) => ({ id: '900', ...v })),
          save: jest.fn(async (v: any) => {
            sessionsSauvees.push(v);
            return v;
          }),
        };
      }
      return {
        findOne: jest.fn(async () => opts.caisse),
        save: jest.fn(async (v: any) => {
          caissesSauvees.push(v);
          return v;
        }),
      };
    },
  };

  const dataSource = {
    transaction: jest.fn(async (cb: any) => cb(manager)),
    query: jest.fn(async () => []),
  };

  const service = new CaissesService(
    { findOne: jest.fn(async () => opts.caisse) } as any,
    {} as any,
    dataSource as any,
    {} as any,
  );
  // getSoldesParDevise interroge le grand livre : on injecte directement la
  // ventilation constatée, le calcul lui-même étant testé dans ledger.service.
  jest.spyOn(service, 'getSoldesParDevise').mockResolvedValue(opts.ventilation as any);

  return { service, lignes, sessionsSauvees, caissesSauvees };
}

const CAISSE = { id: '1', code: 'CI01', statut: 'OUVERTE', deviseId: '1' };
const SESSION = { id: '77', caisseId: '1', statut: 'OUVERTE', soldeOuverture: '0' };

/** Reproduit CI01 : XOF déclarée (à 0), plus 267 180 USD et −175 000 EUR. */
const VENTILATION_CI01 = [
  { deviseId: '1', code: 'XOF', solde: '0.0000', principale: true },
  { deviseId: '3', code: 'USD', solde: '267180.0000', principale: false },
  { deviseId: '2', code: 'EUR', solde: '-175000.0000', principale: false },
];

describe('CaissesService.close — une ligne de solde par devise', () => {
  it('écrit une ligne pour CHAQUE devise présente dans la caisse', async () => {
    const { service, lignes } = monterService({
      caisse: { ...CAISSE },
      session: { ...SESSION },
      ventilation: VENTILATION_CI01,
    });

    await service.close('1', '10');

    expect(lignes).toHaveLength(3);
    expect(lignes.map((l) => [String(l.deviseId), l.soldeCloture])).toEqual(
      expect.arrayContaining([
        ['1', '0.0000'],
        ['3', '267180.0000'],
        ['2', '-175000.0000'],
      ]),
    );
  });

  it('n’additionne plus les devises : le solde résumé est celui de la devise déclarée', async () => {
    // Sans cette règle, la session porterait 92 180 (267 180 − 175 000), un
    // montant qui ne correspond à aucune monnaie réelle.
    const { service, sessionsSauvees } = monterService({
      caisse: { ...CAISSE },
      session: { ...SESSION },
      ventilation: VENTILATION_CI01,
    });

    await service.close('1', '10');

    expect(sessionsSauvees[0].soldeCloture).toBe('0.0000');
    expect(sessionsSauvees[0].soldeCloture).not.toBe('92180.0000');
  });

  it('conserve le solde d’ouverture déjà enregistré et n’écrase que la clôture', async () => {
    const { service, lignes } = monterService({
      caisse: { ...CAISSE },
      session: { ...SESSION },
      ventilation: [{ deviseId: '3', code: 'USD', solde: '267180.0000', principale: false }],
      lignesExistantes: [{ sessionId: '77', deviseId: '3', soldeOuverture: '50000.0000', soldeCloture: null }],
    });

    await service.close('1', '10');

    expect(lignes).toHaveLength(1);
    expect(lignes[0].soldeOuverture).toBe('50000.0000');
    expect(lignes[0].soldeCloture).toBe('267180.0000');
  });

  it('crée la ligne d’une devise apparue en cours de session, avec 0 à l’ouverture', async () => {
    const { service, lignes } = monterService({
      caisse: { ...CAISSE },
      session: { ...SESSION },
      ventilation: [{ deviseId: '3', code: 'USD', solde: '1200.0000', principale: false }],
    });

    await service.close('1', '10');

    expect(lignes[0].soldeOuverture).toBe('0.0000');
    expect(lignes[0].soldeCloture).toBe('1200.0000');
  });

  it('renvoie le détail par devise dans la session clôturée', async () => {
    const { service } = monterService({
      caisse: { ...CAISSE },
      session: { ...SESSION },
      ventilation: VENTILATION_CI01,
    });

    const session: any = await service.close('1', '10');

    expect(session.devises).toHaveLength(3);
    expect(session.devises).toContainEqual({
      deviseId: '3',
      code: 'USD',
      soldeOuverture: '0.0000',
      soldeCloture: '267180.0000',
    });
  });

  it('respecte le montant compté par le caissier quand il en saisit un', async () => {
    const { service, sessionsSauvees } = monterService({
      caisse: { ...CAISSE },
      session: { ...SESSION },
      ventilation: VENTILATION_CI01,
    });

    await service.close('1', '10', '12345.0000');

    expect(sessionsSauvees[0].soldeCloture).toBe('12345.0000');
  });

  it('refuse de clôturer une caisse qui n’est pas ouverte', async () => {
    const { service } = monterService({
      caisse: { ...CAISSE, statut: 'FERMEE' },
      session: { ...SESSION },
      ventilation: VENTILATION_CI01,
    });

    await expect(service.close('1', '10')).rejects.toThrow(/pas ouverte/);
  });
});

describe('CaissesService.open — photo des devises à l’ouverture', () => {
  it('enregistre le montant saisi pour la devise de la caisse, le solde réel pour les autres', async () => {
    const { service, lignes } = monterService({
      caisse: { ...CAISSE, statut: 'FERMEE' },
      session: null,
      ventilation: VENTILATION_CI01,
    });

    await service.open('1', '10', '500000.0000');

    const parDevise = Object.fromEntries(lignes.map((l) => [String(l.deviseId), l.soldeOuverture]));
    expect(parDevise['1']).toBe('500000.0000'); // XOF : ce que le caissier a compté
    expect(parDevise['3']).toBe('267180.0000'); // USD : le reliquat constaté
    expect(parDevise['2']).toBe('-175000.0000');
  });

  it('laisse la clôture vide tant que la session est ouverte', async () => {
    const { service, lignes } = monterService({
      caisse: { ...CAISSE, statut: 'FERMEE' },
      session: null,
      ventilation: [{ deviseId: '1', code: 'XOF', solde: '0.0000', principale: true }],
    });

    await service.open('1', '10', '0');

    expect(lignes[0].soldeCloture).toBeNull();
  });

  it('refuse de rouvrir une caisse déjà ouverte', async () => {
    const { service } = monterService({
      caisse: { ...CAISSE, statut: 'OUVERTE' },
      session: null,
      ventilation: VENTILATION_CI01,
    });

    await expect(service.open('1', '10', '0')).rejects.toThrow(/déjà ouverte/);
  });
});
