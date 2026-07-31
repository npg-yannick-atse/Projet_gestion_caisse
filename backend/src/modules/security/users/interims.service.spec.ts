import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { InterimsService } from './interims.service';
import type { CreateInterimDto } from './dto/interim.dto';

/**
 * Garde-fous de la création d'intérim (anti-escalade de privilèges).
 *
 * Ces règles sont la seule chose qui empêche un administrateur de s'attribuer les
 * droits d'un Super Admin en contournant l'interdiction de modifier ses propres
 * rôles : il lui suffirait de déclarer « initiateur = un Super Admin, remplaçant =
 * moi », puisque AuthorizationService cumule les droits délégués au remplaçant.
 *
 * Si l'un de ces tests casse, ce n'est PAS le test qu'il faut ajuster.
 */
describe('InterimsService.create — garde-fous anti-escalade', () => {
  const MOI = '10';
  const AUTRE = '20';
  const REMPLACANT = '30';

  /** Utilisateur actif renvoyé par défaut pour n'importe quel id. */
  const userActif = (id: string) => ({ id, estActif: true });

  function build(opts: {
    /** Permissions détenues par celui qui saisit (mode strict = pas de bypass). */
    permsStrictes?: string[];
    /**
     * Rôles effectifs PAR UTILISATEUR. Volontairement indexé par id : c'est ce qui
     * permet de vérifier que `assertCanDelegate` interroge bien l'initiateur
     * DÉSIGNÉ et non celui qui saisit — un mock qui répondrait pareil pour tout le
     * monde laisserait passer l'interversion des deux (vérifié par mutation).
     */
    rolesParUtilisateur?: Record<string, Array<{ id: string }>>;
    /** Utilisateurs considérés comme admins (court-circuitent assertCanDelegate). */
    admins?: string[];
  }) {
    const { permsStrictes = [], rolesParUtilisateur, admins } = opts;

    const saved: any[] = [];
    const authz = {
      assertPermissionStrict: jest.fn(async (_userId: string, code: string) => {
        if (!permsStrictes.includes(code)) {
          throw new ForbiddenException(`Permission requise : ${code}`);
        }
      }),
      // Par défaut tout le monde est admin (cas simples) ; sinon liste explicite.
      isAdmin: jest.fn(async (userId: string) => (admins ? admins.includes(String(userId)) : true)),
      getEffectiveRoles: jest.fn(async (userId: string) =>
        rolesParUtilisateur ? (rolesParUtilisateur[String(userId)] ?? []) : [],
      ),
      getEffectivePermissions: jest.fn(async () => new Set<string>()),
    };
    const interimRepo = {
      create: jest.fn((x: any) => x),
      save: jest.fn(async (x: any) => {
        saved.push(x);
        return { id: '999', ...x };
      }),
    };
    const userRepo = { findOne: jest.fn(async ({ where }: any) => userActif(where.id)) };
    const permissionRepo = { findOne: jest.fn(async () => null) };
    const userProfilRepo = { find: jest.fn(async () => []) };

    const service = new InterimsService(
      interimRepo as any,
      userRepo as any,
      permissionRepo as any,
      userProfilRepo as any,
      authz as any,
    );
    return { service, authz, interimRepo, saved };
  }

  /** DTO valide : dates futures, un rôle délégué. */
  const dto = (over: Partial<CreateInterimDto> = {}): CreateInterimDto => {
    const debut = new Date(Date.now() + 86_400_000);
    const fin = new Date(Date.now() + 2 * 86_400_000);
    return {
      remplacantId: REMPLACANT,
      roleTransfereId: '5',
      dateDebut: debut.toISOString(),
      dateFin: fin.toISOString(),
      ...over,
    } as CreateInterimDto;
  };

  it("retient l'utilisateur authentifié comme initiateur quand le body n'en précise pas", async () => {
    const { service, saved } = build({ permsStrictes: [] });
    await service.create(dto(), MOI);
    expect(String(saved[0].initiateurId)).toBe(MOI);
  });

  it("ignore l'initiateurId du body quand il vaut déjà l'utilisateur courant (anti-usurpation)", async () => {
    const { service, authz, saved } = build({ permsStrictes: [] });
    await service.create(dto({ initiateurId: MOI }), MOI);
    expect(String(saved[0].initiateurId)).toBe(MOI);
    // Aucune vérification de INTERIM_DECLARER_TIERS : ce n'est pas un cas « tiers ».
    expect(authz.assertPermissionStrict).not.toHaveBeenCalled();
  });

  it('refuse de déclarer pour un tiers SANS la permission INTERIM_DECLARER_TIERS', async () => {
    const { service, interimRepo } = build({ permsStrictes: [] });
    await expect(service.create(dto({ initiateurId: AUTRE }), MOI)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(interimRepo.save).not.toHaveBeenCalled();
  });

  it('accepte de déclarer pour un tiers AVEC la permission', async () => {
    const { service, authz, saved } = build({ permsStrictes: ['INTERIM_DECLARER_TIERS'] });
    await service.create(dto({ initiateurId: AUTRE }), MOI);
    expect(authz.assertPermissionStrict).toHaveBeenCalledWith(
      MOI,
      'INTERIM_DECLARER_TIERS',
      expect.any(String),
    );
    // L'initiateur enregistré est bien le TIERS, pas celui qui saisit.
    expect(String(saved[0].initiateurId)).toBe(AUTRE);
  });

  it("interdit de se désigner remplaçant d'un intérim déclaré pour autrui (escalade)", async () => {
    const { service, interimRepo } = build({ permsStrictes: ['INTERIM_DECLARER_TIERS'] });
    // « initiateur = quelqu'un d'autre (potentiellement Super Admin), remplaçant = moi »
    await expect(
      service.create(dto({ initiateurId: AUTRE, remplacantId: MOI }), MOI),
    ).rejects.toThrow(/remplaçant/i);
    expect(interimRepo.save).not.toHaveBeenCalled();
  });

  it('autorise le self-service : se déclarer absent en désignant un autre remplaçant', async () => {
    const { service, saved } = build({ permsStrictes: [] });
    await service.create(dto({ remplacantId: REMPLACANT }), MOI);
    expect(String(saved[0].initiateurId)).toBe(MOI);
    expect(String(saved[0].remplacantId)).toBe(REMPLACANT);
  });

  it("évalue les droits délégables sur l'INITIATEUR DÉSIGNÉ, pas sur celui qui saisit", async () => {
    // Piège volontaire : c'est le CRÉATEUR qui possède le rôle 5, pas l'initiateur
    // désigné. Si le contrôle portait sur le créateur, la création passerait — et
    // on délèguerait un rôle que la personne remplacée n'a jamais eu.
    const { service } = build({
      permsStrictes: ['INTERIM_DECLARER_TIERS'],
      admins: [], // personne n'est admin : assertCanDelegate s'applique vraiment
      rolesParUtilisateur: { [MOI]: [{ id: '5' }], [AUTRE]: [{ id: '7' }] },
    });
    await expect(
      service.create(dto({ initiateurId: AUTRE, roleTransfereId: '5' }), MOI),
    ).rejects.toThrow(/rôle que vous possédez/i);
  });

  it("laisse passer un rôle que l'initiateur désigné possède réellement", async () => {
    // Miroir du test précédent : cette fois c'est bien l'initiateur qui a le rôle 5,
    // et le créateur ne l'a pas — la création doit aboutir.
    const { service, saved } = build({
      permsStrictes: ['INTERIM_DECLARER_TIERS'],
      admins: [],
      rolesParUtilisateur: { [MOI]: [{ id: '7' }], [AUTRE]: [{ id: '5' }] },
    });
    await service.create(dto({ initiateurId: AUTRE, roleTransfereId: '5' }), MOI);
    expect(String(saved[0].roleTransfereId)).toBe('5');
  });
});

describe('InterimsService.create — validations métier', () => {
  function service(userActif = true) {
    const authz = {
      assertPermissionStrict: jest.fn(async () => undefined),
      isAdmin: jest.fn(async () => true),
      getEffectiveRoles: jest.fn(async () => []),
      getEffectivePermissions: jest.fn(async () => new Set<string>()),
    };
    return new InterimsService(
      { create: jest.fn((x: any) => x), save: jest.fn(async (x: any) => x) } as any,
      { findOne: jest.fn(async ({ where }: any) => (userActif ? { id: where.id, estActif: true } : null)) } as any,
      { findOne: jest.fn(async () => null) } as any,
      { find: jest.fn(async () => []) } as any,
      authz as any,
    );
  }

  const base = {
    remplacantId: '30',
    roleTransfereId: '5',
    dateDebut: new Date(Date.now() + 86_400_000).toISOString(),
    dateFin: new Date(Date.now() + 2 * 86_400_000).toISOString(),
  } as CreateInterimDto;

  it('refuse une date de début postérieure à la date de fin', async () => {
    await expect(
      service().create({ ...base, dateDebut: base.dateFin, dateFin: base.dateDebut }, '10'),
    ).rejects.toThrow(/antérieure/i);
  });

  it('refuse une date de début dans le passé', async () => {
    await expect(
      service().create({ ...base, dateDebut: new Date(Date.now() - 86_400_000).toISOString() }, '10'),
    ).rejects.toThrow(/passé/i);
  });

  it("exige qu'on précise ce qui est délégué (rôle, profil ou permission)", async () => {
    const { roleTransfereId, ...sansDelegation } = base as any;
    await expect(service().create(sansDelegation, '10')).rejects.toThrow(/Précisez ce qui est délégué/i);
  });

  it('refuse un remplaçant introuvable ou inactif', async () => {
    await expect(service(false).create(base, '10')).rejects.toBeInstanceOf(NotFoundException);
  });
});
