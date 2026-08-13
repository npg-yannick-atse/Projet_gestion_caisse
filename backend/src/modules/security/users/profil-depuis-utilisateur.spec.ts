import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProfilsService } from './profils.service';

/**
 * Générer un profil à partir des droits de quelqu'un.
 *
 * Le piège : un utilisateur qui remplace un absent cumule ses droits ET ceux
 * qu'on lui a délégués. Photographier ce cumul figerait dans un profil des
 * permissions temporaires qui ne lui appartiennent pas — et les rendrait
 * attribuables à n'importe qui, définitivement. On ne recopie donc que ses
 * droits PROPRES.
 */
function monter(opts: { codes?: string[]; utilisateur?: any } = {}) {
  const appels: Array<{ userId: string; opts?: { inclureInterim?: boolean } }> = [];
  const service: any = Object.create(ProfilsService.prototype);

  const utilisateur =
    opts.utilisateur === undefined ? { id: '5', prenom: 'Awa', nom: 'Kone' } : opts.utilisateur;

  /**
   * Le gestionnaire sert à DEUX usages : retrouver l'utilisateur, et recopier
   * ses périmètres (centres de coût, natures, divisions — migration 0067).
   * `find` rend une liste vide : ces tests-là portent sur les permissions, les
   * périmètres ont leur propre suite.
   */
  service.profilRepo = {
    manager: {
      getRepository: () => ({
        findOne: async () => utilisateur,
        find: async () => [],
        create: (x: unknown) => x,
        save: async (x: unknown) => x,
      }),
    },
  };
  service.permissionRepo = {
    find: async () => (opts.codes ?? []).map((code, i) => ({ id: String(i + 1), code })),
  };
  service.createProfil = async (dto: any) => ({ id: '99', ...dto });
  service.assignPermissionToProfil = async () => undefined;

  const authz = {
    getEffectivePermissions: async (userId: string, o?: { inclureInterim?: boolean }) => {
      appels.push({ userId, opts: o });
      return new Set(opts.codes ?? []);
    },
  };
  return { service, authz, appels };
}

describe('Profil généré depuis un utilisateur', () => {
  it('EXCLUT les droits exercés au titre d’un intérim', async () => {
    // Le cœur de la règle : ce qu'on exerce pour un absent est temporaire.
    const { service, authz, appels } = monter({ codes: ['BON_CREER'] });
    await service.genererDepuisUtilisateur('5', 'P1', 'Profil 1', '9', authz);
    expect(appels[0].opts).toEqual({ inclureInterim: false });
  });

  it('recopie les permissions propres dans le nouveau profil', async () => {
    const assignees: string[] = [];
    const { service, authz } = monter({ codes: ['BON_CREER', 'BON_VALIDER'] });
    service.assignPermissionToProfil = async (_p: string, permissionId: string) => {
      assignees.push(permissionId);
    };
    await service.genererDepuisUtilisateur('5', 'P1', 'Profil 1', '9', authz);
    expect(assignees).toHaveLength(2);
  });

  it('nomme la personne dans la description du profil', async () => {
    const { service, authz } = monter({ codes: ['BON_CREER'] });
    const profil = await service.genererDepuisUtilisateur('5', 'P1', 'Profil 1', '9', authz);
    expect(profil.description).toMatch(/Awa Kone/);
  });

  it('refuse un utilisateur sans aucune permission propre', async () => {
    const { service, authz } = monter({ codes: [] });
    await expect(
      service.genererDepuisUtilisateur('5', 'P1', 'Profil 1', '9', authz),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('explique que l’intérim n’est pas repris quand il n’y a rien à copier', async () => {
    // Sans ça, un administrateur verrait « aucune permission » sur quelqu'un
    // qui en exerce visiblement, et croirait à un bug.
    const { service, authz } = monter({ codes: [] });
    await expect(service.genererDepuisUtilisateur('5', 'P1', 'Profil 1', '9', authz)).rejects.toThrow(
      /intérim ne sont pas repris/,
    );
  });

  it('refuse un utilisateur inconnu', async () => {
    const { service, authz } = monter({ utilisateur: null });
    await expect(
      service.genererDepuisUtilisateur('404', 'P1', 'Profil 1', '9', authz),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
