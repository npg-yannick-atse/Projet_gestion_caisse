import { BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';

/**
 * Clonage des droits d'un utilisateur vers un autre.
 *
 * Un profil ne peut pas transporter divisions, natures ni centres de coût : ces
 * périmètres vivent dans des tables attachées à la personne. D'où ce geste
 * utilisateur → utilisateur, qui REMPLACE le périmètre de la cible au lieu de
 * l'enrichir — « les mêmes accès que X » ne veut pas dire « les siens plus ceux
 * de X ». Un cumul laisserait des droits résiduels que personne ne retirerait.
 */
function monter(source: {
  roles?: string[];
  profils?: Array<{ profilId: string; dateDebut?: Date | null; dateFin?: Date | null }>;
  divisions?: string[];
  natures?: string[];
  costCenters?: string[];
  cibleRoles?: string[];
}) {
  const journal: string[] = [];
  const service: any = Object.create(UsersService.prototype);

  service.findOne = async () => ({ id: '1' });
  service.assignRole = async (_u: string, roleId: string) => journal.push(`role+${roleId}`);
  service.removeRole = async (_u: string, roleId: string) => journal.push(`role-${roleId}`);
  service.setDivisions = async (_u: string, ids: string[]) => journal.push(`div=${ids.join(',')}`);
  service.setNaturesOperation = async (_u: string, ids: string[]) => journal.push(`nat=${ids.join(',')}`);
  service.setCostCenters = async (_u: string, ids: string[]) => journal.push(`cc=${ids.join(',')}`);

  const profilsSauves: any[] = [];
  service.userRoleRepo = {
    find: async ({ where }: any) =>
      String(where.userId) === 'S'
        ? (source.roles ?? []).map((roleId) => ({ roleId }))
        : (source.cibleRoles ?? []).map((roleId) => ({ roleId })),
  };
  service.userProfilRepo = {
    find: async () => source.profils ?? [],
    delete: async () => journal.push('profils-vides'),
    create: (x: any) => x,
    save: async (x: any) => {
      profilsSauves.push(x);
      return x;
    },
  };
  service.userDivisionRepo = {
    find: async () => (source.divisions ?? []).map((divisionId) => ({ divisionId })),
  };
  service.userNatureRepo = {
    find: async () => (source.natures ?? []).map((natureOperationId) => ({ natureOperationId })),
  };
  service.userCostCenterRepo = {
    find: async () => (source.costCenters ?? []).map((costCenterId) => ({ costCenterId })),
  };

  return { service, journal, profilsSauves };
}

describe('Clonage des droits — périmètres', () => {
  it('recopie divisions, natures et centres de coût', async () => {
    const { service, journal } = monter({
      divisions: ['1', '2'],
      natures: ['7'],
      costCenters: ['3', '4'],
    });
    await service.clonerDroits('S', 'C', '9', null);
    expect(journal).toContain('div=1,2');
    expect(journal).toContain('nat=7');
    expect(journal).toContain('cc=3,4');
  });

  it('REMPLACE le périmètre de la cible même quand la source n’a rien', async () => {
    // Cloner quelqu'un sans divisions doit retirer celles de la cible, pas les
    // lui laisser : sinon le clone n'est pas un clone.
    const { service, journal } = monter({});
    await service.clonerDroits('S', 'C', '9', null);
    expect(journal).toContain('div=');
    expect(journal).toContain('nat=');
    expect(journal).toContain('cc=');
  });

  it('renvoie le décompte de ce qui a été recopié', async () => {
    const { service } = monter({ roles: ['1'], divisions: ['1', '2'], natures: ['7', '8', '9'] });
    const r = await service.clonerDroits('S', 'C', '9', null);
    expect(r).toMatchObject({ roles: 1, divisions: 2, natures: 3, costCenters: 0 });
  });
});

describe('Clonage des droits — rôles', () => {
  it('ajoute les rôles manquants et retire ceux en trop', async () => {
    const { service, journal } = monter({ roles: ['1', '2'], cibleRoles: ['2', '5'] });
    await service.clonerDroits('S', 'C', '9', null);
    expect(journal).toContain('role+1'); // manquait
    expect(journal).toContain('role-5'); // en trop
    expect(journal).not.toContain('role+2'); // déjà là, on n'y touche pas
  });

  it('passe par assignRole/removeRole pour que l’audit voie les changements', async () => {
    // Écrire en base directement priverait le journal des permissions des
    // lignes GAIN / PERTE dont l'audit a besoin.
    const { service, journal } = monter({ roles: ['1'], cibleRoles: [] });
    await service.clonerDroits('S', 'C', '9', null);
    expect(journal.some((e) => e.startsWith('role+'))).toBe(true);
  });
});

describe('Clonage des droits — profils', () => {
  it('reprend la période de validité de chaque profil', async () => {
    // Un profil prêté jusqu'au 31 doit l'être aussi chez la cible : sans les
    // dates, le clone hériterait d'un droit permanent.
    const fin = new Date('2026-12-31');
    const { service, profilsSauves } = monter({ profils: [{ profilId: '7', dateFin: fin }] });
    await service.clonerDroits('S', 'C', '9', null);
    expect(profilsSauves[0]).toMatchObject({ profilId: '7', dateFin: fin });
  });

  it('efface les profils de la cible avant de recopier', async () => {
    const { service, journal } = monter({ profils: [{ profilId: '7' }] });
    await service.clonerDroits('S', 'C', '9', null);
    expect(journal).toContain('profils-vides');
  });
});

describe('Clonage des droits — garde-fou', () => {
  it('refuse de cloner quelqu’un sur lui-même', async () => {
    const { service } = monter({});
    await expect(service.clonerDroits('S', 'S', '9', null)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
