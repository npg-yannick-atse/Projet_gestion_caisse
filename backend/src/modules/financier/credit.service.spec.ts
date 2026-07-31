import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CreditService } from './credit.service';

/**
 * Machine à états du crédit employé :
 *   EN_ATTENTE → APPROUVEE → EN_COURS → SOLDE
 *   EN_ATTENTE → REJETEE / ANNULEE
 *
 * Deux familles de règles sont vérifiées ici :
 *  - les transitions interdites (on ne rejette pas un crédit déjà décaissé…) ;
 *  - la séparation des responsabilités (personne n'approuve sa propre demande).
 *
 * Le décaissement lui-même (traiter) n'est pas couvert : il ouvre une transaction
 * SQL et écrit au grand livre — cela relève d'un test d'intégration.
 */
function build(credit: any) {
  const saved: any[] = [];
  const creditRepo = {
    findOne: jest.fn(async () => credit),
    save: jest.fn(async (c: any) => {
      saved.push({ ...c });
      return c;
    }),
  };
  const authz = { isAdmin: jest.fn(async () => false) };
  const service = new CreditService(
    creditRepo as any,
    { findOne: jest.fn(async () => null) } as any,
    { getRepository: jest.fn(() => ({ findOne: jest.fn(async () => null) })) } as any,
    {} as any,
    authz as any,
  );
  return { service, saved, authz, creditRepo };
}

/** Crédit type, demandé par l'utilisateur 100. */
const credit = (statut: string, createdById = '100') => ({
  id: '1',
  statut,
  createdById,
  montant: '50000.0000',
});

describe('CreditService.approuver', () => {
  it('fait passer une demande EN_ATTENTE à APPROUVEE', async () => {
    const { service, saved } = build(credit('EN_ATTENTE'));
    await service.approuver('1', '200');
    expect(saved[0].statut).toBe('APPROUVEE');
    expect(String(saved[0].validateurId)).toBe('200');
    expect(saved[0].dateValidation).toBeInstanceOf(Date);
  });

  it("interdit d'approuver sa PROPRE demande (séparation des rôles)", async () => {
    const { service, creditRepo } = build(credit('EN_ATTENTE', '200'));
    await expect(service.approuver('1', '200')).rejects.toBeInstanceOf(ForbiddenException);
    expect(creditRepo.save).not.toHaveBeenCalled();
  });

  it("refuse d'approuver un crédit déjà approuvé, décaissé, soldé, rejeté ou annulé", async () => {
    for (const s of ['APPROUVEE', 'EN_COURS', 'SOLDE', 'REJETEE', 'ANNULEE']) {
      const { service } = build(credit(s));
      await expect(service.approuver('1', '200')).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});

describe('CreditService.rejeter', () => {
  it('fait passer EN_ATTENTE à REJETEE et conserve le motif', async () => {
    const { service, saved } = build(credit('EN_ATTENTE'));
    await service.rejeter('1', '200', 'Budget insuffisant');
    expect(saved[0].statut).toBe('REJETEE');
    expect(saved[0].commentaireValidation).toBe('Budget insuffisant');
  });

  it('accepte un rejet sans motif (commentaire null)', async () => {
    const { service, saved } = build(credit('EN_ATTENTE'));
    await service.rejeter('1', '200');
    expect(saved[0].commentaireValidation).toBeNull();
  });

  it("refuse de rejeter un crédit qui n'est plus en attente", async () => {
    for (const s of ['APPROUVEE', 'EN_COURS', 'SOLDE']) {
      const { service } = build(credit(s));
      await expect(service.rejeter('1', '200')).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});

describe('CreditService.annuler', () => {
  it('laisse le demandeur annuler sa propre demande', async () => {
    const { service, saved } = build(credit('EN_ATTENTE', '100'));
    await service.annuler('1', '100');
    expect(saved[0].statut).toBe('ANNULEE');
  });

  it("empêche un tiers d'annuler la demande de quelqu'un d'autre", async () => {
    const { service } = build(credit('EN_ATTENTE', '100'));
    await expect(service.annuler('1', '999')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("autorise un administrateur à annuler la demande d'autrui", async () => {
    const { service, authz, saved } = build(credit('EN_ATTENTE', '100'));
    authz.isAdmin.mockResolvedValue(true);
    await service.annuler('1', '999');
    expect(saved[0].statut).toBe('ANNULEE');
  });

  it("refuse d'annuler un crédit déjà approuvé ou décaissé", async () => {
    for (const s of ['APPROUVEE', 'EN_COURS', 'SOLDE']) {
      const { service } = build(credit(s, '100'));
      await expect(service.annuler('1', '100')).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});

describe('CreditService.update — modification de la demande', () => {
  it('laisse le demandeur modifier sa demande tant qu’elle est EN_ATTENTE', async () => {
    const { service, saved } = build(credit('EN_ATTENTE', '100'));
    await service.update('1', { montant: '75000.0000', nbMois: 6 } as any, '100');
    expect(saved[0].montant).toBe('75000.0000');
    expect(saved[0].nbMois).toBe(6);
  });

  it("empêche un tiers de modifier la demande de quelqu'un d'autre", async () => {
    const { service, creditRepo } = build(credit('EN_ATTENTE', '100'));
    await expect(service.update('1', { montant: '1' } as any, '999')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(creditRepo.save).not.toHaveBeenCalled();
  });

  it("autorise un administrateur à modifier la demande d'autrui", async () => {
    const { service, authz, saved } = build(credit('EN_ATTENTE', '100'));
    authz.isAdmin.mockResolvedValue(true);
    await service.update('1', { nbMois: 3 } as any, '999');
    expect(saved[0].nbMois).toBe(3);
  });

  it('fige la demande dès qu’elle n’est plus EN_ATTENTE', async () => {
    // Une demande approuvée ou décaissée ne doit plus pouvoir changer de montant.
    for (const s of ['APPROUVEE', 'EN_COURS', 'SOLDE', 'REJETEE', 'ANNULEE']) {
      const { service } = build(credit(s, '100'));
      await expect(service.update('1', { montant: '1' } as any, '100')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
  });

  it('refuse un montant nul ou négatif', async () => {
    for (const m of ['0', '-5000']) {
      const { service } = build(credit('EN_ATTENTE', '100'));
      await expect(service.update('1', { montant: m } as any, '100')).rejects.toThrow(/positif/i);
    }
  });
});

describe('CreditService.solder', () => {
  it('exige que le crédit soit EN_COURS', async () => {
    for (const s of ['EN_ATTENTE', 'APPROUVEE', 'SOLDE', 'REJETEE', 'ANNULEE']) {
      const { service } = build(credit(s));
      await expect(service.solder('1', '200')).rejects.toThrow(/en cours/i);
    }
  });
});
