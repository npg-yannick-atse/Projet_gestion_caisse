import { LedgerService } from './ledger.service';

/**
 * Comptabilité : soldes, équilibre de la partie double et chaîne d'intégrité.
 *
 * Ce sont les règles qui touchent à l'argent et à la non-falsifiabilité des
 * écritures. Elles sont testées ici SANS base : on simule uniquement la réponse
 * agrégée de SQL (SUM des débits / crédits), le reste est du calcul pur.
 */

/** Repository factice dont le getRawOne renvoie les totaux voulus. */
function repoAvecTotaux(totaux: { totalCredit?: string | null; totalDebit?: string | null } | null) {
  const qb: any = {};
  for (const m of ['select', 'addSelect', 'where', 'andWhere', 'orderBy']) qb[m] = jest.fn(() => qb);
  qb.getRawOne = jest.fn(async () => totaux);
  return { createQueryBuilder: jest.fn(() => qb), find: jest.fn(async () => []) };
}

function svc(totaux: any = null) {
  return new LedgerService({} as any, repoAvecTotaux(totaux) as any);
}

describe('LedgerService.calculateBalance — convention solde = crédits − débits', () => {
  it('calcule un solde créditeur', async () => {
    await expect(svc({ totalCredit: '1000.0000', totalDebit: '250.0000' }).calculateBalance('1', 'CAISSE' as any))
      .resolves.toBe('750.0000');
  });

  it('calcule un solde débiteur (négatif)', async () => {
    await expect(svc({ totalCredit: '100.0000', totalDebit: '400.0000' }).calculateBalance('1', 'CAISSE' as any))
      .resolves.toBe('-300.0000');
  });

  it('renvoie 0.0000 quand le compte n’a aucune écriture', async () => {
    await expect(svc(null).calculateBalance('1', 'CAISSE' as any)).resolves.toBe('0.0000');
  });

  it('traite les totaux NULL comme des zéros', async () => {
    await expect(svc({ totalCredit: null, totalDebit: null }).calculateBalance('1', 'CAISSE' as any))
      .resolves.toBe('0.0000');
  });

  it('conserve systématiquement 4 décimales (format DECIMAL(19,4))', async () => {
    await expect(svc({ totalCredit: '10', totalDebit: '3' }).calculateBalance('1', 'CAISSE' as any))
      .resolves.toBe('7.0000');
  });

  it('gère les centimes sans perte visible', async () => {
    await expect(svc({ totalCredit: '1000.5000', totalDebit: '0.2500' }).calculateBalance('1', 'CAISSE' as any))
      .resolves.toBe('1000.2500');
  });
});

describe('LedgerService.verifyTransactionBalance — équilibre de la partie double', () => {
  it('accepte une transaction parfaitement équilibrée', async () => {
    await expect(svc({ totalCredit: '500.0000', totalDebit: '500.0000' }).verifyTransactionBalance('t1'))
      .resolves.toBe(true);
  });

  it('refuse une transaction déséquilibrée', async () => {
    await expect(svc({ totalCredit: '500.0000', totalDebit: '450.0000' }).verifyTransactionBalance('t1'))
      .resolves.toBe(false);
  });

  it('tolère un écart strictement inférieur au centime (arrondis)', async () => {
    await expect(svc({ totalCredit: '500.0000', totalDebit: '499.9950' }).verifyTransactionBalance('t1'))
      .resolves.toBe(true);
  });

  it('refuse un écart d’un centime ou plus', async () => {
    await expect(svc({ totalCredit: '500.0000', totalDebit: '499.9800' }).verifyTransactionBalance('t1'))
      .resolves.toBe(false);
  });
});

describe('LedgerService.hashEcriture — chaîne d’intégrité SHA-256', () => {
  const base = {
    compteId: '1',
    typeCompte: 'CAISSE',
    debit: '100.00',
    credit: null,
    deviseId: '1',
    dateEcritureIso: '2026-07-31T10:00:00.000Z',
  };
  /** hashEcriture est privé : on y accède explicitement pour le tester. */
  const hash = (f: any, prev?: string | null) => (svc() as any).hashEcriture(f, prev);

  it('produit un hash SHA-256 (64 caractères hexadécimaux)', () => {
    expect(hash(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('est déterministe : mêmes champs → même hash', () => {
    expect(hash(base)).toBe(hash({ ...base }));
  });

  it('normalise les montants : "100.00", "100" et "100.0000" donnent le même hash', () => {
    // Indispensable pour que la vérification puisse recalculer le hash depuis la
    // base, où le montant est stocké en DECIMAL(19,4).
    expect(hash({ ...base, debit: '100' })).toBe(hash({ ...base, debit: '100.0000' }));
    expect(hash({ ...base, debit: '100.00' })).toBe(hash({ ...base, debit: '100.0000' }));
  });

  it('traite un montant absent (null ou "") comme 0.0000', () => {
    expect(hash({ ...base, credit: null })).toBe(hash({ ...base, credit: '' }));
    expect(hash({ ...base, credit: null })).toBe(hash({ ...base, credit: '0' }));
  });

  it('change dès que le montant change (falsification détectable)', () => {
    expect(hash({ ...base, debit: '100.00' })).not.toBe(hash({ ...base, debit: '100.01' }));
  });

  it('change dès que le compte, le type, la devise ou la date changent', () => {
    expect(hash(base)).not.toBe(hash({ ...base, compteId: '2' }));
    expect(hash(base)).not.toBe(hash({ ...base, typeCompte: 'PORTEFEUILLE' }));
    expect(hash(base)).not.toBe(hash({ ...base, deviseId: '2' }));
    expect(hash(base)).not.toBe(hash({ ...base, dateEcritureIso: '2026-07-31T10:00:01.000Z' }));
  });

  it('chaîne réellement : le hash précédent influe sur le résultat', () => {
    // C'est ce qui empêche d'insérer, supprimer ou réordonner une écriture sans
    // casser la chaîne.
    const sansPrecedent = hash(base);
    const avecPrecedent = hash(base, 'a'.repeat(64));
    expect(avecPrecedent).not.toBe(sansPrecedent);
    expect(hash(base, 'b'.repeat(64))).not.toBe(avecPrecedent);
  });

  it('traite un hash précédent absent (null, undefined ou "") de façon identique', () => {
    expect(hash(base, null)).toBe(hash(base, undefined));
    expect(hash(base, '')).toBe(hash(base, null));
  });

  it('distingue un débit d’un crédit de même montant', () => {
    const debit = hash({ ...base, debit: '100', credit: null });
    const credit = hash({ ...base, debit: null, credit: '100' });
    expect(debit).not.toBe(credit);
  });
});

/**
 * Soldes multi-devises.
 *
 * Une caisse peut détenir plusieurs devises : l'application le permettait déjà
 * dans les faits, mais les additionnait sans conversion. Constaté en base le
 * 05/08/2026 : la caisse CI01 affichait un solde de 92 180, soit 267 180 USD
 * MOINS 175 000 EUR — un chiffre qui ne représentait rien.
 *
 * Depuis, tout solde comparé à un montant ou affiché doit préciser sa devise.
 */
describe('LedgerService.calculateBalance — filtrage par devise', () => {
  /** Repository simulant un filtre WHERE devise_id. */
  function repoParDevise(parDevise: Record<string, { credit: string; debit: string }>) {
    const qb: any = { _devise: undefined as string | undefined };
    for (const m of ['select', 'addSelect', 'leftJoin', 'groupBy', 'addGroupBy', 'orderBy']) {
      qb[m] = jest.fn(() => qb);
    }
    qb.where = jest.fn(() => qb);
    qb.andWhere = jest.fn((_sql: string, params: any) => {
      if (params?.deviseId) qb._devise = String(params.deviseId);
      return qb;
    });
    qb.getRawOne = jest.fn(async () => {
      if (qb._devise) {
        const d = parDevise[qb._devise];
        return d ? { totalCredit: d.credit, totalDebit: d.debit } : { totalCredit: null, totalDebit: null };
      }
      // Sans filtre : somme brute de toutes les devises (l'ancien comportement).
      let c = 0;
      let d = 0;
      for (const v of Object.values(parDevise)) {
        c += Number(v.credit);
        d += Number(v.debit);
      }
      return { totalCredit: String(c), totalDebit: String(d) };
    });
    return { createQueryBuilder: jest.fn(() => qb), find: jest.fn(async () => []) };
  }

  // Reproduit la caisse CI01 : 267 180 USD (devise 3) et −175 000 EUR (devise 2).
  const CI01 = { '3': { credit: '267180', debit: '0' }, '2': { credit: '0', debit: '175000' } };
  const svcCI01 = () => new LedgerService({} as any, repoParDevise(CI01) as any);

  it('renvoie le solde de la devise demandée, sans les autres', async () => {
    await expect(svcCI01().calculateBalance('1', 'CAISSE' as any, '3')).resolves.toBe('267180.0000');
    await expect(svcCI01().calculateBalance('1', 'CAISSE' as any, '2')).resolves.toBe('-175000.0000');
  });

  it('renvoie 0 pour une devise absente du compte', async () => {
    await expect(svcCI01().calculateBalance('1', 'CAISSE' as any, '99')).resolves.toBe('0.0000');
  });

  it('sans devise, additionne tout — le comportement à ne PAS utiliser pour comparer', async () => {
    // 267 180 − 175 000 = 92 180 : le chiffre trompeur constaté en production.
    await expect(svcCI01().calculateBalance('1', 'CAISSE' as any)).resolves.toBe('92180.0000');
  });
});

describe('LedgerService.calculateBalancesParDevise — ventilation', () => {
  function repoVentile(rows: any[]) {
    const qb: any = {};
    for (const m of ['select', 'addSelect', 'leftJoin', 'where', 'andWhere', 'groupBy', 'addGroupBy']) {
      qb[m] = jest.fn(() => qb);
    }
    qb.getRawMany = jest.fn(async () => rows);
    return { createQueryBuilder: jest.fn(() => qb), find: jest.fn(async () => []) };
  }

  it('rend une ligne par devise, chacune avec son propre solde', async () => {
    const svc = new LedgerService(
      {} as any,
      repoVentile([
        { deviseId: '3', code: 'USD', totalCredit: '267180', totalDebit: '0' },
        { deviseId: '2', code: 'EUR', totalCredit: '0', totalDebit: '175000' },
      ]) as any,
    );
    await expect(svc.calculateBalancesParDevise('1', 'CAISSE' as any)).resolves.toEqual([
      { deviseId: '3', code: 'USD', solde: '267180.0000' },
      { deviseId: '2', code: 'EUR', solde: '-175000.0000' },
    ]);
  });

  it('traite les totaux absents comme des zéros', async () => {
    const svc = new LedgerService(
      {} as any,
      repoVentile([{ deviseId: '1', code: 'XOF', totalCredit: null, totalDebit: '50' }]) as any,
    );
    await expect(svc.calculateBalancesParDevise('1', 'CAISSE' as any)).resolves.toEqual([
      { deviseId: '1', code: 'XOF', solde: '-50.0000' },
    ]);
  });

  it('renvoie une liste vide pour un compte sans écriture', async () => {
    const svc = new LedgerService({} as any, repoVentile([]) as any);
    await expect(svc.calculateBalancesParDevise('9', 'CAISSE' as any)).resolves.toEqual([]);
  });
});
