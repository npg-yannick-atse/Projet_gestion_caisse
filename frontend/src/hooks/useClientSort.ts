import { useMemo } from 'react';
import type { SortState } from '@/components/SortableHeader';

/**
 * Valeur comparable extraite d'une ligne. `null`/`undefined` = valeur absente,
 * toujours renvoyée en fin de liste quel que soit le sens du tri (une case vide
 * n'est ni « petite » ni « grande », la remonter en tête serait trompeur).
 */
export type SortValue = string | number | Date | null | undefined;

/** Comment lire chaque colonne triable d'un tableau. */
export type SortAccessors<T, TCol extends string> = Record<TCol, (row: T) => SortValue>;

function normaliser(v: SortValue): { vide: boolean; num?: number; txt?: string } {
  if (v === null || v === undefined || v === '') return { vide: true };
  if (v instanceof Date) return { vide: false, num: v.getTime() };
  if (typeof v === 'number') return { vide: false, num: Number.isNaN(v) ? undefined : v };
  return { vide: false, txt: String(v) };
}

/**
 * Compare deux valeurs RENSEIGNÉES. Le cas des valeurs absentes est traité en
 * amont, avant l'application du sens du tri : sinon inverser le tri renverrait
 * aussi les cases vides en tête de liste.
 */
function comparer(na: ReturnType<typeof normaliser>, nb: ReturnType<typeof normaliser>): number {
  if (na.num !== undefined && nb.num !== undefined) return na.num - nb.num;
  // Comparaison de texte en français : « École » se range avec « Ecole », et
  // « Article 2 » avant « Article 10 » grâce à numeric.
  return String(na.txt ?? na.num).localeCompare(String(nb.txt ?? nb.num), 'fr', {
    numeric: true,
    sensitivity: 'base',
  });
}

/**
 * Trie une liste CÔTÉ ÉCRAN, selon l'état de tri porté par l'URL.
 *
 * Réservé aux tableaux dont l'intégralité des lignes est déjà chargée : listes
 * courtes (rôles, profils, paramètres) ou jeux déjà filtrés. Pour une liste
 * paginée ou tronquée côté serveur, trier ici ne trierait que la portion
 * visible — il faut alors un tri en base (cf. `useTableSort` + paramètres
 * `sortBy`/`sortDir` de l'API).
 *
 * Le tri est stable : à valeurs égales, l'ordre d'origine est conservé.
 */
export function useClientSort<T, TCol extends string>(
  rows: T[] | undefined,
  state: SortState<TCol>,
  accessors: SortAccessors<T, TCol>,
): T[] {
  return useMemo(() => {
    const base = rows ?? [];
    const lire = state.by ? accessors[state.by] : undefined;
    if (!lire) return base;
    const signe = state.dir === 'desc' ? -1 : 1;
    // `map` produit une nouvelle liste : la source n'est jamais réordonnée.
    // L'index `i` sert de départage explicite ; `Array.prototype.sort` étant
    // déjà stable (ES2019), il ne change rien en pratique et documente juste
    // l'intention — à valeurs égales, l'ordre d'arrivée est conservé.
    return base
      .map((row, i) => ({ row, i, v: normaliser(lire(row)) }))
      .sort((a, b) => {
        // Les cases vides finissent toujours en bas, dans les DEUX sens : une
        // valeur absente n'est ni la plus grande ni la plus petite.
        if (a.v.vide || b.v.vide) {
          if (a.v.vide && b.v.vide) return a.i - b.i;
          return a.v.vide ? 1 : -1;
        }
        return comparer(a.v, b.v) * signe || a.i - b.i;
      })
      .map((x) => x.row);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, state.by, state.dir]);
}
