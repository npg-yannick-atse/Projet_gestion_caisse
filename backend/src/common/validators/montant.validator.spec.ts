import { motifRefusMontant, MONTANT_MAX } from './montant.validator';

/**
 * Bornes des montants.
 *
 * Les colonnes sont en DECIMAL(19,4) : 15 chiffres avant la virgule, 4 après.
 * `@IsNumberString()` ne contrôlait que la nature numérique — une valeur de
 * 41 chiffres passait, puis le pilote SQL renvoyait un message incompréhensible
 * affiché tel quel à l'utilisateur (constaté en test le 10/08/2026).
 */
describe('motifRefusMontant — valeurs acceptées', () => {
  it.each(['0', '1', '1000', '0.5', '1234.5678', '999999999999999', MONTANT_MAX])(
    'accepte %s',
    (v) => expect(motifRefusMontant(v)).toBeNull(),
  );

  it('accepte le maximum exact', () => {
    expect(motifRefusMontant('999999999999999.9999')).toBeNull();
  });

  it('ignore les zéros de tête, qui ne comptent pas dans la capacité', () => {
    expect(motifRefusMontant('000000000000000000001')).toBeNull();
  });

  it('tolère les espaces autour', () => {
    expect(motifRefusMontant('  100.50  ')).toBeNull();
  });
});

describe('motifRefusMontant — valeurs refusées', () => {
  it('refuse un montant dépassant la capacité de la colonne', () => {
    // Le cas exact saisi par la testeuse.
    expect(motifRefusMontant('10000000000000000000000000000000000000000')).toMatch(/trop grand/);
    expect(motifRefusMontant('1000000000000000')).toMatch(/trop grand/);
  });

  it('refuse un dépassement d’un seul chiffre', () => {
    // 16 chiffres entiers : un de trop.
    expect(motifRefusMontant('9999999999999999')).toMatch(/trop grand/);
  });

  it('refuse plus de 4 décimales', () => {
    expect(motifRefusMontant('1.00001')).toMatch(/décimales/);
  });

  it('refuse la virgule comme séparateur', () => {
    expect(motifRefusMontant('12,50')).toMatch(/invalide/);
  });

  it('refuse un négatif', () => {
    expect(motifRefusMontant('-100')).toMatch(/invalide/);
  });

  it.each(['abc', '1e10', '', '   ', null, undefined, 100 as unknown])(
    'refuse %p',
    (v) => expect(motifRefusMontant(v)).not.toBeNull(),
  );
});

describe('motifRefusMontant — précision', () => {
  it('ne se fie pas à Number, qui perd la précision au-delà de 2^53', () => {
    // 9007199254740993 (2^53 + 1) vaut 16 chiffres : refusé pour la capacité,
    // et surtout jamais évalué via Number, qui l'arrondirait silencieusement.
    expect(motifRefusMontant('9007199254740993')).toMatch(/trop grand/);
    // Juste sous la limite : 15 chiffres, bien au-delà de 2^53, doit passer.
    expect(motifRefusMontant('999999999999999')).toBeNull();
  });

  it('affiche le maximum sous forme lisible dans le message', () => {
    expect(motifRefusMontant('1'.repeat(20))).toContain('999 999 999 999 999,9999');
  });
});
