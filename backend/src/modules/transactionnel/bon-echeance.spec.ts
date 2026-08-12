import { BadRequestException } from '@nestjs/common';
import { BonsService } from './bons.service';

/**
 * Cohérence de la récurrence à la création d'un bon.
 *
 * `est_recurrent` existait depuis l'origine sans rien produire : ni fréquence
 * ni date n'étaient exigées, et aucun rappel n'a jamais été envoyé. La règle
 * est donc « les trois ensemble, ou rien » — et elle se vérifie ici, sans base.
 */

/** `echeanceInitiale` est privée : on l'atteint par son nom, comme le fait le service. */
function echeance(input: Record<string, unknown>): string | null {
  const svc = Object.create(BonsService.prototype) as {
    echeanceInitiale: (i: unknown) => string | null;
  };
  return svc.echeanceInitiale(input);
}

/** Une date à N jours d'ici, au format AAAA-MM-JJ. */
function dans(jours: number): string {
  return new Date(Date.now() + jours * 86400000).toISOString().slice(0, 10);
}

describe('Échéance d’un bon récurrent — acceptations', () => {
  it('retient la date quand tout est cohérent', () => {
    const d = dans(30);
    expect(echeance({ estRecurrent: true, frequenceRecurrence: 'MENSUEL', dateProchaineEcheance: d })).toBe(d);
  });

  it('accepte demain — la borne est bien exclusive d’aujourd’hui', () => {
    const d = dans(1);
    expect(echeance({ estRecurrent: true, frequenceRecurrence: 'ANNUEL', dateProchaineEcheance: d })).toBe(d);
  });

  it('tolère les espaces autour de la date', () => {
    const d = dans(10);
    expect(
      echeance({ estRecurrent: true, frequenceRecurrence: 'MENSUEL', dateProchaineEcheance: `  ${d}  ` }),
    ).toBe(d);
  });
});

describe('Échéance d’un bon récurrent — refus', () => {
  it('refuse une récurrence sans fréquence', () => {
    expect(() => echeance({ estRecurrent: true, dateProchaineEcheance: dans(30) })).toThrow(
      BadRequestException,
    );
  });

  it('refuse une récurrence sans date', () => {
    expect(() => echeance({ estRecurrent: true, frequenceRecurrence: 'MENSUEL' })).toThrow(
      /date du prochain rappel/i,
    );
  });

  it('refuse une date vide ou faite d’espaces', () => {
    for (const v of ['', '   ']) {
      expect(() =>
        echeance({ estRecurrent: true, frequenceRecurrence: 'MENSUEL', dateProchaineEcheance: v }),
      ).toThrow(BadRequestException);
    }
  });

  it('refuse un format qui n’est pas AAAA-MM-JJ', () => {
    expect(() =>
      echeance({
        estRecurrent: true,
        frequenceRecurrence: 'MENSUEL',
        dateProchaineEcheance: '12/09/2026',
      }),
    ).toThrow(/AAAA-MM-JJ/);
  });

  it('refuse un jour qui n’existe pas', () => {
    expect(() =>
      echeance({
        estRecurrent: true,
        frequenceRecurrence: 'MENSUEL',
        dateProchaineEcheance: '2027-02-31',
      }),
    ).toThrow(BadRequestException);
  });

  it('refuse aujourd’hui : le rappel partirait dans l’heure', () => {
    expect(() =>
      echeance({
        estRecurrent: true,
        frequenceRecurrence: 'MENSUEL',
        dateProchaineEcheance: dans(0),
      }),
    ).toThrow(/postérieure/i);
  });

  it('refuse une date passée', () => {
    expect(() =>
      echeance({
        estRecurrent: true,
        frequenceRecurrence: 'MENSUEL',
        dateProchaineEcheance: dans(-1),
      }),
    ).toThrow(BadRequestException);
  });
});

describe('Bon ordinaire', () => {
  it('n’a pas d’échéance, et n’en exige aucune', () => {
    expect(echeance({})).toBeNull();
    expect(echeance({ estRecurrent: false })).toBeNull();
  });

  it('ignore une date posée par erreur sur un bon non récurrent', () => {
    // Sinon la base porterait une échéance que le job ne regarderait jamais —
    // une donnée fausse est pire qu'une donnée absente.
    expect(echeance({ estRecurrent: false, dateProchaineEcheance: dans(30) })).toBeNull();
  });
});
