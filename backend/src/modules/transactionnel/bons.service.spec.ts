import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BonsService } from './bons.service';

/**
 * Cycle de vie du bon : CREE → VALIDE → (imprimé, signé) → DECAISSE → COMPTABILISE,
 * avec les sorties ANNULE / REFUSE.
 *
 * On couvre ici les règles qui protègent l'argent déjà sorti et la propriété du
 * bon : ce qu'on peut encore annuler ou modifier, et par qui. La création, le
 * décaissement et la comptabilisation ouvrent des transactions SQL — ils relèvent
 * de tests d'intégration, pas de l'unitaire.
 */
type Ctx = {
  bon: any;
  sousBons?: any[];
  /** Permissions détenues (les admins sont simulés via isAdmin). */
  perms?: string[];
  isAdmin?: boolean;
  /** Rôles bruts, utilisés par la garde de modification (VALIDATEUR y a droit). */
  roles?: string[];
};

function build({ bon, sousBons = [], perms = [], isAdmin = false, roles = [] }: Ctx) {
  const savedBons: any[] = [];
  const savedSousBons: any[] = [];

  const bonRepo = {
    findOne: jest.fn(async () => bon),
    save: jest.fn(async (b: any) => {
      savedBons.push({ ...b });
      return b;
    }),
  };
  const sousBonRepo = {
    find: jest.fn(async () => sousBons),
    findOne: jest.fn(async () => sousBons[0] ?? null),
    save: jest.fn(async (sb: any) => {
      savedSousBons.push({ ...sb });
      return sb;
    }),
  };
  const authz = {
    isAdmin: jest.fn(async () => isAdmin),
    getUserRoleCodes: jest.fn(async () => new Set(roles)),
    isAdminCodes: jest.fn(() => isAdmin),
    hasPermission: jest.fn(async (_u: string, c: string) => perms.includes(c)),
    assertPermission: jest.fn(async (_u: string, code: string, action: string) => {
      if (isAdmin || perms.includes(code)) return;
      throw new ForbiddenException(`Action non autorisée (${action}). Permission requise : ${code}.`);
    }),
  };
  // La transaction exécute simplement le callback avec un manager qui rend nos repos.
  const dataSource = {
    transaction: jest.fn(async (cb: any) =>
      cb({
        getRepository: jest.fn((e: any) => (e?.name === 'SousBon' ? sousBonRepo : bonRepo)),
      }),
    ),
    getRepository: jest.fn(() => bonRepo),
  };

  const repoVide = () =>
    ({
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => null),
      save: jest.fn(async (x: any) => x),
    }) as any;

  // Ordre du constructeur : bon, sousBon, validation, impression, bonCaisse,
  // decaissement, operation, ecriture, dataSource, authz, ledger, push.
  const service = new BonsService(
    bonRepo as any,
    sousBonRepo as any,
    repoVide(),
    repoVide(),
    repoVide(),
    repoVide(),
    repoVide(),
    repoVide(),
    dataSource as any,
    authz as any,
    {} as any,
    { notifyValidateursNewBon: jest.fn(async () => undefined) } as any,
  );
  return { service, authz, savedBons, savedSousBons, bonRepo };
}

/** Bon type, demandé par l'utilisateur 100. */
const bon = (statut: string, demandeurId = '100', extra: any = {}) => ({
  id: '1',
  numero: 'BON-0001',
  statut,
  demandeurId,
  statutExtension: 'NON',
  ...extra,
});

describe('BonsService.cancelBon — ce qui ne peut plus être annulé', () => {
  it("refuse d'annuler un bon DÉCAISSÉ ou COMPTABILISÉ (l'argent est sorti)", async () => {
    for (const s of ['DECAISSE', 'COMPTABILISE']) {
      const { service } = build({ bon: bon(s), isAdmin: true });
      await expect(service.cancelBon('1', '100')).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it("refuse d'annuler un bon déjà ANNULÉ", async () => {
    const { service } = build({ bon: bon('ANNULE'), isAdmin: true });
    await expect(service.cancelBon('1', '100')).rejects.toThrow(/Impossible d'annuler/i);
  });
});

describe('BonsService.cancelBon — qui peut annuler', () => {
  it('laisse le demandeur annuler SON bon encore au statut CREE, sans permission', async () => {
    const { service, savedBons } = build({ bon: bon('CREE', '100') });
    await service.cancelBon('1', '100');
    expect(savedBons.at(-1).statut).toBe('ANNULE');
  });

  it("exige BON_ANNULER pour annuler le bon d'un AUTRE utilisateur", async () => {
    const { service } = build({ bon: bon('CREE', '100') });
    await expect(service.cancelBon('1', '999')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepte avec BON_ANNULER pour le bon d’autrui', async () => {
    const { service, savedBons } = build({ bon: bon('CREE', '100'), perms: ['BON_ANNULER'] });
    await service.cancelBon('1', '999');
    expect(savedBons.at(-1).statut).toBe('ANNULE');
  });

  it('exige BON_ANNULER_VALIDE pour annuler SON PROPRE bon une fois VALIDÉ', async () => {
    // Le demandeur perd la main sur son bon dès qu'il est validé : c'est le point
    // de bascule où le circuit d'engagement a commencé.
    const { service } = build({ bon: bon('VALIDE', '100') });
    await expect(service.cancelBon('1', '100')).rejects.toThrow(/BON_ANNULER_VALIDE/);
  });

  it('accepte avec BON_ANNULER_VALIDE sur son propre bon validé', async () => {
    const { service, savedBons } = build({
      bon: bon('VALIDE', '100'),
      perms: ['BON_ANNULER_VALIDE'],
    });
    await service.cancelBon('1', '100');
    expect(savedBons.at(-1).statut).toBe('ANNULE');
  });

  it("exige les DEUX permissions pour annuler le bon VALIDÉ d'un autre", async () => {
    const seulementValide = build({ bon: bon('VALIDE', '100'), perms: ['BON_ANNULER_VALIDE'] });
    await expect(seulementValide.service.cancelBon('1', '999')).rejects.toThrow(/BON_ANNULER/);

    const lesDeux = build({
      bon: bon('VALIDE', '100'),
      perms: ['BON_ANNULER_VALIDE', 'BON_ANNULER'],
    });
    await expect(lesDeux.service.cancelBon('1', '999')).resolves.toBeDefined();
  });

  it('laisse passer un administrateur dans tous les cas', async () => {
    const { service, savedBons } = build({ bon: bon('VALIDE', '100'), isAdmin: true });
    await service.cancelBon('1', '999');
    expect(savedBons.at(-1).statut).toBe('ANNULE');
  });
});

describe('BonsService.cancelBon — annulation en cascade', () => {
  it('annule les sous-bons encore actifs', async () => {
    const { service, savedSousBons } = build({
      bon: bon('CREE', '100'),
      sousBons: [{ id: 'a', statut: 'CREE' }, { id: 'b', statut: 'VALIDE' }],
    });
    await service.cancelBon('1', '100');
    expect(savedSousBons.map((s) => s.statut)).toEqual(['ANNULE', 'ANNULE']);
  });

  it('laisse intacts les sous-bons déjà dans un état terminal', async () => {
    // Un sous-bon décaissé ne doit surtout pas repasser ANNULE : l'argent est sorti.
    const { service, savedSousBons } = build({
      bon: bon('CREE', '100'),
      sousBons: [
        { id: 'a', statut: 'DECAISSE' },
        { id: 'b', statut: 'COMPTABILISE' },
        { id: 'c', statut: 'ANNULE' },
        { id: 'd', statut: 'REFUSE' },
      ],
    });
    await service.cancelBon('1', '100');
    expect(savedSousBons).toHaveLength(0);
  });

  it('neutralise une demande d’extension encore en attente', async () => {
    const { service, savedBons } = build({
      bon: bon('CREE', '100', { statutExtension: 'EN_ATTENTE' }),
    });
    await service.cancelBon('1', '100');
    expect(savedBons.at(-1).statutExtension).toBe('NON');
  });

  it('ne touche pas à une extension déjà approuvée', async () => {
    const { service, savedBons } = build({
      bon: bon('CREE', '100', { statutExtension: 'APPROUVEE' }),
    });
    await service.cancelBon('1', '100');
    expect(savedBons.at(-1).statutExtension).toBe('APPROUVEE');
  });
});

describe('BonsService.updateBon — modification limitée au statut CREE', () => {
  it('modifie le porteur d’un bon au statut CREE', async () => {
    const { service, savedBons } = build({ bon: bon('CREE', '100'), perms: ['BON_MODIFIER_SPEC'] });
    await service.updateBon('1', '100', { porteur: '  Jean Koffi  ' } as any);
    expect(savedBons.at(-1).porteur).toBe('Jean Koffi');
  });

  it('vide le porteur quand on envoie une chaîne blanche', async () => {
    const { service, savedBons } = build({ bon: bon('CREE', '100'), perms: ['BON_MODIFIER_SPEC'] });
    await service.updateBon('1', '100', { porteur: '   ' } as any);
    expect(savedBons.at(-1).porteur).toBeNull();
  });

  it('refuse toute modification dès que le bon a quitté le statut CREE', async () => {
    for (const s of ['VALIDE', 'DECAISSE', 'COMPTABILISE', 'ANNULE', 'REFUSE']) {
      const { service } = build({ bon: bon(s, '100'), perms: ['BON_MODIFIER_SPEC'] });
      await expect(service.updateBon('1', '100', { porteur: 'X' } as any)).rejects.toThrow(
        /statut CREE/i,
      );
    }
  });
});
