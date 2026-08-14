import { BadRequestException } from '@nestjs/common';
import { BonsService } from './bons.service';

/**
 * Une nature comptable RESTREINT le centre de coût du sous-bon.
 *
 * Les deux champs se choisissaient séparément dans le formulaire, d'où des
 * couples contradictoires : la nature RECHARGE, rattachée au 22100-DSI, a été
 * enregistrée sur 22100 (BON-0028) puis sur 1-DBTSI (BON-0027).
 *
 * Depuis la migration 0066 une nature peut être rattachée à PLUSIEURS centres
 * de coût — un carburant s'impute à la logistique comme à la direction. La
 * règle « impose son centre » devient donc « n'autorise que les siens ». Une
 * nature n'ayant qu'un seul centre se comporte exactement comme avant : c'est
 * le seul choix possible, et le message reste celui de l'imposition.
 */
function monter(
  natures: Array<{ id: string; codeComptableSap: string }>,
  liens: Array<{ natureId: string; costCenterId: string }>,
) {
  const service = Object.create(BonsService.prototype) as BonsService;
  Object.assign(service, {
    authz: { assertPermission: jest.fn(async () => undefined) },
    enforceBonPerimeter: jest.fn(async () => undefined),
    dataSource: {
      getRepository: (e: any) =>
        e?.name === 'NatureComptable'
          ? { find: async () => natures }
          : { findOne: async () => null }, // TypeBon : pas de restitution client
      query: async (sql: string) =>
        sql.includes('ref_nature_comptable_cost_center') ? liens : [],
    },
  });
  return service;
}

const NATURES = [
  { id: '10', codeComptableSap: 'RECHARGE' },
  { id: '11', codeComptableSap: '62121000' },
  { id: '12', codeComptableSap: 'LIBRE' },
  { id: '13', codeComptableSap: 'CARBURANT' },
];

/** RECHARGE → 3 ; 62121000 → 7 ; LIBRE → aucun ; CARBURANT → 3 et 7. */
const LIENS = [
  { natureId: '10', costCenterId: '3' },
  { natureId: '11', costCenterId: '7' },
  { natureId: '13', costCenterId: '3' },
  { natureId: '13', costCenterId: '7' },
];

const sousBon = (natureComptableId: string, costCenterId: string) => ({
  libelle: 'Test',
  montant: '1000',
  natureComptableId,
  costCenterId,
  caisseId: '1',
  portefeuilleId: '2',
  deviseId: '1',
});

/** `createBon` échoue plus loin (transaction non simulée) : seul le contrôle nous intéresse. */
async function motifRefus(soubons: any[]): Promise<string | null> {
  const service = monter(NATURES, LIENS);
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

  it("n'impose rien quand la nature n'est rattachée à aucun centre", async () => {
    // La nature LIBRE n'a aucun lien : le centre de coût reste au choix.
    expect(await motifRefus([sousBon('12', '999')])).toBeNull();
  });

  it('contrôle chaque sous-bon indépendamment', async () => {
    expect(await motifRefus([sousBon('10', '3'), sousBon('11', '7')])).toBeNull();
  });
});

describe('createBon — nature rattachée à PLUSIEURS centres de coût', () => {
  it('accepte le premier des centres autorisés', async () => {
    expect(await motifRefus([sousBon('13', '3')])).toBeNull();
  });

  it('accepte le second, tout autant', async () => {
    // C'est toute la raison de la liaison multiple : aucun des deux n'est
    // « le bon », les deux le sont.
    expect(await motifRefus([sousBon('13', '7')])).toBeNull();
  });

  it('refuse un centre hors de la liste', async () => {
    expect(await motifRefus([sousBon('13', '999')])).toMatch(/n'en fait pas partie/);
  });

  it('annonce COMBIEN de centres sont autorisés', async () => {
    // Le message d'imposition n'a plus de sens à plusieurs : dire « impose son
    // centre de coût » enverrait chercher une valeur unique qui n'existe pas.
    const msg = await motifRefus([sousBon('13', '999')]);
    expect(msg).toMatch(/2 centres de coût/);
    expect(msg).not.toMatch(/impose son centre/);
  });
});
