import { BonsService } from './bons.service';

/**
 * « Les bons que j'ai traités », filtrés sur des dates.
 *
 * Le point qui se trompe facilement : QUELLE date la plage borne. Un validateur
 * qui demande « ce que j'ai validé le 12 » parle du jour où IL a signé, pas du
 * jour où le demandeur a saisi le bon — les deux peuvent être séparés de
 * plusieurs semaines. La plage doit donc porter sur `date_validation`, et
 * surtout PAS en plus sur `created_at`, sinon la liste ne renvoie que les bons
 * créés ET validés le même jour, c'est-à-dire presque rien.
 *
 * On inspecte le SQL construit plutôt que le résultat : c'est la clause qui
 * porte la règle, et elle est vérifiable sans base.
 */

/** Constructeur de requête factice : il enregistre les clauses et les paramètres. */
function fauxQueryBuilder() {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};
  const selects: string[] = [];
  const groupes: string[] = [];
  const qb: any = {
    clauses,
    params,
    selects,
    groupes,
    where: () => qb,
    leftJoin: () => qb,
    select: (s: string, alias?: string) => {
      selects.push(`${s}${alias ? ` AS ${alias}` : ''}`);
      return qb;
    },
    addSelect: (s: string, alias?: string) => {
      selects.push(`${s}${alias ? ` AS ${alias}` : ''}`);
      return qb;
    },
    groupBy: (s: string) => {
      groupes.push(s);
      return qb;
    },
    getRawMany: async () => [],
    orderBy: () => qb,
    addOrderBy: () => qb,
    andWhere: (clause: string, p?: Record<string, unknown>) => {
      clauses.push(clause);
      Object.assign(params, p ?? {});
      return qb;
    },
    getRawAndEntities: async () => ({ entities: [], raw: [] }),
  };
  return qb;
}

function service() {
  const qb = fauxQueryBuilder();
  // Seul le premier dépôt (les bons) sert ici : findAll ne touche à rien d'autre.
  const rien = {} as any;
  const svc = new BonsService(
    { createQueryBuilder: () => qb } as any,
    rien, rien, rien, rien, rien, rien, rien, rien, rien, rien, rien,
  );
  return { svc, qb };
}

/** Concatène les clauses pour chercher un fragment, quel que soit leur ordre. */
const sql = (qb: any) => qb.clauses.join(' | ');

describe('findAll — filtre « bons que j’ai traités »', () => {
  it('interroge le journal des décisions par EXISTS, pas par jointure', async () => {
    const { svc, qb } = service();
    await svc.findAll({ validateurId: '7' });
    expect(sql(qb)).toContain('EXISTS');
    expect(sql(qb)).toContain('dbo.trx_validation_bon');
    expect(sql(qb)).toContain('v.validateur_id = :validateurId');
    expect(qb.params.validateurId).toBe('7');
    // Une jointure ferait apparaître deux fois un bon validé puis signé.
    expect(sql(qb)).not.toContain('INNER JOIN dbo.trx_validation_bon');
  });

  it('borne la plage sur la DATE DE DÉCISION', async () => {
    const { svc, qb } = service();
    await svc.findAll({ validateurId: '7', dateFrom: '2026-08-01', dateTo: '2026-08-12' });
    expect(sql(qb)).toContain('v.date_validation >= :vdf');
    expect(sql(qb)).toContain('v.date_validation <= :vdt');
  });

  it('n’applique PAS la plage à la date de création dans ce mode', async () => {
    const { svc, qb } = service();
    await svc.findAll({ validateurId: '7', dateFrom: '2026-08-01', dateTo: '2026-08-12' });
    expect(sql(qb)).not.toContain('bon.created_at >=');
    expect(sql(qb)).not.toContain('bon.created_at <=');
  });

  it('va jusqu’au bout de la journée de fin', async () => {
    const { svc, qb } = service();
    await svc.findAll({ validateurId: '7', dateTo: '2026-08-12' });
    const fin = qb.params.vdt as Date;
    expect(fin.getHours()).toBe(23);
    expect(fin.getMinutes()).toBe(59);
    // Sans cela, un bon validé à 14 h le 12 serait exclu d'une plage « au 12 ».
    expect(fin.getSeconds()).toBe(59);
  });

  it('reste optionnel : sans validateur, la plage porte sur la création', async () => {
    const { svc, qb } = service();
    await svc.findAll({ dateFrom: '2026-08-01', dateTo: '2026-08-12' });
    expect(sql(qb)).toContain('bon.created_at >= :df');
    expect(sql(qb)).toContain('bon.created_at <= :dt');
    expect(sql(qb)).not.toContain('trx_validation_bon');
  });

  it('accepte un validateur sans plage de dates', async () => {
    const { svc, qb } = service();
    await svc.findAll({ validateurId: '7' });
    expect(sql(qb)).not.toContain('v.date_validation');
    expect(qb.params.vdf).toBeUndefined();
    expect(qb.params.vdt).toBeUndefined();
  });

  it('se combine avec le statut sans perdre le filtre de décision', async () => {
    const { svc, qb } = service();
    await svc.findAll({ validateurId: '7', statut: 'DECAISSE' as any });
    expect(sql(qb)).toContain('bon.statut = :statut');
    expect(sql(qb)).toContain('v.validateur_id = :validateurId');
  });
});

/**
 * Compteurs par statut : ce qui alimente les puces de filtre du mobile.
 *
 * L'erreur à ne pas commettre serait d'y appliquer le statut sélectionné — les
 * autres puces tomberaient alors toutes à zéro dès le premier clic, et
 * l'utilisateur ne pourrait plus en changer sans revenir à « Tous ».
 */
describe('compterParStatut — compteurs des puces', () => {
  it('agrège en base, par statut', async () => {
    const { svc, qb } = service();
    await svc.compterParStatut({});
    expect(qb.groupes).toContain('bon.statut');
    expect(qb.selects.join(' | ')).toContain('COUNT(bon.id)');
  });

  it('respecte la plage de dates de la liste', async () => {
    const { svc, qb } = service();
    await svc.compterParStatut({ dateFrom: '2026-08-01', dateTo: '2026-08-12' });
    expect(sql(qb)).toContain('bon.created_at >= :df');
    expect(sql(qb)).toContain('bon.created_at <= :dt');
    const fin = qb.params.dt as Date;
    expect(fin.getHours()).toBe(23);
  });

  it('se restreint au demandeur quand il est fourni', async () => {
    const { svc, qb } = service();
    await svc.compterParStatut({ demandeurId: '5' });
    expect(sql(qb)).toContain('bon.demandeur_id = :demandeurId');
    expect(qb.params.demandeurId).toBe('5');
  });

  it('n’accepte aucun filtre de statut : les compteurs restent complets', async () => {
    const { svc, qb } = service();
    await svc.compterParStatut({ demandeurId: '5', dateFrom: '2026-08-01' });
    expect(sql(qb)).not.toContain('bon.statut =');
  });

  it('rend des nombres, jamais les chaînes brutes du pilote SQL', async () => {
    const { svc, qb } = service();
    qb.getRawMany = async () => [
      { statut: 'CREE', count: '3', montant: '150000.0000' },
      { statut: 'DECAISSE', count: 1, montant: null },
    ];
    const res = await svc.compterParStatut({});
    expect(res).toEqual([
      { statut: 'CREE', count: 3, montant: 150000 },
      { statut: 'DECAISSE', count: 1, montant: 0 },
    ]);
  });
});
