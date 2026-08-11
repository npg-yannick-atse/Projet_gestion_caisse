import { ForbiddenException } from '@nestjs/common';
import { AuthorizationService } from './authorization.service';

/**
 * Cœur du contrôle d'accès : c'est ce service qui décide qui est administrateur,
 * quelles permissions une personne détient et sur quel périmètre elle agit. Une
 * régression ici se propage à TOUTE l'application.
 *
 * Les repositories TypeORM sont simulés : `find` et `createQueryBuilder` sont
 * paramétrés par entité, ce qui permet de faire répondre différemment chaque
 * table sans base de données.
 */

/** QueryBuilder factice : toutes les méthodes chaînent, getRawMany renvoie `rows`. */
function fakeQb(rows: any[]) {
  const qb: any = {};
  for (const m of ['innerJoin', 'leftJoin', 'where', 'andWhere', 'select', 'addSelect', 'groupBy', 'orderBy']) {
    qb[m] = jest.fn(() => qb);
  }
  qb.getRawMany = jest.fn(async () => rows);
  qb.getMany = jest.fn(async () => rows);
  return qb;
}

/**
 * Construit le service avec un DataSource simulé.
 * `parEntite` associe un NOM d'entité à ses réponses : { find, raw }.
 */
function build(parEntite: Record<string, { find?: any[]; raw?: any[] }> = {}) {
  const dataSource: any = {
    getRepository: jest.fn((entity: any) => {
      const conf = parEntite[entity?.name] ?? {};
      return {
        find: jest.fn(async () => conf.find ?? []),
        findOne: jest.fn(async () => (conf.find ?? [])[0] ?? null),
        createQueryBuilder: jest.fn(() => fakeQb(conf.raw ?? [])),
      };
    }),
  };
  return new AuthorizationService(dataSource);
}

describe('AuthorizationService — qui est administrateur', () => {
  const svc = build();

  it('reconnaît SUPER_ADMIN et ADMINISTRATEUR comme admins', () => {
    expect(svc.isAdminCodes(new Set(['SUPER_ADMIN']))).toBe(true);
    expect(svc.isAdminCodes(new Set(['ADMINISTRATEUR']))).toBe(true);
  });

  it("ne considère PAS les autres rôles comme admins", () => {
    for (const r of ['CAISSIER', 'VALIDATEUR', 'DEMANDEUR', 'GESTIONNAIRE_PORTEFEUILLE']) {
      expect(svc.isAdminCodes(new Set([r]))).toBe(false);
    }
  });

  it("ne considère pas le rôle DAF brut comme admin (c'est le dépliage qui le rend admin)", () => {
    // Important : DAF seul n'est pas dans ADMIN_ROLES. Il devient admin uniquement
    // après expansion en ADMINISTRATEUR — cf. getUserRoleCodes.
    expect(svc.isAdminCodes(new Set(['DAF']))).toBe(false);
  });

  it('un ensemble de rôles vide n’est jamais admin', () => {
    expect(svc.isAdminCodes(new Set())).toBe(false);
  });
});

describe('AuthorizationService — dépliage des méta-rôles (DAF)', () => {
  it('déplie DAF en ADMINISTRATEUR + CAISSIER, et conserve DAF', async () => {
    const svc = build({ UserRole: { raw: [{ code: 'DAF' }] } });
    const codes = await svc.getUserRoleCodes('1');
    expect(codes.has('DAF')).toBe(true);
    expect(codes.has('ADMINISTRATEUR')).toBe(true);
    expect(codes.has('CAISSIER')).toBe(true);
  });

  it('rend donc un DAF administrateur au sens du bypass', async () => {
    const svc = build({ UserRole: { raw: [{ code: 'DAF' }] } });
    await expect(svc.isAdmin('1')).resolves.toBe(true);
  });

  it("ne déplie pas un rôle ordinaire", async () => {
    const svc = build({ UserRole: { raw: [{ code: 'CAISSIER' }] } });
    const codes = await svc.getUserRoleCodes('1');
    expect([...codes].sort()).toEqual(['CAISSIER']);
    await expect(svc.isAdmin('1')).resolves.toBe(false);
  });
});

describe('AuthorizationService — assertPermission vs assertPermissionStrict', () => {
  /** Service dont on pilote directement isAdmin et hasPermission. */
  function svcAvec(isAdmin: boolean, perms: string[]) {
    const svc = build();
    jest.spyOn(svc, 'isAdmin').mockResolvedValue(isAdmin);
    jest.spyOn(svc, 'hasPermission').mockImplementation(async (_u, code) => perms.includes(code));
    return svc;
  }

  it('assertPermission laisse passer un admin SANS la permission (bypass)', async () => {
    await expect(svcAvec(true, []).assertPermission('1', 'X_GERER', 'agir')).resolves.toBeUndefined();
  });

  it('assertPermission laisse passer un non-admin QUI a la permission', async () => {
    await expect(
      svcAvec(false, ['X_GERER']).assertPermission('1', 'X_GERER', 'agir'),
    ).resolves.toBeUndefined();
  });

  it('assertPermission refuse un non-admin sans la permission', async () => {
    await expect(svcAvec(false, []).assertPermission('1', 'X_GERER', 'agir')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('assertPermissionStrict refuse un ADMIN sans la permission (aucun bypass)', async () => {
    // C'est ce qui rend AUDIT_VOIR, LEDGER_INTEGRITE et INTERIM_DECLARER réellement
    // opposables aux administrateurs.
    await expect(
      svcAvec(true, []).assertPermissionStrict('1', 'AUDIT_VOIR', 'consulter'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('assertPermissionStrict laisse passer dès lors que la permission est détenue', async () => {
    await expect(
      svcAvec(false, ['AUDIT_VOIR']).assertPermissionStrict('1', 'AUDIT_VOIR', 'consulter'),
    ).resolves.toBeUndefined();
  });

  it("mentionne le code de permission dans le message d'erreur", async () => {
    await expect(svcAvec(false, []).assertPermission('1', 'PAYS_GERER', 'créer un pays')).rejects.toThrow(
      /PAYS_GERER/,
    );
  });
});

describe('AuthorizationService — permissions effectives (3 canaux)', () => {
  it('cumule les permissions issues des rôles, des profils et des extra', async () => {
    const svc = build({
      RolePermission: { raw: [{ code: 'VIA_ROLE' }] },
      ProfilPermission: { raw: [{ code: 'VIA_PROFIL' }] },
      UserPermissionExtra: { raw: [{ code: 'VIA_EXTRA' }] },
      Interim: { find: [] },
    });
    const codes = await svc.getEffectivePermissions('1');
    expect([...codes].sort()).toEqual(['VIA_EXTRA', 'VIA_PROFIL', 'VIA_ROLE']);
  });

  it('déduplique une permission obtenue par plusieurs canaux', async () => {
    const svc = build({
      RolePermission: { raw: [{ code: 'DOUBLON' }] },
      ProfilPermission: { raw: [{ code: 'DOUBLON' }] },
      Interim: { find: [] },
    });
    const codes = await svc.getEffectivePermissions('1');
    expect([...codes]).toEqual(['DOUBLON']);
  });

  it("renvoie un ensemble vide quand l'utilisateur n'a aucun droit", async () => {
    const svc = build({ Interim: { find: [] } });
    expect((await svc.getEffectivePermissions('1')).size).toBe(0);
  });

  it('hasPermission reflète les permissions effectives', async () => {
    const svc = build({ RolePermission: { raw: [{ code: 'BON_CREER' }] }, Interim: { find: [] } });
    await expect(svc.hasPermission('1', 'BON_CREER')).resolves.toBe(true);
    await expect(svc.hasPermission('1', 'BON_VALIDER')).resolves.toBe(false);
  });
});

describe('AuthorizationService — périmètre des natures d’opération', () => {
  it("N'accorde AUCUN bypass admin : la liste blanche s'applique à tous", async () => {
    // Choix assumé du métier : même un SUPER_ADMIN sans nature affectée ne peut en
    // utiliser aucune. Si ce test casse, c'est que le bypass a été réintroduit.
    const svc = build({ UserNatureOperation: { find: [] } });
    jest.spyOn(svc, 'isAdmin').mockResolvedValue(true);
    const perim = await svc.getNatureOperationPerimeter('1');
    expect(perim).not.toBeNull();
    expect(perim!.size).toBe(0);
    await expect(svc.assertNatureInPerimeter('1', '42')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('autorise une nature explicitement affectée', async () => {
    const svc = build({ UserNatureOperation: { find: [{ natureOperationId: '42' }] } });
    await expect(svc.assertNatureInPerimeter('1', '42')).resolves.toBeUndefined();
  });

  it('refuse une nature non affectée', async () => {
    const svc = build({ UserNatureOperation: { find: [{ natureOperationId: '42' }] } });
    await expect(svc.assertNatureInPerimeter('1', '99')).rejects.toThrow(/nature/i);
  });
});

describe('AuthorizationService — périmètre caisses', () => {
  it('un admin n’est pas restreint (null = toutes les caisses)', async () => {
    const svc = build();
    jest.spyOn(svc, 'isAdmin').mockResolvedValue(true);
    await expect(svc.getCaissePerimeter('1')).resolves.toBeNull();
    await expect(svc.assertCaisseInPerimeter('1', '7')).resolves.toBeUndefined();
  });

  /**
   * DÉCISION MÉTIER (11/08/2026) : un caissier n'est pas rattaché à une caisse
   * précise chez NPG. Le cloisonnement par caisse est supprimé — c'est la
   * PERMISSION qui autorise l'action, pas une liste de caisses.
   *
   * Les trois tests précédents verrouillaient la règle inverse (accès ECRITURE
   * ou ADMIN, périmètre vide par défaut). Ils sont remplacés, et non supprimés :
   * la règle a changé, elle doit rester testée.
   *
   * Le contexte de la bascule : `sec_user_caisse_access` n'a jamais pu être
   * alimentée, faute d'écran. Tout non-admin avait donc un périmètre vide et se
   * voyait refuser encaissement, recharge, transfert et paie.
   */
  it('un non-admin n’est pas restreint non plus : le rôle suffit', async () => {
    const svc = build({ UserCaisseAccess: { find: [] } });
    jest.spyOn(svc, 'isAdmin').mockResolvedValue(false);
    await expect(svc.getCaissePerimeter('1')).resolves.toBeNull();
  });

  it('accepte n’importe quelle caisse, y compris sans accès déclaré', async () => {
    const svc = build({ UserCaisseAccess: { find: [] } });
    jest.spyOn(svc, 'isAdmin').mockResolvedValue(false);
    await expect(svc.assertCaisseInPerimeter('1', '9')).resolves.toBeUndefined();
  });

  it('ignore le contenu de sec_user_caisse_access, devenue sans effet', async () => {
    // La table subsiste mais ne gouverne plus rien : y laisser des lignes ne
    // doit surtout pas ré-introduire une restriction en douce.
    const svc = build({
      UserCaisseAccess: { find: [{ caisseId: '1', niveauAcces: 'LECTURE' }] },
    });
    jest.spyOn(svc, 'isAdmin').mockResolvedValue(false);
    await expect(svc.getCaissePerimeter('1')).resolves.toBeNull();
    await expect(svc.assertCaisseInPerimeter('1', '99')).resolves.toBeUndefined();
  });
});

describe('AuthorizationService — périmètre divisions', () => {
  it('un admin accède à toutes les divisions', async () => {
    const svc = build();
    jest.spyOn(svc, 'isAdmin').mockResolvedValue(true);
    await expect(svc.getDivisionPerimeter('1')).resolves.toBeNull();
    await expect(svc.assertDivisionInPerimeter('1', '5')).resolves.toBeUndefined();
  });

  it('un non-admin est limité aux divisions accordées', async () => {
    const svc = build({ UserDivisionAccess: { find: [{ divisionId: '5' }] } });
    jest.spyOn(svc, 'isAdmin').mockResolvedValue(false);
    await expect(svc.assertDivisionInPerimeter('1', '5')).resolves.toBeUndefined();
    await expect(svc.assertDivisionInPerimeter('1', '6')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('AuthorizationService — assertAnyRole', () => {
  it('laisse passer un admin même hors des rôles demandés', async () => {
    const svc = build({ UserRole: { raw: [{ code: 'ADMINISTRATEUR' }] } });
    await expect(svc.assertAnyRole('1', ['CAISSIER'], 'agir')).resolves.toBeDefined();
  });

  it('laisse passer un utilisateur ayant l’un des rôles demandés', async () => {
    const svc = build({ UserRole: { raw: [{ code: 'CAISSIER' }] } });
    await expect(svc.assertAnyRole('1', ['CAISSIER', 'VALIDATEUR'], 'agir')).resolves.toBeDefined();
  });

  it('refuse sinon, en citant les rôles requis', async () => {
    const svc = build({ UserRole: { raw: [{ code: 'DEMANDEUR' }] } });
    await expect(svc.assertAnyRole('1', ['CAISSIER'], 'décaisser')).rejects.toThrow(/CAISSIER/);
  });
});
