import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PaiementSalaireService } from './paiement-salaire.service';

/**
 * Paiement des salaires : normalisation de la période et garde-fous du versement.
 *
 * La période a déjà causé un bug : le contrôleur transmettait une chaîne vide
 * quand le paramètre était absent, et `??` ne se déclenchant que sur null, la
 * validation échouait au lieu de retomber sur le mois courant. D'où les cas
 * « vide » ci-dessous.
 */
describe('PaiementSalaireService.normaliserPeriode', () => {
  const courante = PaiementSalaireService.periodeCourante();

  it('retombe sur le mois courant quand la période est absente', () => {
    expect(PaiementSalaireService.normaliserPeriode(undefined)).toBe(courante);
  });

  it('retombe sur le mois courant quand la période est VIDE ou blanche', () => {
    // Cas réel : une query string non renseignée arrive comme chaîne vide.
    expect(PaiementSalaireService.normaliserPeriode('')).toBe(courante);
    expect(PaiementSalaireService.normaliserPeriode('   ')).toBe(courante);
  });

  it('accepte une période valide et ignore les espaces', () => {
    expect(PaiementSalaireService.normaliserPeriode('2026-01')).toBe('2026-01');
    expect(PaiementSalaireService.normaliserPeriode(' 2026-01 ')).toBe('2026-01');
  });

  it('refuse un format invalide', () => {
    for (const p of ['2026', '2026-1', '26-01', '2026/01', 'janvier', '2026-13', '2026-00']) {
      expect(() => PaiementSalaireService.normaliserPeriode(p)).toThrow(BadRequestException);
    }
  });

  it('refuse un mois à venir (pas de paiement d’avance)', () => {
    const [a, m] = courante.split('-').map(Number);
    const futur = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
    expect(() => PaiementSalaireService.normaliserPeriode(futur)).toThrow(/à venir/i);
  });

  it('accepte un mois passé (régularisation)', () => {
    expect(PaiementSalaireService.normaliserPeriode('2020-03')).toBe('2020-03');
  });
});

describe('PaiementSalaireService.payer — garde-fous', () => {
  function build(opts: {
    employe?: any;
    dejaPaye?: any;
    caisse?: any;
  } = {}) {
    const {
      employe = { id: '1', matricule: 'E001', estActif: true, salaire: '500000' },
      dejaPaye = null,
      caisse = { id: '9', code: 'C1', statut: 'OUVERTE' },
    } = opts;

    const saved: any[] = [];
    const repo = {
      findOne: jest.fn(async () => dejaPaye),
      find: jest.fn(async () => []),
      create: jest.fn((x: any) => x),
      save: jest.fn(async (x: any) => {
        saved.push(x);
        return { id: '100', ...x };
      }),
    };
    const ledger = {
      createOperation: jest.fn(async () => ({ transactionUuid: 'uuid-1' })),
      createPairedEcritures: jest.fn(async () => [{}, {}]),
    };
    const authz = {
      assertCaisseInPerimeter: jest.fn(async () => undefined),
      assertPortefeuilleInPerimeter: jest.fn(async () => undefined),
    };
    const dataSource = {
      getRepository: jest.fn(() => ({ findOne: jest.fn(async () => caisse) })),
      transaction: jest.fn(async (cb: any) => cb({ getRepository: jest.fn(() => repo) })),
    };
    const service = new PaiementSalaireService(
      repo as any,
      { findOne: jest.fn(async () => employe) } as any,
      dataSource as any,
      ledger as any,
      authz as any,
    );
    return { service, ledger, saved, repo };
  }

  const input = {
    employeId: '1',
    sourceType: 'CAISSE' as const,
    sourceId: '9',
    deviseId: '1',
  };

  it('verse le salaire de la fiche quand aucun montant n’est fourni', async () => {
    const { service, saved } = build();
    await service.payer(input, '77');
    expect(saved[0].montant).toBe('500000');
  });

  it('privilégie le montant explicitement saisi', async () => {
    const { service, saved } = build();
    await service.payer({ ...input, montant: '250000' }, '77');
    expect(saved[0].montant).toBe('250000');
  });

  it('génère DÉBIT source / CRÉDIT salaire (l’argent sort)', async () => {
    const { service, ledger } = build();
    await service.payer(input, '77');
    const [debit, credit] = (ledger.createPairedEcritures as jest.Mock).mock.calls[0];
    expect(debit.typeCompte).toBe('CAISSE');
    expect(credit.typeCompte).toBe('SALAIRE');
  });

  it('refuse un employé sans salaire renseigné', async () => {
    const { service } = build({ employe: { id: '1', matricule: 'E001', estActif: true, salaire: null } });
    await expect(service.payer(input, '77')).rejects.toThrow(/Aucun montant/i);
  });

  it('refuse un salaire nul ou négatif', async () => {
    for (const s of ['0', '-100']) {
      const { service } = build({ employe: { id: '1', matricule: 'E001', estActif: true, salaire: s } });
      await expect(service.payer(input, '77')).rejects.toThrow(/Aucun montant/i);
    }
  });

  it('refuse un employé inactif', async () => {
    const { service } = build({ employe: { id: '1', matricule: 'E001', estActif: false, salaire: '1' } });
    await expect(service.payer(input, '77')).rejects.toThrow(/inactif/i);
  });

  it('refuse un employé introuvable', async () => {
    const { service } = build({ employe: null });
    await expect(service.payer(input, '77')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuse un second paiement pour le même mois', async () => {
    const { service, ledger } = build({
      dejaPaye: { id: '5', datePaiement: new Date('2026-07-31'), montant: '500000' },
    });
    await expect(service.payer(input, '77')).rejects.toBeInstanceOf(ConflictException);
    // Surtout : aucune écriture ne doit avoir été générée.
    expect(ledger.createPairedEcritures).not.toHaveBeenCalled();
  });

  it('refuse de payer depuis une caisse fermée', async () => {
    const { service, ledger } = build({ caisse: { id: '9', code: 'C1', statut: 'FERMEE' } });
    await expect(service.payer(input, '77')).rejects.toThrow(/fermée/i);
    expect(ledger.createPairedEcritures).not.toHaveBeenCalled();
  });

  it('n’exige pas de caisse ouverte pour un portefeuille', async () => {
    const { service, saved } = build({ caisse: { id: '9', code: 'C1', statut: 'FERMEE' } });
    await service.payer({ ...input, sourceType: 'PORTEFEUILLE' }, '77');
    expect(saved[0].sourceType).toBe('PORTEFEUILLE');
  });

  it('rattache le paiement à la transaction du grand livre', async () => {
    const { service, saved } = build();
    await service.payer(input, '77');
    expect(saved[0].transactionUuid).toBe('uuid-1');
    expect(saved[0].statut).toBe('PAYE');
  });
});
