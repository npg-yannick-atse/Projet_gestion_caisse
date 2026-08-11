import { PaiementSalaireService } from './paiement-salaire.service';

/**
 * Arriérés de salaire : les mois antérieurs restés impayés.
 *
 * Cas métier : un employé absent le jour de la paie n'est pas réglé ce mois-là,
 * et on le paie à son retour. Il fallait rouvrir chaque mois passé un par un
 * pour retrouver qui restait dû — cette vue les rassemble.
 *
 * La fiche employé ne porte PAS de date d'embauche : un salaire n'est donc dû
 * qu'à partir du mois d'entrée de l'employé dans l'application (`created_at`).
 */
function monter(opts: {
  employes: Array<{ id: string; matricule: string; nom: string; salaire?: string | null; createdAt: string }>;
  payes?: Array<{ employeId: string; periode: string }>;
}) {
  const employes = opts.employes.map((e) => ({
    ...e,
    prenoms: null,
    directionId: null,
    estActif: true,
    // `?? ` écraserait un null volontaire : on ne comble que l'absence de clé.
    salaire: e.salaire === undefined ? '100000' : e.salaire,
    createdAt: new Date(e.createdAt),
  }));

  const employeRepo = {
    createQueryBuilder: () => {
      const qb: any = {
        where: () => qb, andWhere: () => qb, orderBy: () => qb, addOrderBy: () => qb,
        getMany: async () => employes,
      };
      return qb;
    },
  };
  const repo = { find: async () => opts.payes ?? [] };

  const service = Object.create(PaiementSalaireService.prototype) as PaiementSalaireService;
  // `salairesDuMois` vide : le service se replie sur le salaire de la fiche.
  // Le montant par mois est couvert par les tests de l'historique lui-même.
  Object.assign(service, {
    employeRepo,
    repo,
    employes: { salairesDuMois: async () => new Map<string, string>() },
  });
  return service;
}

const EMP = { id: '1', matricule: 'E1', nom: 'AAA', createdAt: '2026-01-15T00:00:00Z' };

describe('listerArrieres — périmètre des mois', () => {
  it('liste tous les mois impayés depuis l’entrée de l’employé, sauf le mois courant', async () => {
    const r = await monter({ employes: [EMP] }).listerArrieres('2026-04');
    // Janvier à mars : le mois demandé (avril) est exclu, il a sa propre grille.
    expect(r.lignes.map((l) => l.periode)).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('ne réclame rien avant le mois d’entrée de l’employé', async () => {
    const r = await monter({
      employes: [{ ...EMP, createdAt: '2026-03-20T00:00:00Z' }],
    }).listerArrieres('2026-04');
    expect(r.lignes.map((l) => l.periode)).toEqual(['2026-03']);
  });

  it('ne renvoie rien pour un employé entré le mois même', async () => {
    const r = await monter({
      employes: [{ ...EMP, createdAt: '2026-04-02T00:00:00Z' }],
    }).listerArrieres('2026-04');
    expect(r.lignes).toHaveLength(0);
  });

  it('écarte les mois déjà payés', async () => {
    const r = await monter({
      employes: [EMP],
      payes: [{ employeId: '1', periode: '2026-02' }],
    }).listerArrieres('2026-04');
    expect(r.lignes.map((l) => l.periode)).toEqual(['2026-01', '2026-03']);
  });

  it('ne remonte pas au-delà de la profondeur maximale', async () => {
    const r = await monter({
      employes: [{ ...EMP, createdAt: '2015-01-01T00:00:00Z' }],
    }).listerArrieres('2026-04');
    expect(r.lignes.length).toBe(PaiementSalaireService.MAX_MOIS_ARRIERES);
  });
});

describe('listerArrieres — restitution', () => {
  it('ordonne du plus ancien au plus récent', async () => {
    const r = await monter({ employes: [EMP] }).listerArrieres('2026-04');
    const periodes = r.lignes.map((l) => l.periode);
    expect([...periodes].sort()).toEqual(periodes);
  });

  it('compte les lignes et les employés concernés', async () => {
    const r = await monter({
      employes: [EMP, { id: '2', matricule: 'E2', nom: 'BBB', createdAt: '2026-03-01T00:00:00Z' }],
    }).listerArrieres('2026-04');
    // 3 mois pour E1 + 1 pour E2.
    expect(r.stats).toEqual({ nb: 4, employesConcernes: 2 });
  });

  it('remonte le salaire même absent, pour signaler la fiche à compléter', async () => {
    const r = await monter({
      employes: [{ ...EMP, createdAt: '2026-03-01T00:00:00Z', salaire: null }],
    }).listerArrieres('2026-04');
    expect(r.lignes[0].salaire).toBeNull();
  });

  it('ne renvoie rien quand aucun employé ne correspond', async () => {
    const r = await monter({ employes: [] }).listerArrieres('2026-04');
    expect(r.lignes).toHaveLength(0);
    expect(r.stats).toEqual({ nb: 0, employesConcernes: 0 });
  });
});
