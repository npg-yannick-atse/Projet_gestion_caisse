import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { EncaissementDto } from './encaissement.dto';

/**
 * Le nom du client ne se saisit plus librement.
 *
 * Les deux champs étaient indépendants : on pouvait attribuer un encaissement à
 * n'importe quel nom sans code client, donc sans qu'aucun client réel n'y
 * corresponde. Constaté en test le 10/08/2026 — un encaissement de 100 000 XOF
 * enregistré au nom de l'utilisatrice elle-même, sans code client.
 *
 * Un encaissement SANS client reste légitime (dotation, remise en banque) :
 * c'est le champ `motif` qui le décrit.
 */
function messages(payload: Record<string, unknown>): string[] {
  const dto = plainToInstance(EncaissementDto, payload);
  return validateSync(dto, { whitelist: true }).flatMap((e) =>
    Object.values(e.constraints ?? {}),
  );
}

const base = { caisseId: '1', montant: '100000' };

describe('EncaissementDto — nom de client et code client', () => {
  it('refuse un nom de client sans code client', () => {
    expect(messages({ ...base, clientNom: 'Lorène touré' })).toContain(
      'Choisissez le client dans la liste : un nom de client ne peut pas être enregistré sans son code client.',
    );
  });

  it('refuse aussi un code client vide ou fait d’espaces', () => {
    const attendu =
      'Choisissez le client dans la liste : un nom de client ne peut pas être enregistré sans son code client.';
    expect(messages({ ...base, clientNom: 'Lorène touré', clientNumero: '' })).toContain(attendu);
    // Des espaces déclenchent EN PLUS le contrôle « chiffres uniquement » :
    // on vérifie la présence de la règle, pas le nombre total d'erreurs.
    expect(messages({ ...base, clientNom: 'Lorène touré', clientNumero: '   ' })).toContain(attendu);
  });

  it('accepte le couple nom + code', () => {
    expect(messages({ ...base, clientNom: 'SAVANA', clientNumero: '4111000359' })).toHaveLength(0);
  });

  it('accepte un encaissement sans aucun client (dotation, banque…)', () => {
    expect(messages({ ...base, motif: 'Dotation' })).toHaveLength(0);
  });

  it('accepte un code client seul', () => {
    expect(messages({ ...base, clientNumero: '4111000359' })).toHaveLength(0);
  });

  it('ne bloque pas sur un nom vide ou fait d’espaces', () => {
    expect(messages({ ...base, clientNom: '' })).toHaveLength(0);
    expect(messages({ ...base, clientNom: '   ' })).toHaveLength(0);
  });
});

describe('EncaissementDto — contrôles conservés', () => {
  it('exige toujours des chiffres pour le code client', () => {
    expect(messages({ ...base, clientNumero: 'ABC' })).toContain(
      'Le numéro client ne doit contenir que des chiffres.',
    );
  });

  it('borne toujours le montant', () => {
    expect(messages({ ...base, montant: '1'.repeat(20) })).toContain(
      'Montant trop grand (maximum 999 999 999 999 999,9999).',
    );
  });
});
