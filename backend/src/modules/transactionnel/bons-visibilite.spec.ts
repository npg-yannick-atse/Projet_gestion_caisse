import { ForbiddenException } from '@nestjs/common';
import { BonsController } from './bons.controller';
import { BonsService } from './bons.service';

/**
 * Qui voit les bons d'autrui, et qui peut en modifier un.
 *
 * Ces deux règles lisaient le CODE du rôle, écrit en dur : un rôle créé depuis
 * l'écran n'y figurait jamais, et recevait donc le droit sans la vue. Elles
 * s'appuient désormais sur des permissions (migration 0066).
 *
 * Ce que ces tests protègent avant tout, c'est le REPLI : sans permission, on
 * ne voit que ses propres bons, quel que soit le `demandeurId` de l'URL. C'est
 * la seule chose qui empêche un demandeur de lire les bons de ses collègues
 * avec un curl.
 */

function controleur(opts: { admin?: boolean; permissions?: string[] } = {}) {
  const { admin = false, permissions = [] } = opts;
  const recu: Array<Record<string, unknown>> = [];

  const bonsService = {
    findAll: jest.fn(async (o: Record<string, unknown>) => {
      recu.push(o);
      return [];
    }),
    findOne: jest.fn(async () => ({ id: '5', demandeurId: '99' })),
  };
  const authz = {
    isAdmin: jest.fn(async () => admin),
    hasPermission: jest.fn(async (_u: string, code: string) => permissions.includes(code)),
  };
  const controller = new BonsController(bonsService as unknown as BonsService, authz as any);
  return { controller, recu, authz, bonsService };
}

const MOI = '10';
const AUTRE = '77';
const user = { sub: MOI } as any;

describe('Voir les bons d’autrui', () => {
  it('sans BON_VOIR_TOUS, la liste est ramenée à SES bons', async () => {
    const { controller, recu } = controleur();
    await controller.findAll(user, undefined, undefined, undefined, AUTRE);
    expect(recu[0].demandeurId).toBe(MOI);
  });

  it('avec BON_VOIR_TOUS, le demandeur demandé est respecté', async () => {
    const { controller, recu } = controleur({ permissions: ['BON_VOIR_TOUS'] });
    await controller.findAll(user, undefined, undefined, undefined, AUTRE);
    expect(recu[0].demandeurId).toBe(AUTRE);
  });

  it('un administrateur passe sans détenir la permission', async () => {
    const { controller, recu } = controleur({ admin: true });
    await controller.findAll(user, undefined, undefined, undefined, AUTRE);
    expect(recu[0].demandeurId).toBe(AUTRE);
  });

  it('la permission suffit : aucun code de rôle n’est consulté', async () => {
    // C'est tout l'objet du changement — un rôle créé sur mesure doit pouvoir
    // porter ce droit sans que son code soit connu du programme.
    const { controller, authz } = controleur({ permissions: ['BON_VOIR_TOUS'] });
    await controller.findAll(user, undefined, undefined, undefined, AUTRE);
    expect(authz.hasPermission).toHaveBeenCalledWith(MOI, 'BON_VOIR_TOUS');
  });

  it('sans demandeur demandé, la liste reste bornée à soi', async () => {
    const { controller, recu } = controleur();
    await controller.findAll(user);
    expect(recu[0].demandeurId).toBe(MOI);
  });
});

describe('Lire le bon d’un autre', () => {
  it('refuse sans aucun droit', async () => {
    const { controller } = controleur();
    await expect(controller.findOne('5', user)).rejects.toThrow(ForbiddenException);
  });

  it('accepte avec BON_VOIR_TOUS', async () => {
    const { controller } = controleur({ permissions: ['BON_VOIR_TOUS'] });
    await expect(controller.findOne('5', user)).resolves.toBeDefined();
  });

  it('accepte aussi celui qui peut valider ou décaisser', async () => {
    // Il doit lire le bon pour agir dessus, même sans droit de tout voir.
    for (const p of ['BON_VALIDER', 'BON_DECAISSER']) {
      const { controller } = controleur({ permissions: [p] });
      await expect(controller.findOne('5', user)).resolves.toBeDefined();
    }
  });

  it('laisse toujours lire SON propre bon', async () => {
    const { controller, bonsService } = controleur();
    bonsService.findOne = jest.fn(async () => ({ id: '5', demandeurId: MOI })) as never;
    await expect(controller.findOne('5', user)).resolves.toBeDefined();
  });
});

describe('Filtre « bons que j’ai traités »', () => {
  it('sans droit, on est ramené à SES propres décisions', async () => {
    const { controller, recu } = controleur();
    await controller.findAll(user, undefined, undefined, undefined, undefined, AUTRE);
    expect(recu[0].validateurId).toBe(MOI);
  });

  it('avec BON_VOIR_TOUS, on lit celles d’un autre', async () => {
    const { controller, recu } = controleur({ permissions: ['BON_VOIR_TOUS'] });
    await controller.findAll(user, undefined, undefined, undefined, undefined, AUTRE);
    expect(recu[0].validateurId).toBe(AUTRE);
  });

  it('sans paramètre, aucun filtre de validateur n’est posé', async () => {
    const { controller, recu } = controleur({ permissions: ['BON_VOIR_TOUS'] });
    await controller.findAll(user);
    expect(recu[0].validateurId).toBeUndefined();
  });
});
