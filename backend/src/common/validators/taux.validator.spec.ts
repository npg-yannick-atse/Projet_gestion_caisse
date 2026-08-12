import { motifRefusTaux, TAUX_DECIMALES, TAUX_ENTIERS } from './taux.validator';

/**
 * Bornes de `fin_taux_echange.taux` : DECIMAL(19,8), strictement positif.
 * Même rôle que `montant.validator.spec` : empêcher qu'une valeur hors capacité
 * atteigne le pilote SQL, dont le message brut remonterait à l'écran.
 */
describe('motifRefusTaux — valeurs acceptées', () => {
  it.each(['1', '655.957', '655.95700000', '0.00152449', '568.028634'])(
    'accepte %s',
    (v) => expect(motifRefusTaux(v)).toBeNull(),
  );

  it('accepte exactement 8 décimales', () => {
    expect(motifRefusTaux('1.12345678')).toBeNull();
  });

  it('accepte exactement 11 chiffres avant la virgule', () => {
    expect(motifRefusTaux('12345678901')).toBeNull();
  });

  it('ignore les zéros de tête pour compter les entiers', () => {
    expect(motifRefusTaux('000000000000001')).toBeNull();
  });
});

describe('motifRefusTaux — valeurs refusées', () => {
  it('refuse le vide et les non-chaînes', () => {
    expect(motifRefusTaux('')).toMatch(/requis/);
    expect(motifRefusTaux('   ')).toMatch(/requis/);
    expect(motifRefusTaux(undefined)).toMatch(/requis/);
    expect(motifRefusTaux(655.957 as any)).toMatch(/requis/);
  });

  it('refuse la virgule décimale française et le texte', () => {
    expect(motifRefusTaux('655,957')).toMatch(/invalide/);
    expect(motifRefusTaux('abc')).toMatch(/invalide/);
  });

  it('refuse le négatif — un taux négatif inverserait le sens de la conversion', () => {
    expect(motifRefusTaux('-655.957')).toMatch(/invalide/);
  });

  it(`refuse plus de ${TAUX_DECIMALES} décimales`, () => {
    expect(motifRefusTaux('1.123456789')).toMatch(/8 décimales/);
  });

  it(`refuse plus de ${TAUX_ENTIERS} chiffres avant la virgule`, () => {
    expect(motifRefusTaux('123456789012')).toMatch(/trop grand/);
  });

  // Le vrai piège : la base a CK_fin_te_taux (taux > 0), et une conversion qui
  // s'appuierait sur un taux nul renverrait 0 ou diviserait par zéro. TCURR
  // contenait justement des cours à 0,00.
  it.each(['0', '0.0', '0.00000000', '000'])('refuse le zéro écrit %s', (v) => {
    expect(motifRefusTaux(v)).toMatch(/supérieur à zéro/);
  });
});
