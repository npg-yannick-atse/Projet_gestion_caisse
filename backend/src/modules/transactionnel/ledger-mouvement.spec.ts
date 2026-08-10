import { BadRequestException } from '@nestjs/common';
import { LedgerService } from './ledger.service';

/**
 * `mouvementCaissePortefeuille` — le point de passage UNIQUE des mouvements
 * caisse ↔ portefeuille.
 *
 * Trois chemins écrivaient auparavant le grand livre chacun de leur côté :
 * la recharge manuelle, la recharge d'extension de bon et le réajustement du
 * budget mensuel. Leurs règles divergeaient — l'extension retenait même la
 * devise de la CAISSE, ce qui ne créditait rien lorsque le portefeuille était
 * dans une autre devise. Aucun des trois ne vérifiait que la caisse détenait
 * la devise débitée : d'où les −175 000 EUR de CI01 en juin 2026.
 *
 * Ces tests verrouillent les deux règles, une fois pour les trois chemins.
 */
function monter(opts: {
  /** Solde de la caisse par devise : { deviseId: solde }. */
  soldesCaisse?: Record<string, string>;
  caisse?: any;
  portefeuille?: any;
} = {}) {
  const caisse = opts.caisse ?? { id: '1', code: 'CI02', deviseId: '1' };
  const portefeuille = opts.portefeuille ?? { id: '7', code: 'TEST', deviseId: '3' };
  const soldesCaisse = opts.soldesCaisse ?? {};
  const devises = [
    { id: '1', code: 'XOF' },
    { id: '2', code: 'EUR' },
    { id: '3', code: 'USD' },
  ];

  const service = new LedgerService({} as any, {} as any);
  const operations: any[] = [];
  const ecritures: any[] = [];

  jest
    .spyOn(service, 'calculateBalance')
    .mockImplementation(async (_compteId: string, type: any, deviseId?: string) =>
      type === 'CAISSE' ? (soldesCaisse[String(deviseId)] ?? '0') : '0',
    );
  jest.spyOn(service, 'createOperation').mockImplementation(async (input: any) => {
    operations.push(input);
    return { transactionUuid: 'uuid-1' } as any;
  });
  jest.spyOn(service, 'createPairedEcritures').mockImplementation(async (debit: any, credit: any) => {
    ecritures.push({ debit, credit });
    return [{}, {}] as any;
  });

  const manager: any = {
    getRepository: (e: any) => {
      if (e?.name === 'Devise') {
        return { findOne: async ({ where }: any) => devises.find((d) => String(d.id) === String(where.id)) ?? null };
      }
      if (e?.name === 'Portefeuille') return { findOne: async () => portefeuille };
      return { findOne: async () => caisse };
    },
  };

  return { service, manager, operations, ecritures };
}

const base = {
  caisseId: '1',
  portefeuilleId: '7',
  montant: '1000',
  sens: 'CAISSE_VERS_PORTEFEUILLE' as const,
  typeOperation: 'RECHARGE' as const,
  userId: '10',
};

describe('mouvementCaissePortefeuille — la devise vient du PORTEFEUILLE', () => {
  it('retient la devise du portefeuille, pas celle de la caisse', async () => {
    // Caisse en XOF (1), portefeuille en USD (3).
    const { service, manager, operations, ecritures } = monter({ soldesCaisse: { '3': '5000' } });
    const r = await service.mouvementCaissePortefeuille({ ...base }, manager);
    expect(r.deviseId).toBe('3');
    expect(operations[0].deviseId).toBe('3');
    expect(ecritures[0].debit.deviseId).toBe('3');
    expect(ecritures[0].credit.deviseId).toBe('3');
  });

  it('débite la caisse et crédite le portefeuille dans le sens normal', async () => {
    const { service, manager, ecritures } = monter({ soldesCaisse: { '3': '5000' } });
    await service.mouvementCaissePortefeuille({ ...base }, manager);
    expect(ecritures[0].debit.typeCompte).toBe('CAISSE');
    expect(ecritures[0].credit.typeCompte).toBe('PORTEFEUILLE');
  });

  it('inverse les deux comptes dans le sens portefeuille → caisse', async () => {
    const { service, manager, ecritures } = monter();
    await service.mouvementCaissePortefeuille(
      { ...base, sens: 'PORTEFEUILLE_VERS_CAISSE' },
      manager,
    );
    expect(ecritures[0].debit.typeCompte).toBe('PORTEFEUILLE');
    expect(ecritures[0].credit.typeCompte).toBe('CAISSE');
  });
});

describe('mouvementCaissePortefeuille — solvabilité de la caisse', () => {
  it('refuse si la caisse ne détient rien dans cette devise', async () => {
    const { service, manager, operations } = monter({ soldesCaisse: { '1': '9425945' } });
    await expect(service.mouvementCaissePortefeuille({ ...base }, manager)).rejects.toThrow(
      BadRequestException,
    );
    expect(operations).toHaveLength(0);
  });

  it('nomme la devise manquante dans le message', async () => {
    const { service, manager } = monter({ soldesCaisse: {} });
    await expect(service.mouvementCaissePortefeuille({ ...base }, manager)).rejects.toThrow(
      /ne détient pas assez de USD/,
    );
  });

  it("n'additionne pas les autres devises", async () => {
    // 1 000 000 XOF ne financent pas 1 000 USD.
    const { service, manager, operations } = monter({ soldesCaisse: { '1': '1000000', '3': '10' } });
    await expect(service.mouvementCaissePortefeuille({ ...base }, manager)).rejects.toThrow(
      BadRequestException,
    );
    expect(operations).toHaveLength(0);
  });

  it('autorise un montant exactement égal au disponible', async () => {
    const { service, manager, operations } = monter({ soldesCaisse: { '3': '1000' } });
    await service.mouvementCaissePortefeuille({ ...base }, manager);
    expect(operations).toHaveLength(1);
  });

  it('ne contrôle PAS la caisse dans le sens inverse (une reprise la recrédite)', async () => {
    const { service, manager, operations } = monter({ soldesCaisse: {} });
    await service.mouvementCaissePortefeuille({ ...base, sens: 'PORTEFEUILLE_VERS_CAISSE' }, manager);
    expect(operations).toHaveLength(1);
  });

  it('lit le solde DANS la transaction en cours (manager transmis)', async () => {
    // Sans le manager, le contrôle ignorerait les écritures non encore validées
    // de la même transaction — un réajustement de budget deviendrait faux.
    const { service, manager } = monter({ soldesCaisse: { '3': '5000' } });
    await service.mouvementCaissePortefeuille({ ...base }, manager);
    expect(service.calculateBalance).toHaveBeenCalledWith('1', 'CAISSE', '3', manager);
  });
});
