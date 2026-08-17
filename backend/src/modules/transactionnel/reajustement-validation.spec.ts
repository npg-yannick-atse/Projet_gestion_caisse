import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ReajustementsService } from './reajustements.service';

/**
 * Le réajustement de budget PROPOSE, il n'exécute plus.
 *
 * Il déplaçait autrefois les fonds tout seul : au premier passage du mois, il
 * portait le portefeuille à son plafond en débitant sa caisse, sans que
 * personne l'ait décidé. C'est ainsi que 999 milliards sont partis d'un
 * portefeuille vers une caisse, à la surprise générale.
 *
 * Ces tests couvrent le SEUL endroit où l'argent bouge désormais : l'approbation.
 */
function monter({
  statut = 'EN_ATTENTE',
  perms = ['BUDGET_REAJUSTEMENT_VALIDER'],
  echecLedger,
}: { statut?: string; perms?: string[]; echecLedger?: string } = {}) {
  const demande = {
    id: '1',
    portefeuilleId: '7',
    mois: '2026-08',
    montant: '1000000.0000',
    sens: 'CAISSE_VERS_PORTEFEUILLE',
    deviseId: '1',
    caisseId: '4',
    statut,
  };
  const sql: string[] = [];
  const mouvements: any[] = [];

  const dataSource = {
    query: jest.fn(async (q: string) => {
      sql.push(q.replace(/\s+/g, ' ').trim());
      if (q.includes('FROM dbo.trx_demande_reajustement WHERE id')) return [demande];
      if (q.includes('FROM dbo.trx_demande_reajustement d')) return [demande];
      return [];
    }),
    transaction: jest.fn(async (cb: any) =>
      cb({ query: jest.fn(async (q: string) => sql.push(q.replace(/\s+/g, ' ').trim())) }),
    ),
  };
  const ledger = {
    mouvementCaissePortefeuille: jest.fn(async (input: any) => {
      if (echecLedger) throw new Error(echecLedger);
      mouvements.push(input);
      return { operation: { transactionUuid: 'uuid-1' } };
    }),
  };
  const authz = {
    assertPermission: jest.fn(async (_u: string, code: string) => {
      if (!perms.includes(code)) throw new ForbiddenException('non autorisé');
    }),
  };

  return { service: new ReajustementsService(dataSource as any, ledger as any, authz as any), sql, mouvements };
}

describe('validation du réajustement de budget', () => {
  it("déplace l'argent à l'approbation, et pas avant", async () => {
    const { service, mouvements } = monter();

    await service.approuver('1', '2', 'Vu');

    expect(mouvements).toHaveLength(1);
    expect(mouvements[0]).toMatchObject({
      caisseId: '4',
      portefeuilleId: '7',
      montant: '1000000.0000',
      sens: 'CAISSE_VERS_PORTEFEUILLE',
    });
  });

  it('ne marque le mois traité QUE si le mouvement a réussi', async () => {
    const { service, sql } = monter({ echecLedger: 'La caisse ne détient pas assez de XOF' });

    await expect(service.approuver('1', '2')).rejects.toThrow(BadRequestException);

    // Sans ce garde-fou, le portefeuille sortirait des candidats sans avoir
    // reçu un franc — et personne ne le réajusterait plus ce mois-ci.
    expect(sql.some((q) => q.includes('budget_reset_mois ='))).toBe(false);
    expect(sql.some((q) => q.includes("statut = 'ECHEC'"))).toBe(true);
  });

  it('ne déplace rien sur un refus', async () => {
    const { service, mouvements, sql } = monter();

    await service.refuser('1', '2', 'Trop élevé');

    expect(mouvements).toHaveLength(0);
    expect(sql.some((q) => q.includes("statut = 'REFUSEE'"))).toBe(true);
  });

  it('rejoue une demande en ÉCHEC : la caisse a pu être approvisionnée depuis', async () => {
    const { service, mouvements } = monter({ statut: 'ECHEC' });

    await service.approuver('1', '2');

    expect(mouvements).toHaveLength(1);
  });

  it('refuse de rejouer une demande déjà approuvée', async () => {
    const { service } = monter({ statut: 'APPROUVEE' });

    await expect(service.approuver('1', '2')).rejects.toThrow(/déjà approuvee/i);
  });

  it('exige la permission de validation', async () => {
    const { service, mouvements } = monter({ perms: [] });

    await expect(service.approuver('1', '2')).rejects.toThrow(ForbiddenException);
    expect(mouvements).toHaveLength(0);
  });
});
