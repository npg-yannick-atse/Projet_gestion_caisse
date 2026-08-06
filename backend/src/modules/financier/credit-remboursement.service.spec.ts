import { CreditRemboursementService } from './credit-remboursement.service';

/**
 * Remboursements de crédit employé.
 *
 * Avant le 05/08/2026, aucun versement n'était enregistré : l'écran déduisait
 * qu'une mensualité était payée du seul fait que sa date était passée. Un
 * employé en retard apparaissait donc « à jour ». Ces tests portent sur les
 * règles qui rendent le suivi honnête : ce qui est versé, ce qui reste dû, ce
 * qui est en retard.
 */

/** Crédit de 600 000 sur 12 mois, décaissé le 05/01/2026 → mensualité 50 000. */
const CREDIT = {
  id: '5',
  employeId: '20',
  montant: '600000.0000',
  nbMois: 12,
  sourceType: 'CAISSE' as const,
  sourceId: '1',
  deviseId: '1',
  statut: 'EN_COURS' as const,
  dateDebut: '2026-01-05',
};

function monter(opts: {
  credit?: any;
  remboursements?: any[];
  caisse?: any;
} = {}) {
  const credit = { ...CREDIT, ...(opts.credit ?? {}) };
  const remboursements = opts.remboursements ?? [];
  const caisse = opts.caisse ?? { id: '1', code: 'CI01', statut: 'OUVERTE' };

  const creditsSauves: any[] = [];
  const rembSauves: any[] = [];
  const ecritures: any[] = [];

  const rembRepoTx = {
    create: jest.fn((v: any) => ({ id: '900', ...v })),
    save: jest.fn(async (v: any) => {
      rembSauves.push(v);
      return v;
    }),
  };
  const manager = {
    getRepository: (e: any) => (e?.name === 'Credit'
      ? { save: jest.fn(async (v: any) => { creditsSauves.push({ ...v }); return v; }) }
      : rembRepoTx),
  };

  const ledger = {
    createOperation: jest.fn(async (input: any) => ({ transactionUuid: 'uuid-1', ...input })),
    createPairedEcritures: jest.fn(async (debit: any, credit: any, montant: string) => {
      ecritures.push({ debit: debit.typeCompte, credit: credit.typeCompte, montant });
      return [{}, {}];
    }),
  };

  const service = new CreditRemboursementService(
    { findOne: jest.fn(async () => credit) } as any,
    {
      find: jest.fn(async () => remboursements),
      findOne: jest.fn(async ({ where }: any) =>
        remboursements.find((r) => String(r.id) === String(where.id)) ?? null,
      ),
    } as any,
    { findOne: jest.fn(async () => ({ id: '20', matricule: 'EMP001' })) } as any,
    {
      transaction: jest.fn(async (cb: any) => cb(manager)),
      getRepository: jest.fn(() => ({ findOne: jest.fn(async () => caisse) })),
    } as any,
    ledger as any,
    {
      assertCaisseInPerimeter: jest.fn(async () => undefined),
      assertPortefeuilleInPerimeter: jest.fn(async () => undefined),
    } as any,
  );

  return { service, credit, creditsSauves, rembSauves, ecritures, ledger };
}

/** Versement encaissé pour l'échéance `rang`. */
const verse = (rang: number, montant = '50000.0000', extra: any = {}) => ({
  id: String(100 + rang),
  creditId: '5',
  numeroEcheance: rang,
  montant,
  deviseId: '1',
  sourceType: 'CAISSE',
  sourceId: '1',
  statut: 'ENCAISSE',
  ...extra,
});

describe('mensualité — le dernier mois absorbe l’arrondi', () => {
  const m = CreditRemboursementService.mensualite;

  it('divise simplement quand le montant tombe juste', () => {
    expect(m('600000', 12)).toBe('50000.0000');
  });

  it('arrondit au centime inférieur pour les mois courants', () => {
    // 100 000 / 3 = 33 333,333… → 33 333,33
    expect(m('100000', 3, 1)).toBe('33333.3300');
    expect(m('100000', 3, 2)).toBe('33333.3300');
  });

  it('met le reliquat sur le DERNIER mois, pour que le crédit se solde exactement', () => {
    // Sans cette règle, 3 × 33 333,33 = 99 999,99 : il resterait toujours 1 centime dû.
    expect(m('100000', 3, 3)).toBe('33333.3400');
    const total = Number(m('100000', 3, 1)) + Number(m('100000', 3, 2)) + Number(m('100000', 3, 3));
    expect(total).toBeCloseTo(100000, 4);
  });

  it('renvoie 0 si la durée est nulle, sans division par zéro', () => {
    expect(m('100000', 0)).toBe('0.0000');
  });
});

describe('situation — calculée sur les versements RÉELS', () => {
  it('ne compte rien tant qu’aucun versement n’est enregistré', async () => {
    const { service } = monter();
    const s = await service.situation('5', new Date('2026-06-15'));
    expect(s.rembourse).toBe('0.0000');
    expect(s.restant).toBe('600000.0000');
    expect(s.echeancesPayees).toBe(0);
    expect(s.pourcentage).toBe(0);
  });

  it('additionne les versements encaissés et déduit le reste dû', async () => {
    const { service } = monter({ remboursements: [verse(1), verse(2), verse(3)] });
    const s = await service.situation('5', new Date('2026-04-10'));
    expect(s.rembourse).toBe('150000.0000');
    expect(s.restant).toBe('450000.0000');
    expect(s.echeancesPayees).toBe(3);
    expect(s.pourcentage).toBe(25);
  });

  it('ignore un versement annulé', async () => {
    const { service } = monter({
      remboursements: [verse(1), verse(2, '50000.0000', { statut: 'ANNULE' })],
    });
    const s = await service.situation('5', new Date('2026-03-10'));
    expect(s.rembourse).toBe('50000.0000');
    expect(s.echeancesPayees).toBe(1);
  });

  it('désigne la première échéance NON réglée, même si les versements sont dans le désordre', async () => {
    // L'employé a payé les mois 1 et 3 : la prochaine à encaisser est le 2, pas le 4.
    const { service } = monter({ remboursements: [verse(1), verse(3)] });
    const s = await service.situation('5', new Date('2026-04-10'));
    expect(s.prochaineEcheance).toBe(2);
  });

  it('ne désigne plus d’échéance quand tout est réglé', async () => {
    const tous = Array.from({ length: 12 }, (_, i) => verse(i + 1));
    const { service } = monter({ remboursements: tous });
    const s = await service.situation('5', new Date('2027-02-10'));
    expect(s.prochaineEcheance).toBeNull();
    expect(s.restant).toBe('0.0000');
    expect(s.pourcentage).toBe(100);
  });
});

describe('situation — détection du RETARD (ce que l’ancien affichage ne voyait pas)', () => {
  it('signale les échéances échues et non versées', async () => {
    // Au 10/04/2026, trois échéances sont échues (05/02, 05/03, 05/04) et une
    // seule a été versée : deux mois de retard, 100 000.
    const { service } = monter({ remboursements: [verse(1)] });
    const s = await service.situation('5', new Date('2026-04-10'));
    expect(s.echeancesEnRetard).toBe(2);
    expect(s.montantEnRetard).toBe('100000.0000');
  });

  it('ne signale aucun retard quand l’employé est à jour', async () => {
    const { service } = monter({ remboursements: [verse(1), verse(2), verse(3)] });
    const s = await service.situation('5', new Date('2026-04-10'));
    expect(s.echeancesEnRetard).toBe(0);
    expect(s.montantEnRetard).toBe('0.0000');
  });

  it('ne compte pas une échéance non encore échue', async () => {
    // Au 04/02, l'échéance du 05/02 n'est pas encore due.
    const { service } = monter();
    const s = await service.situation('5', new Date('2026-02-04'));
    expect(s.echeancesEnRetard).toBe(0);
  });

  it('ne parle pas de retard sur un crédit non décaissé', async () => {
    // Une demande approuvée mais pas décaissée ne doit rien : l'échéancier n'a
    // pas commencé à courir.
    const { service } = monter({ credit: { statut: 'APPROUVEE' } });
    const s = await service.situation('5', new Date('2027-01-01'));
    expect(s.echeancesEnRetard).toBe(0);
    expect(s.montantEnRetard).toBe('0.0000');
  });
});

describe('enregistrer — le versement entre en caisse', () => {
  it('passe la partie double DANS LE BON SENS : débit créance, crédit source', async () => {
    // C'est l'inverse du décaissement. Inversé, le remboursement creuserait la
    // dette de l'employé et viderait la caisse.
    const { service, ecritures } = monter();
    await service.enregistrer('5', {}, '10');
    expect(ecritures).toHaveLength(1);
    expect(ecritures[0]).toEqual({ debit: 'CREDIT_EMPLOYE', credit: 'CAISSE', montant: '50000.0000' });
  });

  it('impute par défaut la première échéance non réglée', async () => {
    const { service, rembSauves } = monter({ remboursements: [verse(1), verse(2)] });
    await service.enregistrer('5', {}, '10');
    expect(rembSauves[0].numeroEcheance).toBe(3);
  });

  it('accepte une échéance et un montant explicites', async () => {
    const { service, rembSauves } = monter();
    await service.enregistrer('5', { numeroEcheance: 4, montant: '25000.0000' }, '10');
    expect(rembSauves[0].numeroEcheance).toBe(4);
    expect(rembSauves[0].montant).toBe('25000.0000');
  });

  it('refuse un versement supérieur au reste dû', async () => {
    // Sinon la créance deviendrait négative : l'entreprise devrait de l'argent
    // à l'employé.
    const { service } = monter();
    await expect(service.enregistrer('5', { montant: '700000' }, '10')).rejects.toThrow(/dépasse le reste dû/);
  });

  it('refuse un montant nul ou négatif', async () => {
    const { service } = monter();
    await expect(service.enregistrer('5', { montant: '0' }, '10')).rejects.toThrow(/positif/);
    await expect(service.enregistrer('5', { montant: '-5000' }, '10')).rejects.toThrow(/positif/);
  });

  it('refuse une échéance hors de la durée du crédit', async () => {
    const { service } = monter();
    await expect(service.enregistrer('5', { numeroEcheance: 13 }, '10')).rejects.toThrow(/entre 1 et 12/);
    await expect(service.enregistrer('5', { numeroEcheance: 0 }, '10')).rejects.toThrow();
  });

  it('refuse d’encaisser sur un crédit qui n’est pas en cours', async () => {
    for (const statut of ['EN_ATTENTE', 'APPROUVEE', 'SOLDE', 'REJETEE', 'ANNULEE']) {
      const { service } = monter({ credit: { statut } });
      await expect(service.enregistrer('5', {}, '10')).rejects.toThrow(/crédit en cours/);
    }
  });

  it('refuse d’encaisser dans une caisse fermée', async () => {
    const { service } = monter({ caisse: { id: '1', code: 'CI01', statut: 'FERMEE' } });
    await expect(service.enregistrer('5', {}, '10')).rejects.toThrow(/fermée/);
  });

  it('solde le crédit dès que la dette est éteinte', async () => {
    // 11 versements déjà faits : le 12e éteint la dette et libère l'employé
    // pour un nouveau crédit.
    const onze = Array.from({ length: 11 }, (_, i) => verse(i + 1));
    const { service, creditsSauves } = monter({ remboursements: onze });
    await service.enregistrer('5', {}, '10');
    expect(creditsSauves).toHaveLength(1);
    expect(creditsSauves[0].statut).toBe('SOLDE');
  });

  it('laisse le crédit EN_COURS tant qu’il reste dû', async () => {
    const { service, creditsSauves } = monter({ remboursements: [verse(1)] });
    await service.enregistrer('5', {}, '10');
    expect(creditsSauves).toHaveLength(0);
  });

  it('enregistre l’opération sous son propre type', async () => {
    const { service, ledger } = monter();
    await service.enregistrer('5', {}, '10');
    expect(ledger.createOperation.mock.calls[0][0]).toMatchObject({
      typeOperation: 'REMBOURSEMENT_CREDIT',
      caisseId: '1',
    });
  });
});

describe('annuler — contre-passation, rien n’est effacé', () => {
  it('inverse les écritures du versement', async () => {
    const { service, ecritures } = monter({
      credit: { statut: 'EN_COURS' },
      remboursements: [verse(1)],
    });
    await service.annuler('101', '10', 'erreur de saisie');
    expect(ecritures[0]).toEqual({ debit: 'CAISSE', credit: 'CREDIT_EMPLOYE', montant: '50000.0000' });
  });

  it('marque le versement ANNULE au lieu de le supprimer', async () => {
    const { service, rembSauves } = monter({ remboursements: [verse(1)] });
    await service.annuler('101', '10');
    expect(rembSauves[0].statut).toBe('ANNULE');
  });

  it('rouvre un crédit qui avait été soldé par ce versement', async () => {
    const { service, creditsSauves } = monter({
      credit: { statut: 'SOLDE' },
      remboursements: [verse(12)],
    });
    await service.annuler('112', '10');
    expect(creditsSauves[0].statut).toBe('EN_COURS');
  });

  it('refuse d’annuler deux fois', async () => {
    const { service } = monter({
      remboursements: [verse(1, '50000.0000', { statut: 'ANNULE' })],
    });
    await expect(service.annuler('101', '10')).rejects.toThrow(/déjà annulé/);
  });
});
