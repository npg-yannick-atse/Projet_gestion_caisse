import { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useNaturesComptable } from '@/api/referentiel';
import { Panel, PanelHeader } from '@/components/ui/panel';

const PAGE_SIZES = [10, 20, 50, 100] as const;

/**
 * Référentiel des natures comptables = comptes généraux du plan PCGG (extraits de
 * SAP). Consultation seule : ces comptes viennent de SAP, on ne les crée pas ici.
 */
export function NaturesComptablePage() {
  const { data: natures, isLoading, isError } = useNaturesComptable();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = natures ?? [];
    if (!q) return list;
    return list.filter(
      (n) => (n.codeComptableSap ?? '').toLowerCase().includes(q) || n.libelle.toLowerCase().includes(q),
    );
  }, [natures, search]);

  // Retour page 1 quand la recherche ou la taille de page change.
  useEffect(() => {
    setPage(1);
  }, [search, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const paged = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <PanelHeader title="Plan comptable (PCGG)" badge={`${natures?.length ?? 0}`}>
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-[#94A3B8]">
            <BookOpen className="h-3.5 w-3.5" /> Comptes généraux SAP — catalogue de référence
          </span>
        </PanelHeader>

        <div className="flex flex-wrap items-center gap-2 border-b border-[rgba(15,76,129,0.07)] px-[18px] py-3">
          <Search className="h-4 w-4 text-[#64748B]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher (n° de compte ou libellé)…"
            className="w-72 rounded-[9px] border border-[rgba(15,76,129,0.12)] bg-white px-3 py-1.5 text-xs text-[#0F172A] outline-none focus:border-[#1A6DB5]"
          />
          <label className="ml-auto flex items-center gap-1.5 text-[11px] text-[#64748B]">
            Afficher
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-[7px] border border-[rgba(15,76,129,0.12)] bg-white px-2 py-1 text-xs text-[#0F172A] outline-none focus:border-[#1A6DB5]"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            par page
          </label>
          <span className="text-[11px] text-[#64748B]">
            {filtered.length} résultat{filtered.length > 1 ? 's' : ''}
          </span>
        </div>

        {isLoading && <div className="px-[18px] py-8 text-sm text-[#64748B]">Chargement…</div>}
        {isError && <div className="px-[18px] py-8 text-sm text-[#EF4444]">Impossible de charger les natures comptables.</div>}

        {natures && (
          <table className="w-full text-xs">
            <thead className="bg-[#F8FAFC]">
              <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
                <th className="px-4 py-2.5 font-semibold">N° compte</th>
                <th className="px-4 py-2.5 font-semibold">Libellé</th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-10 text-center text-[#64748B]">
                    {search ? 'Aucune nature comptable ne correspond à la recherche.' : 'Aucune nature comptable.'}
                  </td>
                </tr>
              )}
              {paged.map((n) => (
                <tr key={n.id} className="border-t border-[rgba(15,76,129,0.07)] hover:bg-[#FAFBFF]">
                  <td className="px-4 py-3 font-mono font-medium text-[#0F172A]">{n.codeComptableSap ?? '—'}</td>
                  <td className="px-4 py-3 text-[#334155]">{n.libelle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {filtered.length > pageSize && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[rgba(15,76,129,0.07)] px-4 py-2.5 text-xs">
            <span className="text-[#64748B]">
              {(pageSafe - 1) * pageSize + 1}–{Math.min(pageSafe * pageSize, filtered.length)} sur {filtered.length}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pageSafe <= 1}
                className="inline-flex h-7 items-center gap-1 rounded-[7px] border border-[rgba(15,76,129,0.15)] px-2 font-medium text-[#475569] hover:bg-[#F1F5F9] disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Précédent
              </button>
              <span className="px-1 text-[#64748B]">
                Page {pageSafe} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={pageSafe >= totalPages}
                className="inline-flex h-7 items-center gap-1 rounded-[7px] border border-[rgba(15,76,129,0.15)] px-2 font-medium text-[#475569] hover:bg-[#F1F5F9] disabled:opacity-40"
              >
                Suivant <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
