import { BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';

/**
 * Période de validité d'un profil attribué (migration 0061).
 *
 * Un profil était donné définitivement : `date_attribution` dit quand on l'a
 * accordé, jamais jusqu'à quand. Un profil prêté le temps d'un remplacement
 * restait donc actif si on oubliait de le retirer.
 */
function monter(opts: { liens?: any[]; profilExiste?: boolean } = {}) {
  const sauvegardes: any[] = [];
  const service: any = Object.create(UsersService.prototype);

  service.findOne = async () => ({ id: '1' });
  service.profilRepo = {
    findOne: async () => (opts.profilExiste === false ? null : { id: '7', code: 'CAISSE_RENFORT' }),
  };
  service.userProfilRepo = {
    findOne: async () => opts.liens?.[0] ?? null,
    find: async () => opts.liens ?? [],
    create: (x: any) => x,
    save: async (x: any) => {
      sauvegardes.push(x);
      return x;
    },
  };
  service.auditPerm = { logUserProfilChange: async () => undefined };
  return { service, sauvegardes };
}

const PROFIL = { id: '7', code: 'CAISSE_RENFORT', libelle: 'Renfort caisse', estActif: true };

describe('Attribution de profil — période de validité', () => {
  it('refuse une fin antérieure au début', async () => {
    // Le profil ne serait jamais actif : mieux vaut le dire que l'enregistrer.
    const { service } = monter();
    await expect(
      service.assignProfil('1', '7', '9', null, { dateDebut: '2026-09-01', dateFin: '2026-08-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepte une période valide', async () => {
    const { service, sauvegardes } = monter();
    await service.assignProfil('1', '7', '9', null, { dateDebut: '2026-08-01', dateFin: '2026-09-01' });
    expect(sauvegardes[0].dateDebut).toEqual(new Date('2026-08-01'));
    expect(sauvegardes[0].dateFin).toEqual(new Date('2026-09-01'));
  });

  it('sans bornes, le profil est permanent', async () => {
    // C'est le comportement d'avant : ne rien envoyer ne doit rien changer.
    const { service, sauvegardes } = monter();
    await service.assignProfil('1', '7', '9', null);
    expect(sauvegardes[0].dateDebut).toBeNull();
    expect(sauvegardes[0].dateFin).toBeNull();
  });

  it('accepte une fin seule — effectif tout de suite, jusqu’à telle date', async () => {
    const { service, sauvegardes } = monter();
    await service.assignProfil('1', '7', '9', null, { dateFin: '2026-09-01' });
    expect(sauvegardes[0].dateDebut).toBeNull();
    expect(sauvegardes[0].dateFin).toEqual(new Date('2026-09-01'));
  });

  it('MET À JOUR les bornes d’un profil déjà attribué', async () => {
    // Avant, réattribuer sortait sans rien faire. Avec des dates, ce silence
    // ferait croire qu'on a prolongé un profil alors que rien n'a bougé.
    const lien = { userId: '1', profilId: '7', dateDebut: null, dateFin: null };
    const { service, sauvegardes } = monter({ liens: [lien] });
    await service.assignProfil('1', '7', '9', null, { dateFin: '2026-12-31' });
    expect(sauvegardes[0].dateFin).toEqual(new Date('2026-12-31'));
  });

  it('retirer la date de fin d’un profil temporaire le rend permanent', async () => {
    const lien = { userId: '1', profilId: '7', dateDebut: null, dateFin: new Date('2026-09-01') };
    const { service, sauvegardes } = monter({ liens: [lien] });
    await service.assignProfil('1', '7', '9', null, {});
    expect(sauvegardes[0].dateFin).toBeNull();
  });
});

describe('Lecture des profils — statut lisible', () => {
  const hier = new Date(Date.now() - 86_400_000);
  const demain = new Date(Date.now() + 86_400_000);

  it('sans bornes : ACTIF', async () => {
    const { service } = monter({ liens: [{ profil: PROFIL, dateDebut: null, dateFin: null }] });
    const r = await service.getProfils('1');
    expect(r[0].statut).toBe('ACTIF');
  });

  it('période en cours : ACTIF', async () => {
    const { service } = monter({ liens: [{ profil: PROFIL, dateDebut: hier, dateFin: demain }] });
    expect((await service.getProfils('1'))[0].statut).toBe('ACTIF');
  });

  it('début dans le futur : A_VENIR', async () => {
    const { service } = monter({ liens: [{ profil: PROFIL, dateDebut: demain, dateFin: null }] });
    expect((await service.getProfils('1'))[0].statut).toBe('A_VENIR');
  });

  it('fin dépassée : EXPIRE', async () => {
    // Sans ce statut, un profil éteint s'afficherait comme un profil actif et
    // l'administrateur croirait le droit encore accordé.
    const { service } = monter({ liens: [{ profil: PROFIL, dateDebut: null, dateFin: hier }] });
    expect((await service.getProfils('1'))[0].statut).toBe('EXPIRE');
  });

  it('expose les bornes en plus du statut', async () => {
    const { service } = monter({ liens: [{ profil: PROFIL, dateDebut: hier, dateFin: demain }] });
    const r = await service.getProfils('1');
    expect(r[0].dateDebut).toEqual(hier);
    expect(r[0].dateFin).toEqual(demain);
    expect(r[0].code).toBe('CAISSE_RENFORT');
  });

  it('masque toujours les profils désactivés', async () => {
    const { service } = monter({
      liens: [{ profil: { ...PROFIL, estActif: false }, dateDebut: null, dateFin: null }],
    });
    expect(await service.getProfils('1')).toHaveLength(0);
  });
});
