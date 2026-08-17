import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { RemboursementsBonService } from './remboursements-bon.service';

/**
 * Rendre à la caisse ce qui n'a pas été dépensé.
 *
 * Un bon de 100 000 décaissé pour 70 000 laisse 30 000 à rendre. Le bon garde
 * son montant — c'est ce qui a été AUTORISÉ — et le remboursement dit ce qui
 * est revenu.
 *
 * La règle qui compte : ON NE REND PAS PLUS QU'ON N'A REÇU. Sans elle, un
 * remboursement de 200 000 sur un décaissement de 100 000 créerait 100 000 de
 * toutes pièces, dans une caisse, sans contrepartie.
 */
function monter({
  statut = 'DECAISSE',
  sorti = 100000,
  dejaRendu = 0,
  perms = ['BON_REMBOURSER'],
}: { statut?: string; sorti?: number; dejaRendu?: number; perms?: string[] } = {}) {
  const sousBon = {
    id: '3',
    bonId: '2',
    statut,
    montant: '100000.0000',
    caisseId: '4',
    portefeuilleId: '7',
    deviseId: '1',
    costCenterId: '29',
  };
  const enregistres: any[] = [];
  const ecritures: any[] = [];

  const repo = {
    // Deux requêtes brutes : le total déjà rendu, et le total décaissé.
    query: jest.fn(async (sql: string) =>
      sql.includes('trx_decaissement') ? [{ total: sorti }] : [{ total: dejaRendu }],
    ),
    find: jest.fn(async () => []),
  };
  const gestion = {
    create: jest.fn((x: any) => x),
    save: jest.fn(async (x: any) => {
      enregistres.push(x);
      return { id: '1', ...x };
    }),
  };

  const dataSource = {
    getRepository: jest.fn(() => gestion),
    transaction: jest.fn(async (cb: any) => cb({ getRepository: jest.fn(() => gestion) })),
  };
  const ledger = {
    createPairedEcritures: jest.fn(async (debit: any, credit: any, montant: string) => {
      ecritures.push({ debit, credit, montant });
      return [];
    }),
  };
  const authz = {
    assertPermission: jest.fn(async (_u: string, code: string) => {
      if (!perms.includes(code)) throw new ForbiddenException('non autorisé');
    }),
  };

  const service = new RemboursementsBonService(
    repo as any,
    { findOne: jest.fn(async () => sousBon) } as any,
    dataSource as any,
    ledger as any,
    authz as any,
  );
  return { service, enregistres, ecritures };
}

describe("remboursement d'un bon", () => {
  it('accepte de rendre une part de ce qui est sorti', async () => {
    const { service, enregistres } = monter({ sorti: 100000 });

    await service.creer({ sousBonId: '3', montant: '30000', motif: 'Dépense réelle 70 000' }, '2');

    expect(enregistres.some((e) => e.montant === '30000.0000')).toBe(true);
  });

  it('écrit le miroir du décaissement : débit charge, crédit caisse', async () => {
    const { service, ecritures } = monter();

    await service.creer({ sousBonId: '3', montant: '30000' }, '2');

    // La charge retombe de 100 000 à 70 000, l'argent est dans le tiroir.
    expect(ecritures[0].debit).toMatchObject({ typeCompte: 'CHARGE', compteId: '29' });
    expect(ecritures[0].credit).toMatchObject({ typeCompte: 'CAISSE', compteId: '4' });
    // Le portefeuille N'EST PAS recrédité : le budget du mois reste consommé.
    expect(JSON.stringify(ecritures)).not.toContain('PORTEFEUILLE');
  });

  it('refuse de rendre plus que ce qui est sorti', async () => {
    const { service } = monter({ sorti: 100000 });

    await expect(service.creer({ sousBonId: '3', montant: '150000' }, '2')).rejects.toThrow(
      /100000.0000 ont été décaissés/,
    );
  });

  it('tient compte de ce qui a DÉJÀ été rendu', async () => {
    const { service } = monter({ sorti: 100000, dejaRendu: 80000 });

    // 80 000 rendus sur 100 000 : il reste 20 000, pas 100 000.
    await expect(service.creer({ sousBonId: '3', montant: '30000' }, '2')).rejects.toThrow(
      /il reste 20000.0000/,
    );
    await expect(service.creer({ sousBonId: '3', montant: '20000' }, '2')).resolves.toBeDefined();
  });

  it('refuse un montant nul ou négatif', async () => {
    const { service } = monter();

    // Ce serait un décaissement déguisé, échappant à tous ses contrôles.
    for (const m of ['0', '-5000']) {
      await expect(service.creer({ sousBonId: '3', montant: m }, '2')).rejects.toThrow(BadRequestException);
    }
  });

  it("refuse un sous-bon qui n'est pas décaissé", async () => {
    const { service } = monter({ statut: 'VALIDE' });

    // Rien n'est sorti : rien ne peut revenir.
    await expect(service.creer({ sousBonId: '3', montant: '10000' }, '2')).rejects.toThrow(/VALIDE/);
  });

  it('exige la permission BON_REMBOURSER', async () => {
    const { service } = monter({ perms: [] });

    await expect(service.creer({ sousBonId: '3', montant: '10000' }, '2')).rejects.toThrow(ForbiddenException);
  });
});
