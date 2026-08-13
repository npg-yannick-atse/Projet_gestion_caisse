import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DevisesService } from './devises.service';

/**
 * Le référentiel des devises n'était pas modifiable : aucune route d'écriture
 * n'existait, et ajouter une monnaie exigeait un accès SQL en production.
 *
 * En ouvrant l'écriture, on ouvre aussi deux façons de casser l'historique :
 * changer le nombre de décimales d'une devise déjà utilisée, et désactiver une
 * devise sur laquelle des comptes s'appuient encore.
 */
function monter(
  opts: {
    devise?: any;
    codeExistant?: string | null;
    nbEcritures?: number;
    nbCaisses?: number;
    nbPortefeuilles?: number;
    reference?: string;
  } = {},
) {
  const devise = opts.devise ?? { id: '2', code: 'EUR', libelle: 'Euro', symbole: '€', nbDecimales: 2, estActif: true };
  const sauvegardes: any[] = [];

  const manager = {
    query: async (sql: string) => {
      if (sql.includes('trx_ecriture_comptable')) return [{ n: opts.nbEcritures ?? 0 }];
      if (sql.includes('fin_caisse')) return [{ n: opts.nbCaisses ?? 0 }];
      if (sql.includes('fin_portefeuille')) return [{ n: opts.nbPortefeuilles ?? 0 }];
      return [{ n: 0 }];
    },
  };

  const repo = {
    manager,
    findOne: async ({ where }: any) => {
      // Recherche par code = contrôle d'unicité à la création.
      if (where?.code !== undefined) {
        return opts.codeExistant === where.code ? { id: '9', code: where.code, libelle: 'Déjà là' } : null;
      }
      return String(where?.id) === String(devise.id) ? { ...devise } : null;
    },
    create: (x: any) => x,
    save: async (x: any) => {
      sauvegardes.push(x);
      return x;
    },
    find: async () => [devise],
  };

  const parametres = { get: async () => opts.reference ?? 'XOF' };
  const service = new DevisesService(repo as any, parametres as any);
  return { service, sauvegardes };
}

describe('DevisesService — création', () => {
  it('refuse un code déjà pris', async () => {
    const { service } = monter({ codeExistant: 'EUR' });
    await expect(service.create({ code: 'EUR', libelle: 'Euro bis' } as any)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('crée avec 2 décimales par défaut', async () => {
    const { service, sauvegardes } = monter();
    await service.create({ code: 'GHS', libelle: 'Cedi ghanéen' } as any);
    expect(sauvegardes[0]).toMatchObject({ code: 'GHS', nbDecimales: 2, estActif: true });
  });

  it('retient les décimales demandées — le franc n’en a aucune', async () => {
    const { service, sauvegardes } = monter();
    await service.create({ code: 'GNF', libelle: 'Franc guinéen', nbDecimales: 0 } as any);
    expect(sauvegardes[0].nbDecimales).toBe(0);
  });

  it('normalise un symbole absent en null plutôt qu’en chaîne vide', async () => {
    const { service, sauvegardes } = monter();
    await service.create({ code: 'GHS', libelle: 'Cedi' } as any);
    expect(sauvegardes[0].symbole).toBeNull();
  });
});

describe('DevisesService — décimales verrouillées', () => {
  it('refuse de changer les décimales dès qu’une écriture existe', async () => {
    // L'arrondi est FIGÉ dans chaque écriture : changer la règle après coup
    // rendrait les montants déjà enregistrés irreproductibles.
    const { service } = monter({ nbEcritures: 155 });
    await expect(service.update('2', { nbDecimales: 3 })).rejects.toThrow(/155 écriture/);
  });

  it('autorise le changement tant qu’aucune écriture n’existe', async () => {
    const { service, sauvegardes } = monter({ nbEcritures: 0 });
    await service.update('2', { nbDecimales: 0 });
    expect(sauvegardes[0].nbDecimales).toBe(0);
  });

  it('laisse passer une mise à jour qui REPASSE la même valeur', async () => {
    // Enregistrer le formulaire sans toucher aux décimales ne doit pas être
    // refusé sous prétexte que des écritures existent.
    const { service, sauvegardes } = monter({ nbEcritures: 155 });
    await service.update('2', { libelle: 'Euro', nbDecimales: 2 });
    expect(sauvegardes[0].libelle).toBe('Euro');
  });

  it('refuse une devise inconnue', async () => {
    const { service } = monter();
    await expect(service.update('404', { libelle: 'X' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('DevisesService — désactivation', () => {
  it('refuse de désactiver la devise de référence', async () => {
    // Toutes les conversions passent par elle : EUR → XOF → USD.
    const { service } = monter({
      devise: { id: '1', code: 'XOF', libelle: 'Franc CFA', nbDecimales: 0, estActif: true },
      reference: 'XOF',
    });
    await expect(service.update('1', { estActif: false })).rejects.toThrow(/devise de référence/);
  });

  it('refuse de désactiver une devise qu’une caisse déclare encore', async () => {
    const { service } = monter({ nbCaisses: 2 });
    await expect(service.update('2', { estActif: false })).rejects.toThrow(/2 caisse/);
  });

  it('refuse de désactiver une devise qu’un portefeuille déclare encore', async () => {
    const { service } = monter({ nbPortefeuilles: 3 });
    await expect(service.update('2', { estActif: false })).rejects.toThrow(/3 portefeuille/);
  });

  it('autorise la désactivation quand plus rien ne s’y appuie', async () => {
    const { service, sauvegardes } = monter();
    await service.update('2', { estActif: false });
    expect(sauvegardes[0].estActif).toBe(false);
  });

  it('n’oppose aucun garde-fou à la RÉACTIVATION', async () => {
    // Les contrôles ne valent que dans le sens de la désactivation : réactiver
    // ne casse rien, et c'est le geste de rattrapage.
    const { service, sauvegardes } = monter({
      devise: { id: '2', code: 'EUR', libelle: 'Euro', nbDecimales: 2, estActif: false },
      nbCaisses: 5,
    });
    await service.update('2', { estActif: true });
    expect(sauvegardes[0].estActif).toBe(true);
  });

  it('ne bloque pas une désactivation sur l’HISTORIQUE seul', async () => {
    // Des écritures passées n'empêchent pas de retirer une devise du service :
    // elles restent lisibles. Seuls les comptes ACTIFS bloquent.
    const { service, sauvegardes } = monter({ nbEcritures: 900 });
    await service.update('2', { estActif: false });
    expect(sauvegardes[0].estActif).toBe(false);
  });
});

describe('DevisesService — lecture', () => {
  it('n’inclut les devises désactivées que si on le demande', async () => {
    const appels: any[] = [];
    const repo = { manager: { query: async () => [{ n: 0 }] }, find: async (o: any) => (appels.push(o), []) };
    const service = new DevisesService(repo as any, { get: async () => 'XOF' } as any);
    await service.findAll();
    await service.findAll(true);
    expect(appels[0].where).toEqual({ estActif: true });
    expect(appels[1].where).toEqual({});
  });
});
