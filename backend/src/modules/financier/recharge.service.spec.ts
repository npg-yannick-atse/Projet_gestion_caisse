import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RechargeService } from './recharge.service';

/**
 * Ce que RechargeService garde en propre : les autorisations, les gardes de
 * cohérence (caisse ouverte, portefeuille rattaché) et le plafond du sens
 * inverse, qui s'appuie sur `soldeInitial` — une notion du portefeuille,
 * étrangère au grand livre.
 *
 * La règle de devise et la solvabilité de la caisse ne sont PLUS ici : elles
 * vivent dans `LedgerService.mouvementCaissePortefeuille`, point de passage
 * commun aux trois chemins (recharge, extension de bon, budget mensuel), et
 * sont testées dans `ledger-mouvement.spec.ts`.
 */
function monter(opts: {
  caisse?: any;
  portefeuille?: any;
  /** Simule un portefeuille absent — `portefeuille: null` retomberait sur le défaut. */
  portefeuilleAbsent?: boolean;
  soldePortefeuille?: string;
} = {}) {
  const caisse = opts.caisse ?? { id: '1', code: 'CI02', statut: 'OUVERTE', deviseId: '1' };
  const portefeuille = opts.portefeuilleAbsent
    ? null
    : (opts.portefeuille ?? { id: '7', code: 'TEST', caisseSourceId: '1', deviseId: '3', soldeInitial: '0' });

  const mouvements: any[] = [];
  const manager = {
    getRepository: (e: any) =>
      e?.name === 'Portefeuille' ? { findOne: async () => portefeuille } : { findOne: async () => caisse },
  };
  const ledger = {
    calculateBalance: async () => opts.soldePortefeuille ?? '0',
    mouvementCaissePortefeuille: async (input: any) => {
      mouvements.push(input);
      return { operation: { transactionUuid: 'uuid-1' }, ecritures: [{}, {}], deviseId: '3' };
    },
  };
  const service = new RechargeService(
    { transaction: async (cb: any) => cb(manager) } as any,
    ledger as any,
    {
      assertPermission: async () => undefined,
      assertCaisseInPerimeter: async () => undefined,
    } as any,
  );
  return { service, mouvements };
}

const base = { caisseId: '1', portefeuilleId: '7', montant: '1000', userId: '10' };

describe('RechargeService — délégation au point de passage commun', () => {
  it('délègue le mouvement, sens caisse → portefeuille par défaut', async () => {
    const { service, mouvements } = monter();
    await service.recharge({ ...base });
    expect(mouvements).toHaveLength(1);
    expect(mouvements[0].sens).toBe('CAISSE_VERS_PORTEFEUILLE');
    expect(mouvements[0].typeOperation).toBe('RECHARGE');
  });

  it('transmet le sens inverse quand il est demandé', async () => {
    const { service, mouvements } = monter({ soldePortefeuille: '5000' });
    await service.recharge({ ...base, sens: 'PORTEFEUILLE_VERS_CAISSE' });
    expect(mouvements[0].sens).toBe('PORTEFEUILLE_VERS_CAISSE');
  });
});

describe('RechargeService — gardes propres', () => {
  it('refuse un montant nul ou négatif', async () => {
    const { service, mouvements } = monter();
    await expect(service.recharge({ ...base, montant: '0' })).rejects.toThrow(BadRequestException);
    expect(mouvements).toHaveLength(0);
  });

  it('refuse une caisse fermée', async () => {
    const { service, mouvements } = monter({ caisse: { id: '1', code: 'CI02', statut: 'FERMEE', deviseId: '1' } });
    await expect(service.recharge({ ...base })).rejects.toThrow(/fermée/);
    expect(mouvements).toHaveLength(0);
  });

  it("refuse un portefeuille rattaché à une autre caisse", async () => {
    const { service, mouvements } = monter({
      portefeuille: { id: '7', code: 'TEST', caisseSourceId: '99', deviseId: '3', soldeInitial: '0' },
    });
    await expect(service.recharge({ ...base })).rejects.toThrow(/n'est pas rattaché/);
    expect(mouvements).toHaveLength(0);
  });

  it('refuse un portefeuille introuvable', async () => {
    const { service } = monter({ portefeuilleAbsent: true });
    await expect(service.recharge({ ...base })).rejects.toThrow(NotFoundException);
  });
});

describe('RechargeService — plafond du sens inverse', () => {
  const inverse = { ...base, sens: 'PORTEFEUILLE_VERS_CAISSE' as const };

  it('refuse de renvoyer plus que le disponible du portefeuille', async () => {
    const { service, mouvements } = monter({ soldePortefeuille: '100' });
    await expect(service.recharge({ ...inverse })).rejects.toThrow(/insuffisant/);
    expect(mouvements).toHaveLength(0);
  });

  it('compte le solde initial dans le disponible', async () => {
    // 400 au grand livre + 600 de solde initial = 1000 : le montant passe tout juste.
    const { service, mouvements } = monter({
      portefeuille: { id: '7', code: 'TEST', caisseSourceId: '1', deviseId: '3', soldeInitial: '600' },
      soldePortefeuille: '400',
    });
    await service.recharge({ ...inverse });
    expect(mouvements).toHaveLength(1);
  });

  it('ne contrôle PAS ce plafond dans le sens normal', async () => {
    // Portefeuille vide : sans importance, c'est la caisse qui le finance.
    const { service, mouvements } = monter({ soldePortefeuille: '0' });
    await service.recharge({ ...base });
    expect(mouvements).toHaveLength(1);
  });
});
