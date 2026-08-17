import { BadRequestException } from '@nestjs/common';
import { BonsService } from './bons.service';

/**
 * Le solde initial d'un portefeuille COMPTE au décaissement.
 *
 * Un portefeuille créé avec 1 000 000 et aucun mouvement paraissait vide : la
 * garde ne lisait que le grand livre. On voyait « 1 000 000 » à l'écran et
 * « solde insuffisant » au décaissement — l'affichage et la recharge
 * additionnaient bien `soldeInitial`, seules les deux gardes l'ignoraient.
 */
function monter({ soldeInitial, ledger }: { soldeInitial: string; ledger: string }) {
  const portefeuille = { id: '6', code: 'P_CI_XOF', deviseId: '1', soldeInitial };
  const bon = { id: '1', statut: 'VALIDE', statutExtension: 'NON', extensionMode: null };

  const bonRepo = { findOne: jest.fn(async () => bon), save: jest.fn(async (b: any) => b) };
  const vide = () =>
    ({ find: jest.fn(async () => []), findOne: jest.fn(async () => null), save: jest.fn(async (x: any) => x) }) as any;

  const dataSource = {
    getRepository: jest.fn(() => ({ findOne: jest.fn(async () => portefeuille) })),
    transaction: jest.fn(async (cb: any) => cb({ getRepository: jest.fn(() => bonRepo) })),
  };
  const ledgerService = { calculateBalance: jest.fn(async () => ledger) };

  const service = new BonsService(
    bonRepo as any, vide(), vide(), vide(), vide(), vide(), vide(), vide(),
    dataSource as any,
    { isAdmin: jest.fn(async () => true), assertPermission: jest.fn(async () => undefined) } as any,
    ledgerService as any,
    {} as any,
  );
  return service;
}

describe('garde de solde au décaissement', () => {
  it('accepte quand le solde initial couvre le montant, sans aucun mouvement', async () => {
    // Le cas signalé : portefeuille alimenté à la création, grand livre vide.
    const service = monter({ soldeInitial: '1000000', ledger: '0' });

    await expect(service.assertSoldeSuffisantOuExtension('6', '5000', '1')).resolves.toBeUndefined();
  });

  it('additionne solde initial et mouvements', async () => {
    // 1000 posés à la création, 500 dépensés depuis : 500 restent.
    const service = monter({ soldeInitial: '1000', ledger: '-500' });

    await expect(service.assertSoldeSuffisantOuExtension('6', '500', '1')).resolves.toBeUndefined();
    await expect(service.assertSoldeSuffisantOuExtension('6', '501', '1')).rejects.toThrow(BadRequestException);
  });

  it('refuse toujours au-delà du disponible, et annonce le chiffre', async () => {
    const service = monter({ soldeInitial: '1000', ledger: '0' });

    // Sans le montant disponible dans le message, on ignore de combien on
    // dépasse — et donc quoi corriger.
    await expect(service.assertSoldeSuffisantOuExtension('6', '2000', '1')).rejects.toThrow(
      /Disponible : 1000\.0000, demandé : 2000\.0000/,
    );
  });
});
