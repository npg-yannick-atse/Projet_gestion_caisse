import { BadRequestException } from '@nestjs/common';
import { BonsService } from './bons.service';

/**
 * Une nature d'opération IMPOSE son centre de coût.
 *
 * Les deux champs se choisissaient séparément dans le formulaire, d'où des
 * couples contradictoires : la nature RECHARGE, rattachée au 22100-DSI, a été
 * enregistrée sur 22100 (BON-0028) puis sur 1-DBTSI (BON-0027).
 *
 * En pratique la règle est systématique : sur les 2 natures réellement assignées
 * aux utilisateurs, les 2 portent un centre de coût. L'écran verrouille le champ ;
 * ce contrôle ferme la porte côté API.
 */
function monter(natures: Array<{ id: string; code: string; costCenterId: string | null }>) {
  const service = Object.create(BonsService.prototype) as BonsService;
  Object.assign(service, {
    authz: { assertPermission: jest.fn(async () => undefined) },
    enforceBonPerimeter: jest.fn(async () => undefined),
    dataSource: {
      getRepository: (e: any) =>
        e?.name === 'NatureOperation'
          ? { find: async () => natures }
          : { findOne: async () => null }, // TypeBon : pas de restitution client
    },
  });
  return service;
}

const NATURES = [
  { id: '10', code: 'RECHARGE', costCenterId: '3' },
  { id: '11', code: '62121000', costCenterId: '7' },
  { id: '12', code: 'LIBRE', costCenterId: null },
];

const sousBon = (natureOperationId: string, costCenterId: string) => ({
  libelle: 'Test',
  montant: '1000',
  natureOperationId,
  costCenterId,
  caisseId: '1',
  portefeuilleId: '2',
  deviseId: '1',
});

/** `createBon` échoue plus loin (transaction non simulée) : seul le contrôle nous intéresse. */
async function motifRefus(soubons: any[]): Promise<string | null> {
  const service = monter(NATURES);
  try {
    await (service as any).createBon({ typeBonId: '1', soubons }, '10');
    return null;
  } catch (e) {
    return e instanceof BadRequestException ? (e.message as string) : null;
  }
}

describe('createBon — cohérence nature ↔ centre de coût', () => {
  it('refuse un centre de coût qui contredit la nature', async () => {
    // Le cas BON-0027 : RECHARGE (22100-DSI, id 3) enregistrée sur 1-DBTSI (id 7).
    expect(await motifRefus([sousBon('10', '7')])).toMatch(/impose son centre de coût/);
  });

  it('nomme la nature fautive et le rang du sous-bon', async () => {
    const msg = await motifRefus([sousBon('10', '3'), sousBon('11', '3')]);
    expect(msg).toMatch(/Sous-bon 2/);
    expect(msg).toMatch(/62121000/);
  });

  it('laisse passer le couple cohérent', async () => {
    expect(await motifRefus([sousBon('10', '3')])).toBeNull();
  });

  it("n'impose rien quand la nature n'a pas de centre de coût", async () => {
    // La nature LIBRE n'en porte pas : le centre de coût reste au choix.
    expect(await motifRefus([sousBon('12', '999')])).toBeNull();
  });

  it('contrôle chaque sous-bon indépendamment', async () => {
    expect(await motifRefus([sousBon('10', '3'), sousBon('11', '7')])).toBeNull();
  });
});
