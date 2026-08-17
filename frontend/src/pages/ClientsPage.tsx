import { useEffect, useState } from 'react';
import { Building2, ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react';
import { usePartenaires, usePays } from '@/api/referentiel';
import { useSyncClientsSap } from '@/api/sap';
import { useMyPermissions } from '@/api/users';
import { useAuthStore } from '@/stores/auth.store';
import { apiErrorMessage, cn } from '@/lib/utils';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { SortableHeader } from '@/components/SortableHeader';
import { useTableSort } from '@/hooks/useTableSort';
import { RoleGuard } from '@/components/RoleGuard';
import { ConfirmDialog } from '@/components/ConfirmDialog';

const PAGE_SIZES = [20, 50, 100] as const;
const CLI_SORT_COLUMNS = ['code', 'raisonSociale'] as const;
type CliSortCol = (typeof CLI_SORT_COLUMNS)[number];

/**
 * Référentiel des CLIENTS, alimenté depuis SAP (table KNA1).
 *
 * Les clients ne se créent pas ici : ils viennent de SAP et sont importés pour
 * être disponibles hors ligne et servir les sélecteurs de l'application. La
 * synchronisation n'ajoute que les manquants — elle n'écrase jamais une fiche
 * existante, qui a pu être complétée côté application.
 */
function ClientsPageInner() {
  const currentUser = useAuthStore((s) => s.user);
  const { data: myPerms } = useMyPermissions(currentUser?.id ?? null);
  /**
   * Le partenaire ne porte que le CODE ISO du pays (LAND1 de SAP). Le nom vient
   * du référentiel : « CI » ne dit rien à qui lit la liste, « Côte d'Ivoire »
   * si. On garde les deux colonnes, le code restant la clé d'échange avec SAP.
   */
  const { data: pays } = usePays();
  const nomPays = (code?: string | null) =>
    (pays ?? []).find((p) => p.code === code)?.libelle ?? null;
  const peutSynchroniser = (myPerms ?? []).includes('SAP_SYNCHRONISER');

  const sort = useTableSort<CliSortCol>('/clients', CLI_SORT_COLUMNS, {
    by: 'raisonSociale',
    dir: 'asc',
  });
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Recherche et tri exécutés en base ; seule la pagination reste côté client.
  const { data: clients, isLoading, isError } = usePartenaires({
    type: 'CLIENT',
    search: debounced || undefined,
    sortBy: sort.state.by ?? undefined,
    sortDir: sort.state.by ? sort.state.dir : undefined,
  });

  const sync = useSyncClientsSap();
  const [confirmSync, setConfirmSync] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);
  useEffect(() => {
    setPage(1);
  }, [debounced, pageSize]);

  const liste = clients ?? [];
  const totalPages = Math.max(1, Math.ceil(liste.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const paged = liste.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <PanelHeader title="Clients" badge={`${liste.length}`}>
          {peutSynchroniser && (
            <button
              type="button"
              onClick={() => setConfirmSync(true)}
              disabled={sync.isPending}
              className="ml-auto flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-3.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-[#1A6DB5] disabled:opacity-60"
            >
              <RefreshCw className={cn('h-4 w-4', sync.isPending && 'animate-spin')} />
              {sync.isPending ? 'Synchronisation…' : 'Synchroniser depuis SAP'}
            </button>
          )}
        </PanelHeader>

        {sync.isSuccess && (
          <div className="border-b border-[rgba(15,76,129,0.07)] bg-[#ECFDF5] px-[18px] py-2.5 text-xs text-[#047857]">
            {sync.data.ajoutes === 0
              ? `Aucun nouveau client — les ${sync.data.totalSap} clients de SAP sont déjà enregistrés.`
              : `${sync.data.ajoutes} client(s) ajouté(s) sur ${sync.data.totalSap} présents dans SAP.`}
          </div>
        )}
        {sync.isError && (
          <div className="border-b border-[rgba(15,76,129,0.07)] bg-[#FEF3F2] px-[18px] py-2.5 text-xs text-[#B42318]">
            {apiErrorMessage(sync.error, 'Synchronisation impossible')}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-b border-[rgba(15,76,129,0.07)] px-[18px] py-3">
          <Search className="h-4 w-4 text-[#64748B]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher (code, nom du client)…"
            className="w-80 rounded-[9px] border border-[rgba(15,76,129,0.12)] bg-white px-3 py-1.5 text-xs text-[#0F172A] outline-none focus:border-[#1A6DB5]"
          />
          <label className="ml-auto flex items-center gap-1.5 text-[11px] text-[#64748B]">
            Afficher
            <select
              aria-label="Clients par page"
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
        </div>

        {isLoading && <div className="px-[18px] py-8 text-sm text-[#64748B]">Chargement…</div>}
        {isError && (
          <div className="px-[18px] py-8 text-sm text-[#EF4444]">Impossible de charger les clients.</div>
        )}

        {clients && (
          <table className="w-full text-xs">
            <thead className="bg-[#F8FAFC]">
              <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
                <SortableHeader column="code" state={sort.state} onSort={sort.setSort}>
                  Code client
                </SortableHeader>
                <SortableHeader column="raisonSociale" state={sort.state} onSort={sort.setSort}>
                  Nom client
                </SortableHeader>
                <th className="px-4 py-2.5 font-semibold">Pays</th>
                <th className="px-4 py-2.5 font-semibold">Code pays</th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-[#64748B]">
                    <div className="mb-2 flex justify-center text-[#94A3B8]">
                      <Building2 className="h-8 w-8" />
                    </div>
                    {search
                      ? 'Aucun client ne correspond à la recherche.'
                      : peutSynchroniser
                        ? 'Aucun client enregistré. Lancez la synchronisation depuis SAP.'
                        : 'Aucun client enregistré.'}
                  </td>
                </tr>
              )}
              {paged.map((c) => (
                <tr key={c.id} className="border-t border-[rgba(15,76,129,0.07)] hover:bg-[#FAFBFF]">
                  <td className="px-4 py-3 font-mono text-[#1A6DB5]">{c.code}</td>
                  <td className="px-4 py-3 font-medium text-[#0F172A]">{c.raisonSociale}</td>
                  <td className="px-4 py-3 text-[#475569]">{nomPays(c.pays) ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-[#64748B]">{c.pays ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {liste.length > pageSize && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[rgba(15,76,129,0.07)] px-4 py-2.5 text-xs">
            <span className="text-[#64748B]">
              {(pageSafe - 1) * pageSize + 1}–{Math.min(pageSafe * pageSize, liste.length)} sur {liste.length}
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

      {/* La synchronisation écrit en base et ne se défait pas d'un clic : elle
          mérite qu'on la demande deux fois. */}
      <ConfirmDialog
        open={confirmSync}
        variant="default"
        icon={RefreshCw}
        title="Synchroniser les clients depuis SAP ?"
        description={
          <>
            Les clients de SAP absents d'ici seront <strong>ajoutés</strong>. Rien n'est modifié
            ni supprimé : un client déjà présent est laissé tel quel, y compris si son nom a
            changé dans SAP.
            <br />
            <br />
            Les clients <strong>marqués supprimés dans SAP sont écartés</strong>.
          </>
        }
        confirmLabel="Synchroniser"
        busy={sync.isPending}
        error={sync.isError ? apiErrorMessage(sync.error, 'Synchronisation impossible') : undefined}
        onCancel={() => {
          setConfirmSync(false);
          sync.reset();
        }}
        onConfirm={() => sync.mutate(undefined, { onSuccess: () => setConfirmSync(false) })}
      />
    </div>
  );
}

export function ClientsPage() {
  return (
    <RoleGuard allow={['ADMINISTRATEUR', 'SUPER_ADMIN']} permission="PARTENAIRE_GERER">
      <ClientsPageInner />
    </RoleGuard>
  );
}
