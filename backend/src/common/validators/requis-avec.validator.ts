import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

/** Vrai si la valeur est une chaîne non vide (après trim). */
function renseigne(v: unknown): boolean {
  return typeof v === 'string' && v.trim() !== '';
}

/**
 * Le champ décoré ne peut être renseigné que si `autreChamp` l'est aussi.
 *
 * Cas d'usage : le NOM du client d'un encaissement. Il était en saisie libre et
 * indépendant du code client, si bien qu'on pouvait attribuer un encaissement à
 * n'importe quel nom sans qu'aucun client réel n'y corresponde — constaté en
 * test le 10/08/2026, un encaissement de 100 000 XOF enregistré au nom de
 * l'utilisatrice elle-même, sans code client.
 *
 * Les deux champs restent facultatifs ensemble : un encaissement sans client
 * demeure légitime (dotation, remise en banque, apport), c'est le champ `motif`
 * qui le décrit.
 */
export function RequisAvec(
  autreChamp: string,
  message: string,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'requisAvec',
      target: object.constructor,
      propertyName,
      constraints: [autreChamp],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          if (!renseigne(value)) return true; // champ vide : rien à exiger
          return renseigne((args.object as Record<string, unknown>)[args.constraints[0]]);
        },
        defaultMessage: () => message,
      },
    });
  };
}
