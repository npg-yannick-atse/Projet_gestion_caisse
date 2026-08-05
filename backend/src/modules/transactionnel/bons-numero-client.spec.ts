/**
 * Format du numéro client : identifiant SAP (KUNNR), chiffres uniquement.
 *
 * La règle est appliquée à DEUX niveaux :
 *  - les DTO (partenaire, bon manuel, modification de sous-bon, encaissement)
 *    via @Matches ;
 *  - la création de bon, qui ne passe PAS par un DTO class-validator — c'est la
 *    voie principale de saisie, et sans ce contrôle l'API comme le mobile
 *    accepteraient n'importe quelle chaîne. Des valeurs comme « TEST », « DFF »
 *    ou « fff » ont d'ailleurs été trouvées en base avant ce verrouillage.
 *
 * Ces tests portent sur la règle elle-même, indépendamment du transport.
 */
const REGLE = /^\d+$/;

/** Reproduit la validation de bons.service.createBon (champ optionnel). */
function valider(numeroClient: unknown): void {
  const num = numeroClient == null ? '' : String(numeroClient).trim();
  if (num !== '' && !REGLE.test(num)) {
    throw new Error(`Numéro client invalide (« ${num} ») : il ne doit contenir que des chiffres.`);
  }
}

describe('Numéro client — valeurs acceptées', () => {
  it('accepte un identifiant SAP tel que renvoyé par KNA1', () => {
    for (const v of ['4111000535', '4112000150', '0000012345']) {
      expect(() => valider(v)).not.toThrow();
    }
  });

  it('conserve les zéros de tête (le numéro est une chaîne, pas un nombre)', () => {
    // 0100351478 ≠ 100351478 : ne jamais convertir en Number.
    expect(() => valider('0000012345')).not.toThrow();
  });

  it('tolère un champ vide ou absent (le numéro est optionnel)', () => {
    for (const v of ['', '   ', null, undefined]) {
      expect(() => valider(v)).not.toThrow();
    }
  });

  it('ignore les espaces autour de la valeur', () => {
    expect(() => valider('  4111000535  ')).not.toThrow();
  });
});

describe('Numéro client — valeurs refusées', () => {
  it('refuse les valeurs alphabétiques trouvées en base avant le verrouillage', () => {
    for (const v of ['TEST', 'DFF', 'DFL', 'fff', 'GF', 'SDFG']) {
      expect(() => valider(v)).toThrow(/chiffres/i);
    }
  });

  it('refuse un mélange de chiffres et de lettres', () => {
    for (const v of ['4111A', 'A4111', '411 1000', '4111-000']) {
      expect(() => valider(v)).toThrow(/chiffres/i);
    }
  });

  it('refuse les décimales et les signes', () => {
    for (const v of ['123.45', '-123', '+123', '1,5']) {
      expect(() => valider(v)).toThrow(/chiffres/i);
    }
  });

  it('cite la valeur fautive dans le message, pour que la saisie soit corrigeable', () => {
    expect(() => valider('ABC')).toThrow(/ABC/);
  });
});
