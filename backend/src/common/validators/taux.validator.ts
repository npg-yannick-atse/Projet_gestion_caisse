import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

/**
 * Capacité réelle de `fin_taux_echange.taux` : `DECIMAL(19,8)`, soit 19 chiffres
 * dont 8 décimales — donc 11 chiffres avant la virgule.
 *
 * Pendant de `montant.validator` (DECIMAL(19,4)), pour la même raison : sans
 * borne, le pilote SQL rejette la valeur et son message brut remonte à l'écran.
 * Un taux a en plus une contrainte que les montants n'ont pas — il doit être
 * STRICTEMENT positif (CK_fin_te_taux), sans quoi une conversion diviserait
 * par zéro ou inverserait le sens.
 */
export const TAUX_DECIMALES = 8;
export const TAUX_ENTIERS = 11;
export const TAUX_MAX = '99999999999.99999999';

/** Chiffres, virgule décimale optionnelle. Le nombre de décimales est contrôlé à part. */
const FORMAT = /^\d+(\.\d+)?$/;

/** 99999999999.99999999 → « 99 999 999 999,99999999 » (lisible dans un message). */
function lisible(v: string): string {
  const [entier, dec] = v.split('.');
  return entier.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (dec ? ',' + dec : '');
}

/**
 * Motif du refus, ou `null` si la valeur est acceptable.
 * Exporté pour être testable sans passer par class-validator.
 */
export function motifRefusTaux(valeur: unknown): string | null {
  if (typeof valeur !== 'string' || valeur.trim() === '') {
    return 'Taux requis.';
  }
  const v = valeur.trim();
  if (!FORMAT.test(v)) {
    return 'Taux invalide : chiffres uniquement, avec un point comme séparateur décimal.';
  }
  const [entier, decimales = ''] = v.split('.');
  if (decimales.length > TAUX_DECIMALES) {
    return `Au plus ${TAUX_DECIMALES} décimales.`;
  }
  // Comparaison sur la LONGUEUR : `Number` perd de la précision au-delà de 2^53.
  const entierNet = entier.replace(/^0+(?=\d)/, '');
  if (entierNet.length > TAUX_ENTIERS) {
    return `Taux trop grand (maximum ${lisible(TAUX_MAX)}).`;
  }
  // Zéro sous toutes ses écritures : « 0 », « 0.00 », « 000 ».
  if (/^0+(\.0+)?$/.test(v)) {
    return 'Le taux doit être supérieur à zéro.';
  }
  return null;
}

/** Taux de change accepté par la base : DECIMAL(19,8), strictement positif. */
export function IsTaux(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isTaux',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown) => motifRefusTaux(value) === null,
        defaultMessage: (args: ValidationArguments) => motifRefusTaux(args.value) ?? 'Taux invalide.',
      },
    });
  };
}
