import { SapService } from './sap.service';

/**
 * Décimales des devises à l'envoi vers SAP.
 *
 * Les BAPI reçoivent AMT_DOCCUR avec DEUX décimales implicites, quelle que soit
 * la devise. Pour une devise à 0 décimale — XOF, XAF, JPY — SAP divise donc la
 * valeur reçue par 100 : envoyer 1 000 000 comptabilisait 10 000.
 *
 * Bug constaté en production de test le 31/07/2026 : quatre pièces XOF avaient
 * été comptabilisées au centième de leur valeur. Ces tests verrouillent la
 * compensation. S'ils cassent, la comptabilité en francs CFA repart à l'envers.
 */
function svc(tcurx: Record<string, number> | null = { XOF: 0, XAF: 0, JPY: 0 }) {
  const s = new SapService({} as any);
  // On court-circuite l'accès SAP : getDecimales lit TCURX via withClient.
  (s as any).decimalesDevise = tcurx ? new Map(Object.entries(tcurx)) : new Map();
  return s;
}

const facteur = (s: SapService, devise: string) => (s as any).facteurMontant(devise) as Promise<number>;

describe('SapService — facteur de conversion des montants', () => {
  it('multiplie par 100 les devises SANS décimale (XOF, XAF, JPY)', async () => {
    const s = svc();
    await expect(facteur(s, 'XOF')).resolves.toBe(100);
    await expect(facteur(s, 'XAF')).resolves.toBe(100);
    await expect(facteur(s, 'JPY')).resolves.toBe(100);
  });

  it('laisse les devises à 2 décimales inchangées (absentes de TCURX)', async () => {
    const s = svc();
    await expect(facteur(s, 'USD')).resolves.toBe(1);
    await expect(facteur(s, 'EUR')).resolves.toBe(1);
  });

  it('divise par 10 les devises à 3 décimales (dinar koweïtien, tunisien…)', async () => {
    const s = svc({ KWD: 3, TND: 3 });
    await expect(facteur(s, 'KWD')).resolves.toBeCloseTo(0.1);
  });

  it('est insensible à la casse de la devise', async () => {
    const s = svc();
    await expect(facteur(s, 'xof')).resolves.toBe(100);
  });

  it('retombe sur 2 décimales pour une devise inconnue (défaut SAP)', async () => {
    const s = svc();
    await expect(facteur(s, 'ZZZ')).resolves.toBe(1);
  });

  it('retombe sur 2 décimales si TCURX est illisible, sans bloquer l’envoi', async () => {
    // Mieux vaut un facteur neutre qu'un envoi impossible : les devises à 2
    // décimales (la majorité) restent correctes.
    const s = svc(null);
    await expect(facteur(s, 'XOF')).resolves.toBe(1);
  });
});

describe('SapService — décomposition de la clé de pièce SAP', () => {
  // OBJ_KEY est concaténée par SAP : pièce(10) + société(4) + exercice(4).
  const dec = (k: any) => (svc() as any).decomposerPiece(k);

  it('découpe une clé de 18 caractères en pièce / société / exercice', () => {
    expect(dec('010035147822512026')).toEqual({
      numero: '0100351478',
      societe: '2251',
      exercice: '2026',
    });
  });

  it('conserve les zéros de tête du numéro de pièce', () => {
    // Le numéro est une chaîne, pas un nombre : 0100351478 ≠ 100351478.
    expect(dec('010035147822512026').numero).toBe('0100351478');
  });

  it('ignore les espaces autour de la clé', () => {
    expect(dec('  010035147822512026  ').societe).toBe('2251');
  });

  it('ne décompose PAS une clé de longueur inattendue', () => {
    // Mieux vaut trois colonnes vides qu'un découpage arbitraire.
    for (const k of ['123', '01003514782251202', '0100351478225120266']) {
      expect(dec(k)).toEqual({ numero: null, societe: null, exercice: null });
    }
  });

  it('gère une clé absente (null, undefined, vide)', () => {
    for (const k of [null, undefined, '', '   ']) {
      expect(dec(k)).toEqual({ numero: null, societe: null, exercice: null });
    }
  });

  it('permet de reconstituer la clé complète par concaténation', () => {
    const k = '010035148022512026';
    const d = dec(k);
    expect(`${d.numero}${d.societe}${d.exercice}`).toBe(k);
  });
});

describe('SapService — montants transmis à la BAPI', () => {
  /** buildPiece est privé : on l'appelle explicitement pour vérifier le résultat. */
  const build = (s: SapService, dto: any) => (s as any).buildPiece(dto) as Promise<any>;

  const dto = (devise: string, montant: number) => ({
    societe: '2251',
    devise,
    typePiece: 'SA',
    reference: 'TEST',
    lignes: [
      { compteGL: '62620000', sens: 'D', montant, texte: 'test' },
      { compteGL: '57101000', sens: 'C', montant, texte: 'test' },
    ],
  });

  it('envoie 1 000 000 XOF comme 100 000 000 (×100)', async () => {
    const piece = await build(svc(), dto('XOF', 1_000_000));
    const montants = piece.CURRENCYAMOUNT.map((c: any) => c.AMT_DOCCUR);
    expect(montants).toEqual([100_000_000, -100_000_000]);
  });

  it('envoie 52 XOF comme 5 200 — le cas qui donnait 0,52', async () => {
    const piece = await build(svc(), dto('XOF', 52));
    expect(piece.CURRENCYAMOUNT[0].AMT_DOCCUR).toBe(5200);
  });

  it('laisse un montant USD inchangé', async () => {
    const piece = await build(svc(), dto('USD', 250_000));
    expect(piece.CURRENCYAMOUNT.map((c: any) => c.AMT_DOCCUR)).toEqual([250_000, -250_000]);
  });

  it('respecte la convention BAPI : débit positif, crédit négatif', async () => {
    const piece = await build(svc(), dto('XOF', 100));
    expect(piece.CURRENCYAMOUNT[0].AMT_DOCCUR).toBeGreaterThan(0);
    expect(piece.CURRENCYAMOUNT[1].AMT_DOCCUR).toBeLessThan(0);
  });

  it('reste équilibrée après conversion', async () => {
    const piece = await build(svc(), dto('XOF', 33_333));
    const somme = piece.CURRENCYAMOUNT.reduce((a: number, c: any) => a + c.AMT_DOCCUR, 0);
    expect(somme).toBe(0);
  });

  it('gère les centimes sans dérive de virgule flottante', async () => {
    const piece = await build(svc(), dto('USD', 1234.56));
    expect(piece.CURRENCYAMOUNT[0].AMT_DOCCUR).toBe(1234.56);
  });
});
