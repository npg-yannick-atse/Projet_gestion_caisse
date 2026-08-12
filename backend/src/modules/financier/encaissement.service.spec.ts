import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EncaissementService } from './encaissement.service';

/**
 * Devise d'un encaissement.
 *
 * La caisse a une devise DÉCLARÉE, mais elle peut en détenir plusieurs — c'est
 * tout le sens du suivi multi-devises. L'encaissement forçait pourtant la
 * devise de la caisse : un règlement en dollars dans une caisse tenue en XOF
 * était enregistré en francs, et le solde par devise devenait faux.
 */
function monter(opts: { caisse?: any; devises?: any[]; reference?: any } = {}) {
  const caisse = opts.caisse ?? { id: '1', code: 'CI01', statut: 'OUVERTE', deviseId: '1' };
  // `nbDecimales` gouverne l'arrondi du montant crédité : XOF n'en a aucune,
  // l'EUR et l'USD en ont deux.
  const devises = opts.devises ?? [
    { id: '1', code: 'XOF', estActif: true, nbDecimales: 0 },
    { id: '2', code: 'EUR', estActif: true, nbDecimales: 2 },
    { id: '3', code: 'USD', estActif: true, nbDecimales: 2 },
    { id: '9', code: 'OLD', estActif: false, nbDecimales: 2 },
  ];

  const ecritures: any[] = [];
  const operations: any[] = [];
  const manager = {
    getRepository: (e: any) =>
      e?.name === 'Devise'
        ? { findOne: async ({ where }: any) => devises.find((d) => String(d.id) === String(where.id)) ?? null }
        : { findOne: async () => caisse },
  };
  const ledger = {
    createOperation: async (input: any) => {
      operations.push(input);
      return { transactionUuid: 'uuid-1' };
    },
    createPairedEcritures: async (debit: any, credit: any, montant: string) => {
      ecritures.push({ debit, credit, montant });
      return [{}, {}];
    },
  };
  const reference = opts.reference ?? { id: '1', code: 'XOF', nbDecimales: 0 };
  const service = new EncaissementService(
    { transaction: async (cb: any) => cb(manager) } as any,
    ledger as any,
    {
      assertPermission: async () => undefined,
      assertCaisseInPerimeter: async () => undefined,
    } as any,
    { deviseReference: async () => reference } as any,
  );
  return { service, ecritures, operations };
}

const base = { caisseId: '1', montant: '100000', userId: '10' };

describe('EncaissementService — devise reçue', () => {
  it('retient la devise de la caisse quand aucune n’est précisée', async () => {
    const { service, operations, ecritures } = monter();
    await service.encaisser({ ...base });
    expect(operations[0].deviseId).toBe('1');
    expect(ecritures[0].credit.deviseId).toBe('1');
  });

  it('garde la devise REÇUE sur l’opération, mais crédite la caisse dans la sienne', async () => {
    // Un client paie en dollars dans une caisse tenue en francs. Les devises
    // étrangères sont converties au guichet (décision du 12/08/2026) : le coffre
    // ne conserve pas de dollars.
    const { service, operations, ecritures } = monter();
    await service.encaisser({ ...base, montant: '1000', deviseId: '3', tauxApplique: '590' });
    expect(operations[0].deviseId).toBe('3'); // ce que le client a remis
    expect(ecritures[0].credit.deviseId).toBe('1'); // ce qui entre en caisse
    expect(ecritures[0].montant).toBe('590000');
  });

  it('applique la MÊME devise aux deux écritures de la partie double', async () => {
    // Sinon l'écriture de recette et celle de caisse ne s'équilibreraient plus
    // dans une même monnaie.
    const { service, ecritures } = monter();
    await service.encaisser({ ...base, deviseId: '3', tauxApplique: '590' });
    expect(ecritures[0].debit.deviseId).toBe(ecritures[0].credit.deviseId);
  });

  it('n’exige aucun taux quand l’argent est déjà dans la devise de la caisse', async () => {
    const { service, ecritures } = monter();
    await service.encaisser({ ...base, montant: '100000' });
    expect(ecritures[0].montant).toBe('100000');
  });

  it('refuse une devise inconnue au lieu de retomber sur celle de la caisse', async () => {
    // Retomber silencieusement enregistrerait le montant dans une autre monnaie
    // que celle réellement reçue.
    const { service } = monter();
    await expect(service.encaisser({ ...base, deviseId: '404' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuse une devise désactivée', async () => {
    const { service } = monter();
    await expect(service.encaisser({ ...base, deviseId: '9' })).rejects.toThrow(/désactivée/i);
  });

  it('refuse un montant nul ou négatif', async () => {
    const { service } = monter();
    for (const m of ['0', '-5000']) {
      await expect(service.encaisser({ ...base, montant: m })).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('refuse d’encaisser dans une caisse fermée', async () => {
    const { service } = monter({ caisse: { id: '1', code: 'CI01', statut: 'FERMEE', deviseId: '1' } });
    await expect(service.encaisser({ ...base })).rejects.toThrow(/fermée/i);
  });
});

/**
 * Le taux appliqué à l'opération (migration 0057).
 *
 * Distinct du cours du jour : deux encaissements du même jour peuvent porter
 * deux taux différents. Ce qui est enregistré ici est ce que le caissier a
 * VALIDÉ, pas une estimation — d'où le refus de combler les trous tout seul.
 */
describe('EncaissementService — taux appliqué', () => {
  it('fige le taux ET le montant crédité', async () => {
    const { service, operations } = monter();
    await service.encaisser({ ...base, montant: '1000', deviseId: '3', tauxApplique: '590' });
    expect(operations[0].tauxApplique).toBe('590');
    expect(operations[0].contreValeur).toBe('590000'); // XOF : 0 décimale
    expect(operations[0].deviseContreValeurId).toBe('1');
  });

  it('arrondit aux décimales de la devise CRÉDITÉE', async () => {
    const { service, operations, ecritures } = monter();
    await service.encaisser({ ...base, montant: '10', deviseId: '3', tauxApplique: '590.55' });
    expect(operations[0].contreValeur).toBe('5906'); // 5905,5 → pas de centime de franc
    expect(ecritures[0].montant).toBe('5906');
  });

  it('accepte deux taux DIFFÉRENTS pour deux encaissements identiques', async () => {
    // C'est toute la raison d'être de la colonne : le cours du jour n'a qu'une
    // valeur, la journée peut en connaître plusieurs.
    const { service, operations } = monter();
    await service.encaisser({ ...base, montant: '1000', deviseId: '3', tauxApplique: '590' });
    await service.encaisser({ ...base, montant: '1000', deviseId: '3', tauxApplique: '585' });
    expect(operations.map((o) => o.contreValeur)).toEqual(['590000', '585000']);
  });

  it('EXIGE un taux dès que la devise reçue diffère de celle de la caisse', async () => {
    // Sans lui, on ne saurait pas quoi créditer. Le refus nomme les deux devises.
    const { service, operations } = monter();
    await expect(service.encaisser({ ...base, deviseId: '3' })).rejects.toThrow(
      /taux appliqué pour convertir les USD en XOF/,
    );
    expect(operations).toHaveLength(0);
  });

  it('refuse un taux quand l’argent est déjà dans la devise de la caisse', async () => {
    const { service } = monter();
    await expect(
      service.encaisser({ ...base, deviseId: '1', tauxApplique: '590' }),
    ).rejects.toThrow(/déjà en XOF/);
  });

  it('refuse une conversion qui n’apporte rien en caisse', async () => {
    // 1 USD à 0,4 dans une caisse sans décimale : 0 XOF crédité. L'opération
    // serait vide de sens et fausserait le solde.
    const { service } = monter();
    await expect(
      service.encaisser({ ...base, montant: '1', deviseId: '3', tauxApplique: '0.4' }),
    ).rejects.toThrow(/vérifiez le montant et le taux/);
  });

  it('refuse un taux nul ou négatif', async () => {
    const { service } = monter();
    for (const t of ['0', '-590']) {
      await expect(
        service.encaisser({ ...base, deviseId: '3', tauxApplique: t }),
      ).rejects.toThrow(/supérieur à zéro/);
    }
  });
});
