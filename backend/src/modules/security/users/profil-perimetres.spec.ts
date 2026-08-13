import { ProfilsService } from './profils.service';

/**
 * Un profil porte désormais des PÉRIMÈTRES (migration 0067) : centres de coût,
 * natures d'opération et divisions, en plus de ses permissions.
 *
 * C'est ce qui rend un profil suffisant pour transmettre les droits d'une
 * personne à une autre. Sans les périmètres, le profil donnait le droit d'agir
 * sans dire sur quoi : un demandeur cloné pouvait créer un bon en théorie, et
 * se voyait refuser chaque nature d'opération en pratique.
 */

/** Ce que la copie a écrit, table par table. */
type Ecrit = { table: string; ligne: Record<string, unknown> };

function service(perimetres: {
  costCenters?: string[];
  natures?: string[];
  divisions?: string[];
}) {
  const ecrits: Ecrit[] = [];
  const svc: any = Object.create(ProfilsService.prototype);

  const contenu: Record<string, Array<Record<string, unknown>>> = {
    UserCostCenter: (perimetres.costCenters ?? []).map((id) => ({ userId: '5', costCenterId: id })),
    UserNatureOperation: (perimetres.natures ?? []).map((id) => ({
      userId: '5',
      natureOperationId: id,
    })),
    UserDivisionAccess: (perimetres.divisions ?? []).map((id) => ({ userId: '5', divisionId: id })),
  };

  svc.profilRepo = {
    manager: {
      getRepository: (entite: { name: string }) => ({
        findOne: async () => ({ id: '5', prenom: 'Awa', nom: 'Kone' }),
        find: async () => contenu[entite.name] ?? [],
        create: (x: Record<string, unknown>) => x,
        save: async (x: Record<string, unknown>) => {
          ecrits.push({ table: entite.name, ligne: x });
          return x;
        },
      }),
    },
  };
  svc.permissionRepo = { find: async () => [{ id: '1', code: 'BON_CREER' }] };
  svc.createProfil = async (dto: Record<string, unknown>) => ({ id: '99', ...dto });
  svc.assignPermissionToProfil = async () => undefined;

  const authz = { getEffectivePermissions: async () => new Set(['BON_CREER']) };
  return { svc: svc as ProfilsService, ecrits, authz };
}

const generer = (s: ReturnType<typeof service>) =>
  (s.svc as any).genererDepuisUtilisateur('5', 'P1', 'Profil 1', '1', s.authz);

describe('Périmètres recopiés dans le profil', () => {
  it('recopie les centres de coût', async () => {
    const s = service({ costCenters: ['7', '8'] });
    await generer(s);
    const lignes = s.ecrits.filter((e) => e.table === 'ProfilCostCenter');
    expect(lignes.map((l) => l.ligne.costCenterId)).toEqual(['7', '8']);
  });

  it('recopie les natures d’opération', async () => {
    const s = service({ natures: ['12'] });
    await generer(s);
    const lignes = s.ecrits.filter((e) => e.table === 'ProfilNatureOperation');
    expect(lignes.map((l) => l.ligne.natureOperationId)).toEqual(['12']);
  });

  it('recopie les divisions', async () => {
    const s = service({ divisions: ['3', '4'] });
    await generer(s);
    const lignes = s.ecrits.filter((e) => e.table === 'ProfilDivisionAccess');
    expect(lignes.map((l) => l.ligne.divisionId)).toEqual(['3', '4']);
  });

  it('rattache chaque ligne au profil créé, pas à l’utilisateur', async () => {
    const s = service({ costCenters: ['7'], natures: ['12'], divisions: ['3'] });
    await generer(s);
    for (const e of s.ecrits) {
      expect(e.ligne.profilId).toBe('99');
      expect(e.ligne.userId).toBeUndefined();
    }
  });

  it('n’écrit rien quand la personne n’a aucun périmètre', async () => {
    const s = service({});
    await generer(s);
    expect(s.ecrits).toHaveLength(0);
  });

  it('traite les trois périmètres d’un seul geste', async () => {
    const s = service({ costCenters: ['7'], natures: ['12'], divisions: ['3'] });
    await generer(s);
    expect(new Set(s.ecrits.map((e) => e.table))).toEqual(
      new Set(['ProfilCostCenter', 'ProfilNatureOperation', 'ProfilDivisionAccess']),
    );
  });
});
