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
function monter(opts: { caisse?: any; devises?: any[] } = {}) {
  const caisse = opts.caisse ?? { id: '1', code: 'CI01', statut: 'OUVERTE', deviseId: '1' };
  const devises = opts.devises ?? [
    { id: '1', code: 'XOF', estActif: true },
    { id: '3', code: 'USD', estActif: true },
    { id: '9', code: 'OLD', estActif: false },
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
    createPairedEcritures: async (debit: any, credit: any) => {
      ecritures.push({ debit, credit });
      return [{}, {}];
    },
  };
  const service = new EncaissementService(
    { transaction: async (cb: any) => cb(manager) } as any,
    ledger as any,
    {
      assertPermission: async () => undefined,
      assertCaisseInPerimeter: async () => undefined,
    } as any,
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

  it('retient la devise DEMANDÉE quand elle diffère de celle de la caisse', async () => {
    // Un client paie en dollars dans une caisse tenue en francs.
    const { service, operations, ecritures } = monter();
    await service.encaisser({ ...base, deviseId: '3' });
    expect(operations[0].deviseId).toBe('3');
    expect(ecritures[0].debit.deviseId).toBe('3');
    expect(ecritures[0].credit.deviseId).toBe('3');
  });

  it('applique la MÊME devise aux deux écritures de la partie double', async () => {
    // Sinon l'écriture de recette et celle de caisse ne s'équilibreraient plus
    // dans une même monnaie.
    const { service, ecritures } = monter();
    await service.encaisser({ ...base, deviseId: '3' });
    expect(ecritures[0].debit.deviseId).toBe(ecritures[0].credit.deviseId);
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
