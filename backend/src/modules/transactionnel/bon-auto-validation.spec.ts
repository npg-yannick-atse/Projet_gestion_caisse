import { ForbiddenException } from '@nestjs/common';
import { BonsService } from './bons.service';

/**
 * Un validateur peut valider SON PROPRE bon (décision métier du 17/08/2026).
 *
 * La règle inverse existait — celui qui demande ne doit pas approuver — et elle
 * a été levée : NPG ne compte que deux validateurs, et un bon restait bloqué
 * dès que son demandeur était le seul disponible dans sa direction.
 *
 * Ce test existe pour que la règle ne revienne pas par inadvertance. Elle est
 * le genre de contrôle qu'on rétablit « par prudence » sans savoir qu'il a été
 * retiré exprès.
 */
function monter({ demandeurId, validateurId, perms = ['BON_VALIDER'], isAdmin = false }: {
  demandeurId: string;
  validateurId: string;
  perms?: string[];
  isAdmin?: boolean;
}) {
  const bon = { id: '1', numero: 'BON-0002', statut: 'CREE', demandeurId, statutExtension: 'NON' };
  const validations: any[] = [];

  const bonRepo = { findOne: jest.fn(async () => bon), save: jest.fn(async (b: any) => b) };
  const validationRepo = {
    create: jest.fn((v: any) => v),
    save: jest.fn(async (v: any) => {
      validations.push(v);
      return { id: '1', ...v };
    }),
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
  };
  /** Constructeur de requête chaînable : `.update().set().where().execute()`. */
  const builder = () => {
    const b: any = {};
    for (const m of ['update', 'set', 'where', 'andWhere']) b[m] = jest.fn(() => b);
    b.execute = jest.fn(async () => ({ affected: 1 }));
    return b;
  };
  const vide = () =>
    ({
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => null),
      save: jest.fn(async (x: any) => x),
      createQueryBuilder: jest.fn(() => builder()),
    }) as any;

  const authz = {
    isAdmin: jest.fn(async () => isAdmin),
    assertPermission: jest.fn(async (_u: string, code: string, action: string) => {
      if (isAdmin || perms.includes(code)) return;
      throw new ForbiddenException(`Action non autorisée (${action}). Permission requise : ${code}.`);
    }),
  };

  const dataSource = {
    // Ni demandeur ni validateur n'ont de direction : la règle de direction
    // s'efface alors d'elle-même, et le test ne parle que de l'auto-validation.
    getRepository: jest.fn(() => ({ findOne: jest.fn(async () => ({ directionId: null })) })),
    transaction: jest.fn(async (cb: any) => cb({ getRepository: jest.fn(() => bonRepo) })),
  };

  const service = new BonsService(
    bonRepo as any, vide(), validationRepo as any, vide(), vide(), vide(), vide(), vide(),
    dataSource as any, authz as any, {} as any,
    { notifyValidateursNewBon: jest.fn(async () => undefined), notifyBonValide: jest.fn(async () => undefined) } as any,
  );

  return { service, validations, bon };
}

describe('valider son propre bon', () => {
  it('est autorisé au porteur de BON_VALIDER, même sans être administrateur', async () => {
    // Lorène : demandeuse ET validatrice du même bon. Le cas qui bloquait.
    const { service, validations } = monter({ demandeurId: '4', validateurId: '4' });

    await service.validateBon('1', '4', true, 'RAS');

    expect(validations).toHaveLength(1);
    expect(validations[0]).toMatchObject({ validateurId: '4', action: 'VALIDE' });
  });

  it('laisse une trace exploitable : le validateur est le demandeur', async () => {
    const { service, validations } = monter({ demandeurId: '4', validateurId: '4' });

    await service.validateBon('1', '4', true);

    // C'est ce qui remplace le blocage : on ne l'empêche plus, on le retrouve.
    expect(String(validations[0].validateurId)).toBe('4');
  });

  it('exige toujours la permission : le rôle seul ne suffit pas', async () => {
    const { service } = monter({ demandeurId: '4', validateurId: '4', perms: [] });

    await expect(service.validateBon('1', '4', true)).rejects.toThrow(ForbiddenException);
  });
});
