import { useEffect, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Link2, Search } from 'lucide-react';
import {
  useNaturesComptable,
  useCostCenters,
  useCostCentersDeNature,
  useSetCostCentersDeNature,
} from '@/api/referentiel';
import { useMyPermissions } from '@/api/users';
import { useAuthStore } from '@/stores/auth.store';
import type { NatureComptable } from '@/types/api';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { SortableHeader } from '@/components/SortableHeader';
import { useTableSort } from '@/hooks/useTableSort';
import { LiaisonModal } from '@/components/LiaisonModal';

/** Modale « quels centres de coût pour cette nature ». Montée à l'ouverture
 *  seulement, pour que les liens soient chargés à ce moment-là. */
function CentresDeNature({ nature, onFermer }: { nature: NatureComptable; onFermer: () => void }) {
  const { data: tous } = useCostCenters();
  const { data: lies } = useCostCentersDeNature(nature.id);
  const enregistrer = useSetCostCentersDeNature(nature.id);

  return (
    <LiaisonModal
      titre={`Centres de coût — ${nature.libelle}`}
      sousTitre="Une nature peut être imputée à plusieurs centres de coût. La même liaison se retrouve depuis l’écran Centres de coût."
      elements={tous?.map((c) => ({ id: c.id, code: c.code, libelle: c.libelle }))}
      dejaLies={lies?.map((c) => ({ id: c.id, code: c.code, libelle: c.libelle }))}
      enCours={enregistrer.isPending}
      erreur={enregistrer.isError ? enregistrer.error : undefined}
      onEnregistrer={(ids) => enregistrer.mutate(ids, { onSuccess: onFermer })}
      onFermer={onFermer}
    />
  );
}

const PAGE_SIZES = [10, 20, 50, 100] as const;
const NC_SORT_COLUMNS = ['codeComptableSap', 'libelle'] as const;
type NcSortCol = (typeof NC_SORT_COLUMNS)[number];

/**
 * Référentiel des natures comptables = comptes généraux du plan PCGG (extraits de
 * SAP). Consultation seule : ces comptes viennent de SAP, on ne les crée pas ici.
 *
 * Recherche et tri sont exécutés EN BASE (LIKE + ORDER BY) : le catalogue PCGG
 * compte plusieurs centaines de comptes, les filtrer côté client obligeait à tout
 * charger. Seule la pagination reste côté client, sur le jeu déjà filtré.
 */
export function NaturesComptablePage() {
  const sort = useTableSort<NcSortCol>('/natures-comptable', NC_SORT_COLUMNS, {
    by: 'libelle',
    dir: 'asc',
  });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const [liaison, setLiaison] = useState<NatureComptable | null>(null);
  const user = useAuthStore((s) => s.user);
  const { data: perms } = useMyPermissions(user?.id ?? null);
  const peutLier = new Set(perms ?? []).has('NATURE_CC_LIER');

  const { data: natures, isLoading, isError } = useNaturesComptable({
    search: debouncedSearch || undefined,
    sortBy: sort.state.by ?? undefined,
    sortDir: sort.state.by ? sort.state.dir : undefined,
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);

  const filtered = natures ?? [];

  // Retour page 1 quand la recherche ou la taille de page change.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const paged = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  return (
    <div className="flex flex-col gap-4">
      {liaison && <CentresDeNature nature={liaison} onFermer={() => setLiaison(null)} />}

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
                <SortableHeader column="codeComptableSap" state={sort.state} onSort={sort.setSort}>
                  N° compte
                </SortableHeader>
                <SortableHeader column="libelle" state={sort.state} onSort={sort.setSort}>
                  Libellé
                </SortableHeader>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Centres de coût</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-[#64748B]">
                    {search ? 'Aucune nature comptable ne correspond à la recherche.' : 'Aucune nature comptable.'}
                  </td>
                </tr>
              )}
              {paged.map((n) => (
                <tr key={n.id} className="border-t border-[rgba(15,76,129,0.07)] hover:bg-[#FAFBFF]">
                  <td className="px-4 py-3 font-mono font-medium text-[#0F172A]">{n.codeComptableSap ?? '—'}</td>
                  <td className="px-4 py-3 text-[#334155]">{n.libelle}</td>
                  <td className="px-4 py-3 text-right">
                    {peutLier && (
                      <button
                        type="button"
                        onClick={() => setLiaison(n)}
                        title="Rattacher cette nature à des centres de coût"
                        className="inline-flex items-center gap-1 rounded-[7px] border border-[rgba(15,76,129,0.15)] px-2 py-1 text-[10px] font-medium text-[#475569] transition-colors hover:bg-[#EFF6FF] hover:text-[#1A6DB5]"
                      >
                        <Link2 className="h-3 w-3" /> Centres de coût
                      </button>
                    )}
                  </td>
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
