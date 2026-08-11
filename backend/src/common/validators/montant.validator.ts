import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

/**
 * Capacité réelle des colonnes de montant : `DECIMAL(19,4)`, soit 19 chiffres
 * dont 4 décimales — donc 15 chiffres avant la virgule.
 */
export const MONTANT_DECIMALES = 4;
export const MONTANT_ENTIERS = 15;
export const MONTANT_MAX = '999999999999999.9999';

/** Chiffres, virgule décimale optionnelle. Le nombre de décimales est contrôlé à part. */
const FORMAT = /^\d+(\.\d+)?$/;

/** 999999999999999.9999 → « 999 999 999 999 999,9999 » (lisible dans un message). */
function lisible(v: string): string {
  const [entier, dec] = v.split('.');
  return entier.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (dec ? ',' + dec : '');
}

/**
 * Motif du refus, ou `null` si la valeur est acceptable.
 * Exporté pour être testable sans passer par class-validator.
 */
export function motifRefusMontant(valeur: unknown, autoriserVide = false): string | null {
  if (autoriserVide && valeur === '') return null;
  if (typeof valeur !== 'string' || valeur.trim() === '') {
    return 'Montant requis.';
  }
  const v = valeur.trim();
  if (!FORMAT.test(v)) {
    return 'Montant invalide : chiffres uniquement, avec un point comme séparateur décimal.';
  }
  const [entier, decimales = ''] = v.split('.');
  if (decimales.length > MONTANT_DECIMALES) {
    return `Au plus ${MONTANT_DECIMALES} décimales.`;
  }
  // Comparaison sur la LONGUEUR puis lexicographique : `Number` perd de la
  // précision au-delà de 2^53 et validerait des montants que la base refuse.
  const entierNet = entier.replace(/^0+(?=\d)/, '');
  if (entierNet.length > MONTANT_ENTIERS) {
    return `Montant trop grand (maximum ${lisible(MONTANT_MAX)}).`;
  }
  return null;
}

/**
 * Montant monétaire accepté par la base.
 *
 * `@IsNumberString()` ne vérifiait que « c'est un nombre » : une valeur de
 * 41 chiffres passait la validation, puis faisait échouer le pilote SQL, dont
 * le message brut (« The incoming tabular data stream… is not a valid instance
 * of data type decimal ») remontait tel quel à l'écran. Constaté en test le
 * 10/08/2026 sur la création de portefeuille.
 */
export function IsMontant(
  /** `autoriserVide` : une chaîne vide efface la valeur (ex. retirer un plafond). */
  options: { autoriserVide?: boolean } = {},
  validationOptions?: ValidationOptions,
) {
  const vide = options.autoriserVide === true;
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isMontant',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown) => motifRefusMontant(value, vide) === null,
        defaultMessage: (args: ValidationArguments) =>
          motifRefusMontant(args.value, vide) ?? 'Montant invalide.',
      },
    });
  };
}
