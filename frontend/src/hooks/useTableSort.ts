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
/**
 * Valeur de `sortBy` signifiant « l'utilisateur a explicitement retiré le tri ».
 * Ne doit jamais figurer dans une whitelist de colonnes.
 */
const SANS_TRI = 'none';

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
    // `sortBy` ABSENT           = on arrive sur la page → tri par défaut.
    // `sortBy=none`             = l'utilisateur a choisi « Aucun » → respecté.
    //
    // Sans cette distinction, choisir « Aucun » retirait le paramètre, le défaut
    // revenait au recalcul suivant, et le sélecteur se remettait tout seul sur la
    // colonne par défaut — signalé en test comme « les boutons ne sont pas à
    // jour ». Trois écrans exposent cette option : Utilisateurs, Employés,
    // Natures d'opération.
    //
    // Un marqueur explicite plutôt qu'une chaîne vide : les sérialiseurs de
    // querystring omettent volontiers les valeurs vides, ce qui ramènerait
    // exactement le défaut qu'on corrige. `none` n'est dans aucune whitelist,
    // donc il se résout naturellement en « pas de colonne ».
    if (rawBy === null && defaultSort) return defaultSort;
    return { by, dir };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_href]);

  const setSort = (next: SortState<TCol>) => {
    const sp = new URLSearchParams(window.location.search);
    if (next.by) {
      sp.set('sortBy', next.by);
      sp.set('sortDir', next.dir);
    } else {
      // Marqueur explicite, et non suppression : c'est ce qui distingue « je ne
      // veux aucun tri » de « je n'ai rien demandé », et empêche le défaut de
      // revenir se substituer au choix de l'utilisateur.
      sp.set('sortBy', SANS_TRI);
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
