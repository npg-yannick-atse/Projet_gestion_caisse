import { ConflictException } from '@nestjs/common';
import { CaissesService } from './caisses.service';

/**
 * Unicité du code : le contrôle applicatif doit voir ce que la base refuse.
 *
 * `deleted_at` est un `@DeleteDateColumn` : TypeORM masque les lignes
 * soft-deleted par défaut. Les contraintes UNIQUE, elles, les comptent. Le
 * garde-fou laissait donc passer le code d'une caisse supprimée, et la base
 * répondait par une erreur SQL brute affichée telle quelle à l'écran :
 *
 *   « Violation of UNIQUE KEY constraint 'UQ_fin_caisse_code'.
 *     Cannot insert duplicate key ... (CAT_CAISSIER). »
 *
 * Constaté en test le 10/08/2026 : une caisse CAT_CAISSIER supprimée le 05/08
 * empêchait toute recréation sous ce code.
 */
function monter(trouvee: any) {
  const optionsVues: any[] = [];
  const repo = {
    findOne: async (opts: any) => {
      optionsVues.push(opts);
      return trouvee;
    },
    create: (x: any) => x,
    save: async (x: any) => ({ ...x, id: '99' }),
  };
  const service = new CaissesService(repo as any, {} as any, {} as any, {} as any);
  return { service, optionsVues };
}

const dto = { code: 'CAT_CAISSIER', libelle: 'Categorie Caissier', deviseId: '1' } as any;

describe('CaissesService.create — code déjà pris', () => {
  it('interroge la base SANS masquer les lignes supprimées', async () => {
    const { service, optionsVues } = monter(null);
    await service.create(dto, '1');
    expect(optionsVues[0].withDeleted).toBe(true);
  });

  it('refuse un code encore occupé par une caisse SUPPRIMÉE, avec un message clair', async () => {
    const { service } = monter({ id: '5', code: 'CAT_CAISSIER', deletedAt: new Date('2026-08-05') });
    await expect(service.create(dto, '1')).rejects.toThrow(ConflictException);
    // Le message doit dire que la caisse est supprimée : « existe déjà » serait
    // incompréhensible pour quelqu'un qui vient justement de la supprimer.
    await expect(service.create(dto, '1')).rejects.toThrow(/supprimée/);
  });

  it('refuse un code pris par une caisse ACTIVE, avec le message habituel', async () => {
    const { service } = monter({ id: '5', code: 'CAT_CAISSIER', deletedAt: null });
    await expect(service.create(dto, '1')).rejects.toThrow(/existe déjà/);
  });

  it('accepte un code libre', async () => {
    const { service } = monter(null);
    await expect(service.create(dto, '1')).resolves.toMatchObject({ code: 'CAT_CAISSIER' });
  });
});
