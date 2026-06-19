import { ValueTransformer } from 'typeorm';

/**
 * Le driver mssql (tedious) renvoie les colonnes DECIMAL en `number` JavaScript.
 * Cela (1) casse la précision sur les grands montants et (2) contredit le type
 * `string` déclaré sur les entités — ce qui provoque côté front des erreurs de
 * validation type « Expected string, received number ».
 *
 * Ce transformer force la LECTURE en string. L'écriture est inchangée : l'app
 * passe déjà des strings (ou des nombres) que le driver convertit en DECIMAL.
 */
export const decimalToString: ValueTransformer = {
  to: (value?: string | number | null) => value,
  from: (value?: string | number | null) =>
    value === null || value === undefined ? value : String(value),
};
