import { useMemo } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import type { SortDir, SortState } from '@/components/SortableHeader';

/**
 * Synchronise l'état de tri (colonne + direction) avec l'URL.
 *
 * - Les params `sortBy` et `sortDir` sont lus depuis la querystring.
 * - L'URL devient la source de vérité (URL partageable, bookmark, navigation).
 * - Le `whitelist` empêche tout tri sur une colonne non autorisée
 *   (sécurité d'autant plus importante que le backend reçoit la valeur en query).
 *
 * Usage :
 *   const sort = useTableSort('/bons', ['numero', 'montant', 'createdAt'] as const);
 *   <SortableHeader column="montant" state={sort.state} onSort={sort.setSort}>Montant</SortableHeader>
 *   useBons({ sortBy: sort.state.by ?? undefined, sortDir: sort.state.dir });
 */
export function useTableSort<TCol extends string>(
  routePath: string,
  whitelist: readonly TCol[],
  defaultSort?: SortState<TCol>,
) {
  const navigate = useNavigate();
  const _href = useRouterState({ select: (s) => s.location.href });

  const state: SortState<TCol> = useMemo(() => {
    const qs = typeof window !== 'undefined' ? window.location.search : '';
    const sp = new URLSearchParams(qs);
    const rawBy = sp.get('sortBy');
    const rawDir = sp.get('sortDir');
    const by =
      rawBy && (whitelist as readonly string[]).includes(rawBy) ? (rawBy as TCol) : null;
    const dir: SortDir = rawDir === 'desc' ? 'desc' : 'asc';
    if (!by && defaultSort) return defaultSort;
    return { by, dir };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_href]);

  const setSort = (next: SortState<TCol>) => {
    const sp = new URLSearchParams(window.location.search);
    if (next.by) {
      sp.set('sortBy', next.by);
      sp.set('sortDir', next.dir);
    } else {
      sp.delete('sortBy');
      sp.delete('sortDir');
    }
    const obj: Record<string, string> = {};
    sp.forEach((v, k) => {
      obj[k] = v;
    });
    navigate({ to: routePath, search: obj as any, replace: true });
  };

  return { state, setSort };
}
