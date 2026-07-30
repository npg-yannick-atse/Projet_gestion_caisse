import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
  /** Donnée brute associée (renvoyée dans onChange pour éviter un re-fetch). */
  data?: unknown;
}

/**
 * Liste déroulante AVEC recherche (combobox). Remplace un <select> natif quand
 * les options sont nombreuses (fournisseurs, comptes…). Contrôlé : value + onChange.
 * Rend au plus 100 options filtrées (perf) et invite à affiner au-delà.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = '— Choisir —',
  disabled,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  const shown = filtered.slice(0, 100);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        <span className={selected ? 'truncate' : 'truncate text-muted-foreground'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-[#94A3B8]" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-[rgba(15,76,129,0.15)] bg-white shadow-[0_12px_32px_rgba(15,23,42,0.16)]">
          <div className="flex items-center gap-1.5 border-b border-[rgba(15,76,129,0.08)] px-2.5 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-[#94A3B8]" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher…"
              className="w-full bg-transparent text-xs text-[#0F172A] outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {shown.length === 0 && <div className="px-3 py-3 text-xs text-[#94A3B8]">Aucun résultat.</div>}
            {shown.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[#EFF6FF]',
                  o.value === value && 'bg-[#F0F7FF] font-medium',
                )}
              >
                <Check className={cn('h-3.5 w-3.5 shrink-0', o.value === value ? 'text-[#0F4C81]' : 'text-transparent')} />
                <span className="flex-1 truncate text-[#0F172A]">{o.label}</span>
                {o.hint && <span className="shrink-0 text-[10px] text-[#B45309]">{o.hint}</span>}
              </button>
            ))}
            {filtered.length > shown.length && (
              <div className="px-3 py-1.5 text-[10px] text-[#94A3B8]">
                … {filtered.length - shown.length} de plus — affine la recherche
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Combobox dont la recherche interroge le SERVEUR (base de données) à la frappe,
 * débouncée. Aucun filtrage JS d'une liste préchargée. `selectedLabel` fournit
 * le libellé de la valeur courante (car elle peut ne pas être dans les résultats).
 */
export function RemoteSearchableSelect({
  value,
  selectedLabel,
  onChange,
  fetcher,
  queryKey,
  placeholder = '— Choisir —',
  disabled,
}: {
  value: string;
  selectedLabel?: string;
  onChange: (value: string, option: SelectOption | null) => void;
  fetcher: (query: string) => Promise<SelectOption[]>;
  queryKey: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  const { data: options = [], isFetching } = useQuery({
    queryKey: [queryKey, debounced],
    queryFn: () => fetcher(debounced),
    enabled: open,
    staleTime: 30_000,
  });

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={value ? 'truncate' : 'truncate text-muted-foreground'}>
          {value ? selectedLabel ?? '…' : placeholder}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-[#94A3B8]" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-[rgba(15,76,129,0.15)] bg-white shadow-[0_12px_32px_rgba(15,23,42,0.16)]">
          <div className="flex items-center gap-1.5 border-b border-[rgba(15,76,129,0.08)] px-2.5 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-[#94A3B8]" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher (base de données)…"
              className="w-full bg-transparent text-xs text-[#0F172A] outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {isFetching && <div className="px-3 py-3 text-xs text-[#94A3B8]">Recherche…</div>}
            {!isFetching && options.length === 0 && <div className="px-3 py-3 text-xs text-[#94A3B8]">Aucun résultat.</div>}
            {!isFetching &&
              options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    onChange(o.value, o);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[#EFF6FF]',
                    o.value === value && 'bg-[#F0F7FF] font-medium',
                  )}
                >
                  <Check className={cn('h-3.5 w-3.5 shrink-0', o.value === value ? 'text-[#0F4C81]' : 'text-transparent')} />
                  <span className="flex-1 truncate text-[#0F172A]">{o.label}</span>
                  {o.hint && <span className="shrink-0 text-[10px] text-[#B45309]">{o.hint}</span>}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
