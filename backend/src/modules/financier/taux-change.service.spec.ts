import { BadRequestException, ConflictException } from '@nestjs/common';
import { TauxChangeService } from './taux-change.service';

/**
 * Règles portées par TauxChangeService : la conversion (les trois voies, et
 * l'arrondi à la devise d'arrivée) et l'écriture en historique de périodes.
 *
 * NON COUVERT ICI, et c'est assumé : la SÉLECTION de la période par la date,
 * qui vit dans un QueryBuilder (`tauxA`). Le mock ne rejouerait pas le SQL —
 * il rejouerait ma propre idée du SQL, et validerait donc la mauvaise chose
 * (même piège que le tri de `salaireDuMois`). Les tests de conversion stubbent
 * `tauxA` et se concentrent sur ce qui est calculé en TypeScript ; la fenêtre
 * de validité se vérifie en base.
 */

const XOF = { id: '1', code: 'XOF', nbDecimales: 0 };
const EUR = { id: '2', code: 'EUR', nbDecimales: 2 };
const USD = { id: '3', code: 'USD', nbDecimales: 2 };
const DEVISES: any[] = [XOF, EUR, USD];

function periode(over: Partial<any> = {}): any {
  return {
    id: '1',
    deviseSourceId: EUR.id,
    deviseCibleId: XOF.id,
    taux: '655.95700000',
    dateValiditeDebut: new Date('2013-01-01T00:00:00.000Z'),
    dateValiditeFin: null,
    source: 'MANUEL',
    motif: null,
    pariteFixe: false,
    ...over,
  };
}

function monter(
  opts: {
    periodes?: any[];
    parametres?: Record<string, string>;
    /**
     * Ce que la requête « période précédente » de `supprimer` doit renvoyer.
     * Injecté plutôt que déduit : rejouer en mémoire le tri et le `id <> :id` du
     * QueryBuilder reviendrait à tester ma propre idée du SQL. En le fixant, le
     * test isole la seule règle TypeScript en jeu — rouvrir, ou non.
     */
    precedentTrouve?: any;
  } = {},
) {
  const periodes: any[] = opts.periodes ?? [];
  const params: Record<string, string> = {
    DEVISE_REFERENCE: 'XOF',
    TAUX_ALERTE_JOURS: '30',
    ...(opts.parametres ?? {}),
  };

  const sauvegardes: any[] = [];
  const supprimes: string[] = [];

  // Les devises sont indexées PAR ID : un mock qui répondrait la même chose pour
  // tout identifiant ne saurait pas distinguer la source de la cible.
  const deviseRepo = {
    findOne: async ({ where }: any) =>
      DEVISES.find((d) => (where.id ? d.id === where.id : d.code === where.code)) ?? null,
  };

  const trouverOuvert = (src: string, cib: string) =>
    periodes.find(
      (p) => p.deviseSourceId === src && p.deviseCibleId === cib && p.dateValiditeFin === null,
    ) ?? null;

  const repo: any = {
    findOne: async ({ where }: any) => {
      if (where.id) return periodes.find((p) => p.id === where.id) ?? null;
      return trouverOuvert(where.deviseSourceId, where.deviseCibleId);
    },
    find: async () => periodes.filter((p) => p.dateValiditeFin === null),
    create: (o: any) => ({ id: String(periodes.length + 100), ...o }),
    save: async (o: any) => {
      sauvegardes.push({ ...o });
      const i = periodes.findIndex((p) => p.id === o.id);
      if (i >= 0) periodes[i] = o;
      else periodes.push(o);
      return o;
    },
    softDelete: async (id: string) => {
      supprimes.push(id);
    },
    createQueryBuilder: () => {
      const qb: any = {
        where: () => qb,
        andWhere: () => qb,
        orderBy: () => qb,
        limit: () => qb,
        getOne: async () => qb.__resultat ?? null,
        getMany: async () => (qb.__resultat ? [qb.__resultat] : []),
        __resultat: null,
      };
      qb.__resultat = opts.precedentTrouve ?? null;
      return qb;
    },
  };

  const service = new TauxChangeService(
    repo,
    deviseRepo as any,
    { transaction: async (cb: any) => cb({ getRepository: () => repo }) } as any,
    {
      get: async (c: string) => params[c] ?? null,
      getNumber: async (c: string, d: number) => (params[c] !== undefined ? Number(params[c]) : d),
    } as any,
    { assertPermission: async () => undefined } as any,
  );

  return { service, periodes, sauvegardes, supprimes };
}

/* ========================================================================== */

describe('TauxChangeService — conversion', () => {
  it('convertit sans taux quand les deux devises sont la même', async () => {
    const { service } = monter();
    const c = await service.convertir('1500', XOF.id, XOF.id);
    expect(c.voie).toBe('IDENTITE');
    expect(c.taux).toBe('1');
    expect(c.montantConverti).toBe('1500');
  });

  it('applique le taux dans le sens direct : montant × taux', async () => {
    const { service } = monter();
    jest.spyOn(service, 'tauxA').mockImplementation(async (src) =>
      src === EUR.id ? periode() : null,
    );
    const c = await service.convertir('100', EUR.id, XOF.id);
    expect(c.voie).toBe('DIRECT');
    expect(c.montantConverti).toBe('65596'); // 65 595,7 arrondi : le XOF n'a pas de décimale
  });

  it('DIVISE quand seul le couple opposé est tenu', async () => {
    const { service } = monter();
    jest.spyOn(service, 'tauxA').mockImplementation(async (src, cib) =>
      src === EUR.id && cib === XOF.id ? periode() : null,
    );
    const c = await service.convertir('655957', XOF.id, EUR.id);
    expect(c.voie).toBe('INVERSE');
    expect(c.montantConverti).toBe('1000.00');
  });

  it('arrondit aux décimales de la devise d’ARRIVÉE, pas de celle de départ', async () => {
    const { service } = monter();
    jest.spyOn(service, 'tauxA').mockImplementation(async (src, cib) =>
      src === EUR.id && cib === XOF.id ? periode() : null,
    );
    // Vers le XOF (0 décimale) : aucun centime de franc ne doit apparaître.
    expect((await service.convertir('1', EUR.id, XOF.id)).montantConverti).toBe('656');
    // Vers l'EUR (2 décimales) : deux chiffres, toujours.
    expect((await service.convertir('655957', XOF.id, EUR.id)).montantConverti).toBe('1000.00');
  });

  it('passe par la devise de référence quand aucun des deux sens n’est tenu', async () => {
    const { service } = monter();
    // EUR→XOF = 655,957 et USD→XOF = 600. Rien entre EUR et USD.
    jest.spyOn(service, 'tauxA').mockImplementation(async (src, cib) => {
      if (src === EUR.id && cib === XOF.id) return periode();
      if (src === USD.id && cib === XOF.id) {
        return periode({ id: '2', deviseSourceId: USD.id, taux: '600.00000000' });
      }
      return null;
    });
    const c = await service.convertir('100', EUR.id, USD.id);
    expect(c.voie).toBe('PIVOT');
    // 100 EUR × 655,957 = 65 595,7 XOF ; ÷ 600 = 109,33 USD
    expect(c.montantConverti).toBe('109.33');
  });

  // Bug constaté à l'essai le 11/08/2026 : la conversion EUR → USD se déclarait
  // PÉRIMÉE parce que son maillon EUR → XOF datait de 2013 — alors que c'est une
  // parité fixe, et que le maillon coté USD → XOF avait été importé le matin même.
  it('ne juge la fraîcheur d’un PIVOT que sur ses maillons COTÉS', async () => {
    const { service } = monter({ parametres: { TAUX_ALERTE_JOURS: '30' } });
    jest.spyOn(service, 'tauxA').mockImplementation(async (src, cib) => {
      if (src === EUR.id && cib === XOF.id) return periode({ pariteFixe: true }); // 2013, fixe
      if (src === USD.id && cib === XOF.id) {
        return periode({
          id: '2',
          deviseSourceId: USD.id,
          taux: '568.02863400',
          // Une seconde dans le passé, pas `new Date()` : le mock s'exécute
          // APRÈS que `convertir` a figé son horodatage, et un taux daté d'une
          // milliseconde plus tard rendrait le test dépendant de l'ordonnancement.
          dateValiditeDebut: new Date(Date.now() - 1000),
        });
      }
      return null;
    });

    const c = await service.convertir('100', EUR.id, USD.id);
    expect(c.voie).toBe('PIVOT');
    expect(c.perime).toBe(false);
    expect(c.ageJours).toBe(0); // l'âge affiché est celui du maillon coté
  });

  it('ne renvoie jamais un âge NÉGATIF, même pour un taux daté dans le futur', async () => {
    const { service } = monter();
    jest
      .spyOn(service, 'tauxA')
      .mockImplementation(async (src) =>
        src === EUR.id ? periode({ dateValiditeDebut: new Date(Date.now() + 60_000) }) : null,
      );
    const c = await service.convertir('100', EUR.id, XOF.id);
    expect(c.ageJours).toBe(0);
    expect(c.perime).toBe(false);
  });

  it('périme un PIVOT dès qu’UN seul maillon coté est trop vieux', async () => {
    const { service } = monter({ parametres: { TAUX_ALERTE_JOURS: '30' } });
    const vieux = new Date(Date.now() - 200 * 24 * 3600 * 1000);
    jest.spyOn(service, 'tauxA').mockImplementation(async (src, cib) => {
      if (src === EUR.id && cib === XOF.id) return periode({ pariteFixe: true });
      if (src === USD.id && cib === XOF.id) {
        return periode({ id: '2', deviseSourceId: USD.id, taux: '600', dateValiditeDebut: vieux });
      }
      return null;
    });

    const c = await service.convertir('100', EUR.id, USD.id);
    expect(c.perime).toBe(true);
  });

  it('refuse clairement quand aucune voie n’aboutit', async () => {
    const { service } = monter();
    jest.spyOn(service, 'tauxA').mockResolvedValue(null);
    await expect(service.convertir('100', EUR.id, USD.id)).rejects.toThrow(/Aucun taux de change/);
  });

  it('signale un taux périmé au-delà du seuil', async () => {
    const { service } = monter({ parametres: { TAUX_ALERTE_JOURS: '30' } });
    const vieux = new Date(Date.now() - 90 * 24 * 3600 * 1000);
    jest
      .spyOn(service, 'tauxA')
      .mockImplementation(async (src) =>
        src === USD.id ? periode({ deviseSourceId: USD.id, taux: '600', dateValiditeDebut: vieux }) : null,
      );
    const c = await service.convertir('10', USD.id, XOF.id);
    expect(c.ageJours).toBeGreaterThan(30);
    expect(c.perime).toBe(true);
  });

  it('ne périme JAMAIS une parité fixe, si ancienne soit-elle', async () => {
    const { service } = monter();
    jest.spyOn(service, 'tauxA').mockImplementation(async (src) =>
      src === EUR.id ? periode({ pariteFixe: true }) : null,
    );
    const c = await service.convertir('100', EUR.id, XOF.id);
    expect(c.ageJours).toBeGreaterThan(3000); // en vigueur depuis 2013
    expect(c.perime).toBe(false);
  });
});

/* ========================================================================== */

describe('TauxChangeService — écriture en historique', () => {
  const nouveau = { deviseSourceId: USD.id, deviseCibleId: XOF.id, taux: '568.02863400' };

  it('CLÔT le taux en vigueur au lieu de le modifier', async () => {
    const courant = periode({ id: '9', deviseSourceId: USD.id, taux: '600' });
    const { service, periodes } = monter({ periodes: [courant] });

    const debut = new Date('2026-08-11T00:00:00.000Z');
    await service.enregistrer({ ...nouveau, dateValiditeDebut: debut.toISOString() }, '10');

    // L'ancien garde sa valeur — seule sa date de fin est posée.
    expect(courant.taux).toBe('600');
    expect(courant.dateValiditeFin).toEqual(debut);
    // Et le nouveau est ouvert.
    const ouvert = periodes.filter((p) => p.dateValiditeFin === null);
    expect(ouvert).toHaveLength(1);
    expect(ouvert[0].taux).toBe('568.02863400');
  });

  it('refuse un couple identique en source et cible', async () => {
    const { service } = monter();
    await expect(
      service.enregistrer({ deviseSourceId: XOF.id, deviseCibleId: XOF.id, taux: '1' }, '10'),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuse le sens opposé quand un sens est déjà tenu', async () => {
    // XOF → USD est suivi ; on tente d'ajouter USD → XOF.
    const { service, periodes } = monter({
      periodes: [periode({ id: '9', deviseSourceId: XOF.id, deviseCibleId: USD.id, taux: '0.00176' })],
    });
    await expect(service.enregistrer(nouveau, '10')).rejects.toThrow(ConflictException);
    expect(periodes).toHaveLength(1); // rien n'a été écrit
  });

  it('refuse un taux qui démarrerait AVANT celui en vigueur', async () => {
    const courant = periode({
      id: '9',
      deviseSourceId: USD.id,
      dateValiditeDebut: new Date('2026-08-01T00:00:00.000Z'),
    });
    const { service } = monter({ periodes: [courant] });
    await expect(
      service.enregistrer({ ...nouveau, dateValiditeDebut: '2026-07-01T00:00:00.000Z' }, '10'),
    ).rejects.toThrow(/ne peut pas commencer avant/);
    expect(courant.dateValiditeFin).toBeNull();
  });

  it('interdit à un IMPORT d’écraser une parité fixe', async () => {
    const { service } = monter({
      periodes: [periode({ id: '9', deviseSourceId: USD.id, pariteFixe: true })],
    });
    await expect(service.ecrirePeriode({ ...nouveau, source: 'API' }, null)).rejects.toThrow(
      /parité fixe/,
    );
  });

  it('laisse un humain corriger une parité fixe', async () => {
    const { service, periodes } = monter({
      periodes: [periode({ id: '9', deviseSourceId: USD.id, pariteFixe: true })],
    });
    await service.enregistrer({ ...nouveau, source: 'MANUEL' }, '10');
    expect(periodes.filter((p) => p.dateValiditeFin === null)).toHaveLength(1);
  });

  it('transmet « parité fixe » d’une période à la suivante', async () => {
    const { service, periodes } = monter({
      periodes: [periode({ id: '9', deviseSourceId: USD.id, pariteFixe: true })],
    });
    await service.enregistrer(nouveau, '10');
    const ouvert = periodes.find((p) => p.dateValiditeFin === null);
    expect(ouvert.pariteFixe).toBe(true); // le drapeau appartient au COUPLE
  });

  it('marque la provenance API quand l’import écrit', async () => {
    const { service, periodes } = monter();
    await service.ecrirePeriode({ ...nouveau, source: 'API' }, null);
    expect(periodes[0].source).toBe('API');
  });
});

/* ========================================================================== */

describe('TauxChangeService — suppression', () => {
  /** Le précédent est le MÊME dans les deux cas : seule change la période retirée. */
  const precedentDe = () =>
    periode({
      id: '8',
      deviseSourceId: USD.id,
      taux: '600',
      dateValiditeDebut: new Date('2026-01-01T00:00:00.000Z'),
      dateValiditeFin: new Date('2026-08-11T00:00:00.000Z'),
    });

  it('REND SA PLACE au taux précédent, sinon le couple resterait sans taux', async () => {
    const precedent = precedentDe();
    const courant = periode({
      id: '9',
      deviseSourceId: USD.id,
      taux: '568',
      dateValiditeDebut: new Date('2026-08-11T00:00:00.000Z'),
      dateValiditeFin: null, // ← période OUVERTE
    });
    const { service, supprimes } = monter({
      periodes: [precedent, courant],
      precedentTrouve: precedent,
    });

    await service.supprimer('9', '10');

    expect(supprimes).toContain('9');
    expect(precedent.dateValiditeFin).toBeNull(); // rouvert
  });

  it('ne rouvre RIEN quand on retire une période déjà close', async () => {
    const precedent = precedentDe();
    const close = periode({
      id: '9',
      deviseSourceId: USD.id,
      dateValiditeDebut: new Date('2026-06-01T00:00:00.000Z'),
      dateValiditeFin: new Date('2026-08-01T00:00:00.000Z'), // ← période CLOSE
    });
    const { service, supprimes } = monter({
      periodes: [precedent, close],
      precedentTrouve: precedent,
    });

    await service.supprimer('9', '10');

    expect(supprimes).toContain('9');
    // Rouvrir ici créerait DEUX périodes ouvertes sur le couple — ce que
    // l'index unique UQ_fin_te_couple_ouvert refuserait de toute façon.
    expect(precedent.dateValiditeFin).not.toBeNull();
  });
});
