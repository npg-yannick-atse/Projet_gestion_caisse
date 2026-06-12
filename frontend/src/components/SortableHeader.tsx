import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SortDir = 'asc' | 'desc';

export interface SortState<TCol extends string> {
  by: TCol | null;
  dir: SortDir;
}

interface Props<TCol extends string> {
  /** Identifiant de la colonne (whitelist côté backend). */
  column: TCol;
  /** État actuel du tri (lu depuis l'URL). */
  state: SortState<TCol>;
  /** Callback déclenché au clic — pousse le nouvel état. */
  onSort: (next: SortState<TCol>) => void;
  /** Libellé affiché. */
  children: React.ReactNode;
  /** Alignement (default left). */
  align?: 'left' | 'right' | 'center';
  /** Direction initiale au premier clic (default asc). */
  defaultDir?: SortDir;
}

/**
 * Cellule d'en-tête `<th>` cliquable qui pilote le tri serveur via l'URL.
 *
 * Cycle au clic :
 *   non-trié → asc → desc → non-trié
 *
 * L'icône reflète l'état actuel (chevron neutre / haut / bas).
 */
export function SortableHeader<TCol extends string>({
  column,
  state,
  onSort,
  children,
  align = 'left',
  defaultDir = 'asc',
}: Props<TCol>) {
  const isActive = state.by === column;
  const currentDir = isActive ? state.dir : null;

  const handleClick = () => {
    if (!isActive) {
      onSort({ by: column, dir: defaultDir });
    } else if (state.dir === 'asc') {
      onSort({ by: column, dir: 'desc' });
    } else {
      // 3ᵉ clic : on retire le tri
      onSort({ by: null, dir: 'asc' });
    }
  };

  return (
    <th
      className={cn(
        'px-4 py-2.5 font-semibold select-none',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
      )}
    >
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          'inline-flex items-center gap-1 transition-colors',
          align === 'right' && 'flex-row-reverse',
          isActive ? 'text-[#0F4C81]' : 'text-[#64748B] hover:text-[#0F172A]',
        )}
      >
        <span>{children}</span>
        {currentDir === 'asc' ? (
          <ArrowUp className="h-3 w-3" />
        ) : currentDir === 'desc' ? (
          <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}
