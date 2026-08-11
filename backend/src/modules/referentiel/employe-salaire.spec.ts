import { BadRequestException } from '@nestjs/common';
import { EmployesService } from './employes.service';

/**
 * Le salaire est un HISTORIQUE de périodes, comme les bénéfices.
 *
 * C'était une simple colonne, écrasée à chaque augmentation. Conséquence la plus
 * grave : la grille chiffrait le « reste dû » au salaire COURANT, si bien
 * qu'augmenter quelqu'un en août puis régler son juillet impayé lui aurait versé
 * le nouveau montant pour juillet.
 *
 * Ces tests portent sur la résolution « quel salaire s'appliquait à ce mois ? »
 * et sur l'ouverture d'une nouvelle période.
 */

/** Historique factice : le SQL est remplacé par un filtrage équivalent en mémoire. */
function monter(periodes: Array<{ employeId: string; montant: string; dateDebut: string; dateFin?: string | null }>) {
  const service = Object.create(EmployesService.prototype) as EmployesService;
  const query = async (sql: string, params: any[]) => {
    // `salaireDuMois` : un employé, un jour.
    if (params.length === 2) {
      const [employeId, jour] = params;
      const c = periodes
        .filter((p) => p.employeId === String(employeId) && p.dateDebut <= jour && (!p.dateFin || p.dateFin >= jour))
        .sort((a, b) => b.dateDebut.localeCompare(a.dateDebut));
      return c.length ? [{ montant: c[0].montant }] : [];
    }
    // `salairesDuMois` : tous les employés, un jour.
    const [jour] = params;
    const parEmploye = new Map<string, { montant: string; dateDebut: string }>();
    for (const p of periodes) {
      if (p.dateDebut > jour || (p.dateFin && p.dateFin < jour)) continue;
      const cur = parEmploye.get(p.employeId);
      if (!cur || p.dateDebut > cur.dateDebut) parEmploye.set(p.employeId, p);
    }
    return [...parEmploye.entries()].map(([employe_id, v]) => ({ employe_id, montant: v.montant }));
  };
  Object.assign(service, { salaireRepo: { manager: { query } } });
  return service;
}

const HISTORIQUE = [
  { employeId: '1', montant: '400000', dateDebut: '2026-01-01', dateFin: '2026-06-30' },
  { employeId: '1', montant: '450000', dateDebut: '2026-07-01', dateFin: null },
  { employeId: '2', montant: '300000', dateDebut: '2026-05-01', dateFin: null },
];

describe('salaireDuMois — le passé n’est pas réécrit', () => {
  it('rend le salaire EN VIGUEUR ce mois-là, pas le salaire courant', async () => {
    const s = monter(HISTORIQUE);
    expect(await s.salaireDuMois('1', '2026-03')).toBe('400000');
    expect(await s.salaireDuMois('1', '2026-08')).toBe('450000');
  });

  it('bascule au mois exact de l’augmentation', async () => {
    const s = monter(HISTORIQUE);
    expect(await s.salaireDuMois('1', '2026-06')).toBe('400000');
    expect(await s.salaireDuMois('1', '2026-07')).toBe('450000');
  });

  it('ne rend rien avant la première période', async () => {
    const s = monter(HISTORIQUE);
    expect(await s.salaireDuMois('2', '2026-04')).toBeNull();
  });

  it('ne rend rien pour un employé sans historique', async () => {
    const s = monter(HISTORIQUE);
    expect(await s.salaireDuMois('99', '2026-08')).toBeNull();
  });
});

describe('salairesDuMois — résolution groupée', () => {
  it('rend le bon montant pour chaque employé', async () => {
    const m = await monter(HISTORIQUE).salairesDuMois(['1', '2'], '2026-08');
    expect(m.get('1')).toBe('450000');
    expect(m.get('2')).toBe('300000');
  });

  it('donne les mêmes montants que la résolution unitaire', async () => {
    const s = monter(HISTORIQUE);
    const m = await s.salairesDuMois(['1'], '2026-03');
    expect(m.get('1')).toBe(await s.salaireDuMois('1', '2026-03'));
  });

  it('omet les employés non couverts ce mois-là', async () => {
    const m = await monter(HISTORIQUE).salairesDuMois(['1', '2'], '2026-04');
    expect(m.has('2')).toBe(false);
  });

  it('ne renvoie que les employés demandés', async () => {
    const m = await monter(HISTORIQUE).salairesDuMois(['2'], '2026-08');
    expect([...m.keys()]).toEqual(['2']);
  });

  it('gère une liste vide sans interroger la base', async () => {
    expect((await monter(HISTORIQUE).salairesDuMois([], '2026-08')).size).toBe(0);
  });
});

describe('changerSalaire — enchaînement des périodes', () => {
  /** Service avec transaction simulée, pour observer ce qui est écrit. */
  function monterEcriture(derniere: any) {
    const service = Object.create(EmployesService.prototype) as EmployesService;
    const sauves: any[] = [];
    const repo = {
      findOne: async () => derniere,
      create: (x: any) => x,
      save: async (x: any) => { sauves.push(x); return { ...x, id: '9' }; },
    };
    Object.assign(service, {
      findEmploye: async () => ({ id: '1', salaire: '400000' }),
      dataSource: { transaction: async (cb: any) => cb({ getRepository: () => repo }) },
    });
    return { service, sauves };
  }

  it('clôt la période en cours la VEILLE de la nouvelle', async () => {
    const { service, sauves } = monterEcriture({ id: '1', dateDebut: '2026-01-01', dateFin: null });
    await service.changerSalaire('1', { montant: '450000', dateDebut: '2026-07-01' }, '10');
    expect(sauves[0].dateFin).toBe('2026-06-30');
  });

  it('ouvre la nouvelle période sans date de fin', async () => {
    const { service, sauves } = monterEcriture({ id: '1', dateDebut: '2026-01-01', dateFin: null });
    await service.changerSalaire('1', { montant: '450000', dateDebut: '2026-07-01' }, '10');
    expect(sauves[1]).toMatchObject({ montant: '450000', dateDebut: '2026-07-01', dateFin: null });
  });

  it('refuse une date d’effet antérieure ou égale à la période en cours', async () => {
    const { service } = monterEcriture({ id: '1', dateDebut: '2026-07-01', dateFin: null });
    await expect(
      service.changerSalaire('1', { montant: '450000', dateDebut: '2026-07-01' }, '10'),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.changerSalaire('1', { montant: '450000', dateDebut: '2026-05-01' }, '10'),
    ).rejects.toThrow(/postérieure/);
  });

  it('accepte la toute première période, sans historique préalable', async () => {
    const { service, sauves } = monterEcriture(null);
    await service.changerSalaire('1', { montant: '400000', dateDebut: '2026-01-01' }, '10');
    expect(sauves[0]).toMatchObject({ montant: '400000', dateFin: null });
  });
});
