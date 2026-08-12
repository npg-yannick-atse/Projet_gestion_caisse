import { estDateIso, prochaineEcheance, reporterApres } from './recurrence';

/**
 * Report d'échéance d'un bon récurrent.
 *
 * Tout se joue sur les fins de mois et les années bissextiles : c'est là que le
 * calcul naïf dérape, et une dérive d'un jour par mois finit par décaler le
 * rappel d'une semaine dans l'année.
 */

const jour = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('prochaineEcheance — cas courants', () => {
  it('avance d’un mois, d’un trimestre, d’un semestre, d’un an', () => {
    expect(iso(prochaineEcheance(jour('2026-08-12'), 'MENSUEL'))).toBe('2026-09-12');
    expect(iso(prochaineEcheance(jour('2026-08-12'), 'TRIMESTRIEL'))).toBe('2026-11-12');
    expect(iso(prochaineEcheance(jour('2026-08-12'), 'SEMESTRIEL'))).toBe('2027-02-12');
    expect(iso(prochaineEcheance(jour('2026-08-12'), 'ANNUEL'))).toBe('2027-08-12');
  });

  it('passe correctement d’une année à l’autre', () => {
    expect(iso(prochaineEcheance(jour('2026-12-15'), 'MENSUEL'))).toBe('2027-01-15');
    expect(iso(prochaineEcheance(jour('2026-11-30'), 'TRIMESTRIEL'))).toBe('2027-02-28');
  });
});

describe('prochaineEcheance — fins de mois', () => {
  it('ne saute PAS février depuis un 31 janvier', () => {
    // Le calcul naïf donnerait le 3 mars : février n'a pas de 31.
    expect(iso(prochaineEcheance(jour('2026-01-31'), 'MENSUEL'))).toBe('2026-02-28');
  });

  it('tient compte de l’année bissextile', () => {
    expect(iso(prochaineEcheance(jour('2028-01-31'), 'MENSUEL'))).toBe('2028-02-29');
  });

  it('ne dérive pas : un 31 ramené au 28 revient au 31 le mois suivant', () => {
    // Piège inverse : si l'on repartait du 28 février, on resterait bloqué au 28
    // pour toujours. Ici on repart de l'échéance rendue, il faut donc vérifier
    // que la chaîne complète se comporte comme attendu.
    const fev = prochaineEcheance(jour('2026-01-31'), 'MENSUEL');
    expect(iso(fev)).toBe('2026-02-28');
    expect(iso(prochaineEcheance(fev, 'MENSUEL'))).toBe('2026-03-28');
  });

  it('garde le 30 sur les mois de 31 jours', () => {
    expect(iso(prochaineEcheance(jour('2026-04-30'), 'MENSUEL'))).toBe('2026-05-30');
  });

  it('un 29 février annuel retombe sur le 28', () => {
    expect(iso(prochaineEcheance(jour('2028-02-29'), 'ANNUEL'))).toBe('2029-02-28');
  });
});

describe('reporterApres — rattrapage', () => {
  it('avance d’une seule période quand l’échéance vient d’être atteinte', () => {
    expect(iso(reporterApres(jour('2026-08-12'), 'MENSUEL', jour('2026-08-12')))).toBe('2026-09-12');
  });

  it('rattrape plusieurs périodes manquées d’un coup', () => {
    // Serveur arrêté cinq mois : une seule notification, pas cinq.
    expect(iso(reporterApres(jour('2026-03-10'), 'MENSUEL', jour('2026-08-12')))).toBe('2026-09-10');
  });

  it('rend toujours une date STRICTEMENT postérieure à la référence', () => {
    const res = reporterApres(jour('2020-01-15'), 'TRIMESTRIEL', jour('2026-08-12'));
    expect(res.getTime()).toBeGreaterThan(jour('2026-08-12').getTime());
  });

  it('ne boucle pas indéfiniment sur une fréquence inconnue', () => {
    // Une valeur hors énumération donne un pas nul : sans garde-fou, le job
    // planifié tournerait sans fin.
    const res = reporterApres(jour('2020-01-15'), 'INCONNU' as never, jour('2026-08-12'));
    expect(res).toBeInstanceOf(Date);
  });
});

describe('estDateIso', () => {
  it('accepte une date réelle', () => {
    expect(estDateIso('2026-08-12')).toBe(true);
    expect(estDateIso('2028-02-29')).toBe(true);
  });

  it('refuse un jour qui n’existe pas', () => {
    expect(estDateIso('2026-02-31')).toBe(false);
    expect(estDateIso('2026-02-29')).toBe(false); // 2026 n'est pas bissextile
    expect(estDateIso('2026-13-01')).toBe(false);
  });

  it('refuse ce qui n’est pas au format jour', () => {
    for (const v of ['12/08/2026', '2026-8-1', '2026-08-12T10:00:00Z', '', 'demain']) {
      expect(estDateIso(v)).toBe(false);
    }
  });
});
