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
