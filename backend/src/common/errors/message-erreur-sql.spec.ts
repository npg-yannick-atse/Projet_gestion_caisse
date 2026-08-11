import { messageErreurSql } from './message-erreur-sql';

/**
 * Aucun texte de pilote SQL ne doit atteindre l'utilisateur.
 *
 * Les deux messages ci-dessous sont ceux réellement reçus par la testeuse le
 * 10/08/2026, tels qu'ils apparaissaient à l'écran.
 */
const VIOLATION_UNIQUE =
  "Error: Violation of UNIQUE KEY constraint 'UQ_fin_caisse_code'. Cannot insert duplicate key in object 'dbo.fin_caisse'. The duplicate key value is (CAT_CAISSIER).";
const DECIMAL_INVALIDE =
  'Error: The incoming tabular data stream (TDS) remote procedure call (RPC) protocol stream is incorrect. Parameter 3 ("@0"): The supplied value is not a valid instance of data type decimal. Check the source data for invalid values.';

describe('messageErreurSql — traduction', () => {
  it('traduit une violation de contrainte unique', () => {
    expect(messageErreurSql(VIOLATION_UNIQUE)).toMatch(/déjà utilisée/);
  });

  it('mentionne le cas du code retenu par un élément supprimé', () => {
    // C'est précisément ce qui bloquait la testeuse : le piège mérite d'être dit.
    expect(messageErreurSql(VIOLATION_UNIQUE)).toMatch(/supprimé/);
  });

  it('traduit un dépassement de capacité décimale', () => {
    expect(messageErreurSql(DECIMAL_INVALIDE)).toMatch(/dépasse la capacité/);
  });

  it('traduit une violation de clé étrangère', () => {
    expect(
      messageErreurSql('The DELETE statement conflicted with the REFERENCE constraint "FK_x". '),
    ).toMatch(/référencé/);
  });

  it('traduit un champ obligatoire vide', () => {
    expect(messageErreurSql("Cannot insert the value NULL into column 'code'")).toMatch(/obligatoire/);
  });

  it('traduit une valeur trop longue', () => {
    expect(messageErreurSql('String or binary data would be truncated in table')).toMatch(/trop longue/);
  });

  it('reste générique sur une erreur inconnue', () => {
    expect(messageErreurSql('Some brand new driver failure 0x80004005')).toMatch(/administrateur/);
  });

  it('tolère un texte vide', () => {
    expect(messageErreurSql('')).toMatch(/administrateur/);
  });
});

describe('messageErreurSql — rien ne fuit', () => {
  const FUITES = [
    'UQ_fin_caisse_code',
    'dbo.fin_caisse',
    'CAT_CAISSIER',
    'tabular data stream',
    'RPC',
    'Parameter 3',
    'FK_x',
  ];

  it.each([VIOLATION_UNIQUE, DECIMAL_INVALIDE, 'The DELETE statement conflicted with the REFERENCE constraint "FK_x".'])(
    'ne laisse passer ni nom de table, ni de contrainte, ni jargon (%#)',
    (brut) => {
      const sortie = messageErreurSql(brut);
      for (const fuite of FUITES) {
        expect(sortie).not.toContain(fuite);
      }
    },
  );

  it('ne renvoie jamais le texte d’origine', () => {
    expect(messageErreurSql(VIOLATION_UNIQUE)).not.toBe(VIOLATION_UNIQUE);
    expect(messageErreurSql(DECIMAL_INVALIDE)).not.toBe(DECIMAL_INVALIDE);
  });
});
