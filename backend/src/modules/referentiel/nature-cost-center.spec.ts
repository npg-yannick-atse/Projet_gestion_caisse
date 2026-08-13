import { ReferentielService } from './referentiel.service';

/**
 * Liaison MULTIPLE nature comptable ↔ centre de coût (migration 0065).
 *
 * L'écran envoie la SÉLECTION COMPLÈTE, pas des ajouts et des retraits un par
 * un : un clic perdu en chemin laisserait sinon la base et l'écran en désaccord.
 * Le service calcule donc la différence, et ne réécrit pas les liens inchangés
 * — sinon `created_at` perdrait son sens à chaque enregistrement.
 */
function monter(existants: string[]) {
  const requetes: Array<{ sql: string; params: any[] }> = [];
  const service: any = Object.create(ReferentielService.prototype);

  service.natureComptableRepo = {
    manager: {
      query: async (sql: string, params: any[]) => {
        requetes.push({ sql, params });
        if (sql.trim().startsWith('SELECT')) return existants.map((id) => ({ id }));
        return [];
      },
    },
  };
  return { service, requetes };
}

const inserts = (r: Array<{ sql: string; params: any[] }>) =>
  r.filter((q) => q.sql.includes('INSERT')).map((q) => String(q.params[1]));
const deletes = (r: Array<{ sql: string; params: any[] }>) =>
  r.filter((q) => q.sql.includes('DELETE')).flatMap((q) => q.params.slice(1).map(String));

describe('Liaison nature ↔ centre de coût — remplacement par ensemble', () => {
  it('ajoute les liens absents', async () => {
    const { service, requetes } = monter([]);
    await service.remplacerLiens('nature_comptable_id', '5', ['1', '2'], '9');
    expect(inserts(requetes).sort()).toEqual(['1', '2']);
    expect(deletes(requetes)).toEqual([]);
  });

  it('retire les liens qui ne sont plus voulus', async () => {
    const { service, requetes } = monter(['1', '2', '3']);
    await service.remplacerLiens('nature_comptable_id', '5', ['2'], '9');
    expect(deletes(requetes).sort()).toEqual(['1', '3']);
    expect(inserts(requetes)).toEqual([]);
  });

  it('ne réécrit PAS un lien inchangé', async () => {
    // Réinsérer écraserait `created_at` : on ne saurait plus depuis quand le
    // lien existe.
    const { service, requetes } = monter(['1', '2']);
    await service.remplacerLiens('nature_comptable_id', '5', ['1', '2'], '9');
    expect(inserts(requetes)).toEqual([]);
    expect(deletes(requetes)).toEqual([]);
  });

  it('gère un ajout et un retrait dans le même appel', async () => {
    const { service, requetes } = monter(['1', '2']);
    await service.remplacerLiens('nature_comptable_id', '5', ['2', '3'], '9');
    expect(inserts(requetes)).toEqual(['3']);
    expect(deletes(requetes)).toEqual(['1']);
  });

  it('une sélection VIDE efface tous les liens', async () => {
    // C'est une valeur légitime — « cette nature n'est plus rattachée à rien » —
    // et non une absence de choix qu'il faudrait ignorer.
    const { service, requetes } = monter(['1', '2']);
    await service.remplacerLiens('nature_comptable_id', '5', [], '9');
    expect(deletes(requetes).sort()).toEqual(['1', '2']);
  });

  it('n’émet aucun DELETE quand il n’y a rien à retirer', async () => {
    const { service, requetes } = monter([]);
    await service.remplacerLiens('nature_comptable_id', '5', ['1'], '9');
    expect(requetes.filter((q) => q.sql.includes('DELETE'))).toHaveLength(0);
  });

  it('fonctionne dans l’AUTRE sens, en inversant les colonnes', async () => {
    // Même table, même code : depuis un centre de coût on choisit ses natures.
    const { service, requetes } = monter([]);
    await service.remplacerLiens('cost_center_id', '7', ['4'], '9');
    const insert = requetes.find((q) => q.sql.includes('INSERT'))!;
    expect(insert.sql).toMatch(/\(cost_center_id, nature_comptable_id, created_by_id\)/);
    expect(insert.params).toEqual(['7', '4', '9']);
  });

  it('compare les identifiants comme des CHAÎNES', async () => {
    // Les identifiants sont des BIGINT : ils arrivent en nombre côté écran et en
    // chaîne depuis la base. Sans normalisation, 1 ≠ '1' et chaque
    // enregistrement supprimerait puis recréerait les mêmes liens.
    const { service, requetes } = monter(['1', '2']);
    await service.remplacerLiens('nature_comptable_id', '5', [1, 2] as any, '9');
    expect(inserts(requetes)).toEqual([]);
    expect(deletes(requetes)).toEqual([]);
  });
});
