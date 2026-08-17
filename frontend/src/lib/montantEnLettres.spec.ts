import { describe, expect, it } from 'vitest';
import { montantEnLettres } from './montantEnLettres';

/**
 * Le montant en toutes lettres est ce qui empêche d'ajouter un zéro après coup
 * sur un reçu. Encore faut-il qu'il soit juste : les accords français sont
 * pleins de pièges, et une faute sur une pièce comptable se remarque.
 */
describe('montant en toutes lettres', () => {
  it('écrit les nombres simples', () => {
    expect(montantEnLettres(0, 'XOF')).toBe('ZÉRO FRANC CFA');
    expect(montantEnLettres(1, 'XOF')).toBe('UN FRANC CFA');
    expect(montantEnLettres(16, 'XOF')).toBe('SEIZE FRANCS CFA');
  });

  it('gère les soixante-dix et quatre-vingt-dix', () => {
    // Le piège classique : 71 prend « et », 91 non.
    expect(montantEnLettres(71, 'XOF')).toBe('SOIXANTE ET ONZE FRANCS CFA');
    expect(montantEnLettres(91, 'XOF')).toBe('QUATRE-VINGT-ONZE FRANCS CFA');
    expect(montantEnLettres(77, 'XOF')).toBe('SOIXANTE-DIX-SEPT FRANCS CFA');
  });

  it('accorde quatre-vingts seulement quand rien ne suit', () => {
    expect(montantEnLettres(80, 'XOF')).toBe('QUATRE-VINGTS FRANCS CFA');
    expect(montantEnLettres(81, 'XOF')).toBe('QUATRE-VINGT-UN FRANCS CFA');
  });

  it('accorde cent seulement quand rien ne suit', () => {
    expect(montantEnLettres(100, 'XOF')).toBe('CENT FRANCS CFA');
    expect(montantEnLettres(200, 'XOF')).toBe('DEUX CENTS FRANCS CFA');
    expect(montantEnLettres(201, 'XOF')).toBe('DEUX CENT UN FRANCS CFA');
  });

  it('laisse mille invariable, et ne dit pas « un mille »', () => {
    expect(montantEnLettres(1000, 'XOF')).toBe('MILLE FRANCS CFA');
    expect(montantEnLettres(30000, 'XOF')).toBe('TRENTE MILLE FRANCS CFA');
    expect(montantEnLettres(200000, 'XOF')).toBe('DEUX CENT MILLE FRANCS CFA');
  });

  it('accorde millions et milliards, qui sont des noms', () => {
    expect(montantEnLettres(1_000_000, 'XOF')).toBe('UN MILLION FRANCS CFA');
    expect(montantEnLettres(2_000_000, 'XOF')).toBe('DEUX MILLIONS FRANCS CFA');
    expect(montantEnLettres(1_000_000_000, 'XOF')).toBe('UN MILLIARD FRANCS CFA');
  });

  it('ne mentionne les centimes que s’il y en a', () => {
    // Un montant en francs CFA n'a pas de décimale : écrire « zéro centime »
    // sur chaque reçu ferait du bruit là où l'on cherche un chiffre.
    expect(montantEnLettres('30000.00', 'XOF')).toBe('TRENTE MILLE FRANCS CFA');
    expect(montantEnLettres('12.50', 'EUR')).toBe('DOUZE EUROS ET CINQUANTE CENTIMES');
    expect(montantEnLettres('1.01', 'EUR')).toBe('UN EURO ET UN CENTIME');
  });

  it('arrondit les centimes plutôt que de les tronquer', () => {
    // Sans arrondi, la virgule flottante donnerait 29 centimes.
    expect(montantEnLettres(0.1 + 0.2, 'EUR')).toBe('ZÉRO EURO ET TRENTE CENTIMES');
  });

  it('compose un montant complet sans faute', () => {
    expect(montantEnLettres(1_234_567, 'XOF')).toBe(
      'UN MILLION DEUX CENT TRENTE-QUATRE MILLE CINQ CENT SOIXANTE-SEPT FRANCS CFA',
    );
  });
});
