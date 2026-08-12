import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { DecaisserBonDto } from './decaisser-bon.dto';

/**
 * Le bénéficiaire d'un décaissement est obligatoire.
 *
 * Le corps n'était typé qu'en ligne, sans validation : un appel sans
 * bénéficiaire traversait l'autorisation, ouvrait la transaction et n'échouait
 * qu'à l'INSERT, sur une contrainte NOT NULL. Constaté le 12/08/2026 pendant le
 * test de la matrice des rôles — les comptes CAISSIER et ADMINISTRATEUR, seuls
 * porteurs de BON_DECAISSER, atteignaient la base avec un corps vide.
 */
function messages(payload: unknown): string[] {
  return validateSync(plainToInstance(DecaisserBonDto, payload ?? {})).flatMap((e) =>
    Object.values(e.constraints ?? {}),
  );
}

const ATTENDU = 'Le bénéficiaire est obligatoire : indiquez qui reçoit l’argent.';

describe('DecaisserBonDto — le bénéficiaire est exigé', () => {
  it('refuse un corps vide — le cas exact du test de rôles', () => {
    expect(messages({})).toContain(ATTENDU);
  });

  it('refuse un bénéficiaire absent, vide ou fait d’espaces', () => {
    expect(messages({ beneficiairePiece: 'CNI-123' })).toContain(ATTENDU);
    expect(messages({ beneficiaire: '' })).toContain(ATTENDU);
  });

  it('accepte un bénéficiaire seul', () => {
    expect(messages({ beneficiaire: 'KOUASSI Jean' })).toHaveLength(0);
  });

  it('accepte le bénéficiaire avec sa pièce', () => {
    expect(messages({ beneficiaire: 'KOUASSI Jean', beneficiairePiece: 'CNI-123' })).toHaveLength(0);
  });

  it('borne la longueur du nom', () => {
    expect(messages({ beneficiaire: 'x'.repeat(256) }).length).toBeGreaterThan(0);
  });

  it('laisse passer les ajustements de dernière minute', () => {
    expect(
      messages({ beneficiaire: 'KOUASSI Jean', modifications: { '12': { montant: '500' } } }),
    ).toHaveLength(0);
  });
});
