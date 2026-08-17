import { AuthorizationService } from './authorization.service';

/**
 * Le périmètre des natures CUMULE trois sources.
 *
 * Natures personnelles, natures des profils, et natures rattachées aux CENTRES
 * DE COÛT de l'utilisateur. Cette dernière manquait : une liaison
 * nature ↔ centre de coût ne faisait que RESTREINDRE — elle disait quel centre
 * une nature accepte, sans jamais donner accès à la nature elle-même. Il
 * fallait donc tout attribuer deux fois.
 */
function monter({ perso = [], parCc = [] }: { perso?: string[]; parCc?: string[] } = {}) {
  const service = new AuthorizationService(
    {
      getRepository: jest.fn(() => ({
        find: jest.fn(async () => perso.map((id) => ({ natureComptableId: id }))),
      })),
      query: jest.fn(async () => parCc.map((id) => ({ natureId: id }))),
    } as any,
  ) as any;
  service.isAdmin = jest.fn(async () => false);
  service.getProfilIds = jest.fn(async () => []);
  service.viaProfils = jest.fn(async () => []);
  return service;
}

describe('périmètre des natures comptables', () => {
  it('additionne les natures personnelles et celles des centres de coût', async () => {
    const service = monter({ perso: ['1', '2'], parCc: ['3', '4'] });

    const perim = await service.getNatureComptablePerimeter('4');

    expect([...perim].sort()).toEqual(['1', '2', '3', '4']);
  });

  it('ne compte pas deux fois une nature présente des deux côtés', async () => {
    const service = monter({ perso: ['1', '2'], parCc: ['2', '3'] });

    const perim = await service.getNatureComptablePerimeter('4');

    expect([...perim].sort()).toEqual(['1', '2', '3']);
  });

  it('accorde les natures du centre de coût même sans aucune nature personnelle', async () => {
    // Le cas qui bloquait : périmètre vide = plus aucun bon créable.
    const service = monter({ perso: [], parCc: ['7'] });

    const perim = await service.getNatureComptablePerimeter('4');

    expect([...perim]).toEqual(['7']);
  });

  it("reste vide quand rien n'est accordé nulle part", async () => {
    const service = monter();

    expect((await service.getNatureComptablePerimeter('4')).size).toBe(0);
  });
});
