import { BadRequestException } from '@nestjs/common';
import { InterimsService } from './interims.service';
import type { CreateInterimDto } from './dto/interim.dto';

/**
 * Copie en bloc des droits d'un utilisateur vers son remplaçant.
 *
 * Le point à ne pas perdre de vue : on crée UNE LIGNE PAR DROIT, et ces lignes
 * sont figées à la déclaration. Une délégation « globale » qui suivrait
 * l'initiateur donnerait au remplaçant tout rôle acquis pendant l'absence —
 * y compris ADMINISTRATEUR — sans que personne ne l'ait décidé.
 */

const REMPLACANT = '30';
const INITIATEUR = '10';

function build(opts: {
  roles?: Array<{ id: string }>;
  profils?: Array<{ profilId: string }>;
} = {}) {
  const { roles = [], profils = [] } = opts;
  const saved: any[] = [];

  const authz = {
    assertPermissionStrict: jest.fn(async () => undefined),
    isAdmin: jest.fn(async () => true),
    getEffectiveRoles: jest.fn(async () => roles),
    getEffectivePermissions: jest.fn(async () => new Set<string>()),
  };
  const interimRepo = {
    create: jest.fn((x: any) => x),
    save: jest.fn(async (x: any) => {
      const liste = Array.isArray(x) ? x : [x];
      saved.push(...liste);
      return liste.map((l, i) => ({ id: String(900 + i), ...l }));
    }),
  };
  const userRepo = { findOne: jest.fn(async ({ where }: any) => ({ id: where.id, estActif: true })) };
  const permissionRepo = { findOne: jest.fn(async () => null) };
  const userProfilRepo = { find: jest.fn(async () => profils) };

  const service = new InterimsService(
    interimRepo as any,
    userRepo as any,
    permissionRepo as any,
    userProfilRepo as any,
    authz as any,
  );
  return { service, saved, authz, interimRepo };
}

const dto = (over: Partial<CreateInterimDto> = {}): CreateInterimDto => {
  const debut = new Date(Date.now() + 86_400_000);
  const fin = new Date(Date.now() + 7 * 86_400_000);
  return {
    remplacantId: REMPLACANT,
    dateDebut: debut.toISOString(),
    dateFin: fin.toISOString(),
    copierTousLesDroits: true,
    ...over,
  } as CreateInterimDto;
};

describe('Copie de tous les droits — ce qui est créé', () => {
  it('crée une ligne par rôle et par profil détenus', async () => {
    const { service, saved } = build({
      roles: [{ id: '1' }, { id: '2' }],
      profils: [{ profilId: '7' }],
    });
    await service.create(dto(), INITIATEUR);

    expect(saved).toHaveLength(3);
    expect(saved.filter((l) => l.roleTransfereId).map((l) => String(l.roleTransfereId))).toEqual(['1', '2']);
    expect(saved.filter((l) => l.profilTransfereId).map((l) => String(l.profilTransfereId))).toEqual(['7']);
  });

  it('ne mélange jamais rôle et profil sur une même ligne', async () => {
    // Une ligne portant les deux rendrait la révocation partielle impossible.
    const { service, saved } = build({ roles: [{ id: '1' }], profils: [{ profilId: '7' }] });
    await service.create(dto(), INITIATEUR);
    for (const ligne of saved) {
      expect(!!ligne.roleTransfereId && !!ligne.profilTransfereId).toBe(false);
    }
  });

  it('reporte les mêmes dates et le même remplaçant sur chaque ligne', async () => {
    const { service, saved } = build({ roles: [{ id: '1' }, { id: '2' }] });
    await service.create(dto(), INITIATEUR);
    const debuts = new Set(saved.map((l) => l.dateDebut.getTime()));
    const fins = new Set(saved.map((l) => l.dateFin.getTime()));
    expect(debuts.size).toBe(1);
    expect(fins.size).toBe(1);
    expect(new Set(saved.map((l) => String(l.remplacantId)))).toEqual(new Set([REMPLACANT]));
  });

  it('copie les droits de l’INITIATEUR, pas ceux du remplaçant', async () => {
    const { service, authz } = build({ roles: [{ id: '1' }] });
    await service.create(dto(), INITIATEUR);
    expect(authz.getEffectiveRoles).toHaveBeenCalledWith(INITIATEUR);
    expect(authz.getEffectiveRoles).not.toHaveBeenCalledWith(REMPLACANT);
  });

  it('marque chaque ligne ACTIF', async () => {
    const { service, saved } = build({ roles: [{ id: '1' }] });
    await service.create(dto(), INITIATEUR);
    expect(saved.every((l) => l.statut === 'ACTIF')).toBe(true);
  });
});

describe('Copie de tous les droits — refus', () => {
  it('refuse quand l’initiateur n’a ni rôle ni profil', async () => {
    const { service, interimRepo } = build({ roles: [], profils: [] });
    await expect(service.create(dto(), INITIATEUR)).rejects.toThrow(BadRequestException);
    expect(interimRepo.save).not.toHaveBeenCalled();
  });

  it('applique quand même le contrôle des dates', async () => {
    const { service, interimRepo } = build({ roles: [{ id: '1' }] });
    const hier = new Date(Date.now() - 2 * 86_400_000).toISOString();
    await expect(
      service.create(dto({ dateDebut: hier, dateFin: new Date().toISOString() }), INITIATEUR),
    ).rejects.toThrow(BadRequestException);
    expect(interimRepo.save).not.toHaveBeenCalled();
  });
});

describe('Sans la copie, rien ne change', () => {
  it('exige toujours qu’on précise ce qui est délégué', async () => {
    const { service } = build({ roles: [{ id: '1' }] });
    await expect(
      service.create(dto({ copierTousLesDroits: false }), INITIATEUR),
    ).rejects.toThrow(/rôle, un profil ou une permission/);
  });

  it('ne crée qu’une ligne quand un seul rôle est désigné', async () => {
    const { service, saved } = build({ roles: [{ id: '1' }, { id: '2' }] });
    await service.create(
      dto({ copierTousLesDroits: false, roleTransfereId: '1' }),
      INITIATEUR,
    );
    expect(saved).toHaveLength(1);
    expect(String(saved[0].roleTransfereId)).toBe('1');
  });
});
