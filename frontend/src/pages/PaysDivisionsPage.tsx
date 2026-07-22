import { useEffect, useState } from 'react';
import { Globe, MapPin, Plus, PowerOff, Search, Trash2 } from 'lucide-react';
import {
  usePays,
  useCreatePays,
  useDeletePays,
  useDivisions,
  useCreateDivision,
  useDeleteDivision,
} from '@/api/referentiel';
import { apiErrorMessage, cn } from '@/lib/utils';
import type { Division, Pays } from '@/types/api';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { ConfirmDialog } from '@/components/ConfirmDialog';

const inputClass =
  'h-9 w-full rounded-[9px] border border-[rgba(15,76,129,0.15)] bg-white px-3 text-xs text-[#0F172A] outline-none focus:border-[#1A6DB5]';

export function PaysDivisionsPage() {
  // Recherche des pays exécutée EN BASE (debounce) ; pagination client sur le résultat.
  const [paysSearch, setPaysSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(paysSearch), 300);
    return () => clearTimeout(t);
  }, [paysSearch]);

  const { data: pays } = usePays({ search: debouncedSearch || undefined });
  const createPays = useCreatePays();
  const deletePays = useDeletePays();
  const [selectedPays, setSelectedPays] = useState<string | null>(null);

  const { data: divisions } = useDivisions(selectedPays ?? undefined);
  const createDivision = useCreateDivision();
  const deleteDivision = useDeleteDivision();

  const [pCode, setPCode] = useState('');
  const [pLib, setPLib] = useState('');
  const [dLib, setDLib] = useState('');
  const [confirmPays, setConfirmPays] = useState<Pays | null>(null);
  const [confirmDiv, setConfirmDiv] = useState<Division | null>(null);

  // Pagination client sur la liste déjà filtrée par le serveur.
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const filteredPays = pays ?? [];
  const totalPages = Math.max(1, Math.ceil(filteredPays.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagePays = filteredPays.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, pageSize]);

  const addPays = () => {
    if (!pCode.trim() || !pLib.trim()) return;
    createPays.mutate(
      { code: pCode.trim(), libelle: pLib.trim() },
      { onSuccess: () => { setPCode(''); setPLib(''); } },
    );
  };

  const addDivision = () => {
    if (!selectedPays || !dLib.trim()) return;
    createDivision.mutate(
      { libelle: dLib.trim(), paysId: selectedPays },
      { onSuccess: () => setDLib('') },
    );
  };

  const selectedPaysLabel = pays?.find((p) => p.id === selectedPays)?.libelle;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Pays */}
      <Panel>
        <PanelHeader
          title={
            <span className="inline-flex items-center gap-2">
              <Globe className="h-4 w-4 text-[#1A6DB5]" /> Pays
            </span>
          }
          badge={`${pays?.length ?? 0}`}
        />
        <div className="flex flex-wrap items-end gap-2 border-b border-[rgba(15,76,129,0.07)] p-[18px]">
          <div className="w-24">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.6px] text-[#64748B]">Code</label>
            <input className={inputClass} value={pCode} onChange={(e) => setPCode(e.target.value)} placeholder="CI" />
          </div>
          <div className="min-w-[160px] flex-1">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.6px] text-[#64748B]">Libellé</label>
            <input className={inputClass} value={pLib} onChange={(e) => setPLib(e.target.value)} placeholder="Côte d'Ivoire" />
          </div>
          <button
            type="button"
            onClick={addPays}
            disabled={createPays.isPending}
            className="inline-flex h-9 items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-3 text-xs font-medium text-white hover:bg-[#1A6DB5] disabled:opacity-60"
          >
            <Plus className="h-4 w-4" /> Ajouter
          </button>
          {createPays.isError && (
            <p className="w-full text-xs text-[#EF4444]">{apiErrorMessage(createPays.error, 'Création impossible')}</p>
          )}
        </div>

        {/* Recherche + taille de page */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[rgba(15,76,129,0.07)] px-[18px] py-2.5">
          <div className="relative min-w-[160px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#94A3B8]" />
            <input
              value={paysSearch}
              onChange={(e) => setPaysSearch(e.target.value)}
              placeholder="Rechercher un pays (code ou nom)…"
              className="h-9 w-full rounded-[9px] border border-[rgba(15,76,129,0.12)] bg-white pl-8 pr-3 text-xs text-[#0F172A] outline-none focus:border-[#1A6DB5]"
            />
          </div>
          <select
            aria-label="Pays par page"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="h-9 rounded-[9px] border border-[rgba(15,76,129,0.12)] bg-white px-2 text-xs text-[#0F172A] outline-none focus:border-[#1A6DB5]"
          >
            {[10, 20, 50].map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
        </div>

        <div className="divide-y divide-[rgba(15,76,129,0.06)]">
          {filteredPays.length === 0 && (
            <div className="px-[18px] py-6 text-center text-xs text-[#94A3B8]">
              {paysSearch ? 'Aucun pays pour cette recherche.' : 'Aucun pays.'}
            </div>
          )}
          {pagePays.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedPays(p.id)}
              className={cn(
                'flex w-full items-center gap-2 px-[18px] py-2.5 text-left text-xs transition-colors',
                selectedPays === p.id ? 'bg-[#E8F2FF]' : 'hover:bg-[#FAFBFF]',
              )}
            >
              <span className="font-mono text-[#1A6DB5]">{p.code}</span>
              <span className="flex-1 font-medium text-[#0F172A]">{p.libelle}</span>
              <span
                role="button"
                tabIndex={0}
                aria-label="Désactiver"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmPays(p);
                }}
                className="inline-flex h-6 w-6 items-center justify-center rounded-[6px] text-[#94A3B8] hover:bg-[#FFFBEB] hover:text-[#92400E]"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </span>
            </button>
          ))}
        </div>

        {filteredPays.length > 0 && (
          <div className="flex items-center justify-between gap-2 border-t border-[rgba(15,76,129,0.07)] px-[18px] py-2.5 text-xs text-[#64748B]">
            <span>
              {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredPays.length)} sur{' '}
              {filteredPays.length}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="rounded-[7px] border border-[rgba(15,76,129,0.12)] px-2 py-1 font-medium text-[#475569] hover:bg-[#F1F5F9] disabled:opacity-40"
              >
                Précédent
              </button>
              <span className="px-1">
                Page {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="rounded-[7px] border border-[rgba(15,76,129,0.12)] px-2 py-1 font-medium text-[#475569] hover:bg-[#F1F5F9] disabled:opacity-40"
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </Panel>

      {/* Divisions du pays sélectionné */}
      <Panel>
        <PanelHeader
          title={
            <span className="inline-flex items-center gap-2">
              <MapPin className="h-4 w-4 text-[#047857]" /> Divisions {selectedPaysLabel ? `· ${selectedPaysLabel}` : ''}
            </span>
          }
          badge={selectedPays ? `${divisions?.length ?? 0}` : undefined}
        />
        {!selectedPays ? (
          <div className="px-[18px] py-10 text-center text-sm text-[#64748B]">
            Sélectionnez un pays à gauche pour gérer ses divisions.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-2 border-b border-[rgba(15,76,129,0.07)] p-[18px]">
              <div className="min-w-[200px] flex-1">
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.6px] text-[#64748B]">
                  Nom de la division
                </label>
                <input
                  className={inputClass}
                  value={dLib}
                  onChange={(e) => setDLib(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addDivision();
                  }}
                  placeholder="Ex : Abidjan"
                />
              </div>
              <button
                type="button"
                onClick={addDivision}
                disabled={createDivision.isPending}
                className="inline-flex h-9 items-center gap-1.5 rounded-[9px] bg-[#047857] px-3 text-xs font-medium text-white hover:bg-[#059669] disabled:opacity-60"
              >
                <Plus className="h-4 w-4" /> Affecter
              </button>
              {createDivision.isError && (
                <p className="w-full text-xs text-[#EF4444]">{apiErrorMessage(createDivision.error, 'Création impossible')}</p>
              )}
            </div>
            <div className="divide-y divide-[rgba(15,76,129,0.06)]">
              {(divisions ?? []).length === 0 && (
                <div className="px-[18px] py-6 text-center text-xs text-[#94A3B8]">Aucune division pour ce pays.</div>
              )}
              {(divisions ?? []).map((d) => (
                <div key={d.id} className="flex items-center gap-2 px-[18px] py-2.5 text-xs">
                  <span className="font-mono text-[#047857]">{d.code}</span>
                  <span className="flex-1 font-medium text-[#0F172A]">{d.libelle}</span>
                  <button
                    type="button"
                    aria-label="Désactiver"
                    onClick={() => setConfirmDiv(d)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-[6px] text-[#94A3B8] hover:bg-[#FFFBEB] hover:text-[#92400E]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </Panel>

      <ConfirmDialog
        open={!!confirmPays}
        variant="warning"
        icon={PowerOff}
        title={confirmPays ? `Désactiver le pays ${confirmPays.code} ?` : ''}
        description={
          confirmPays
            ? `« ${confirmPays.libelle} » n'apparaîtra plus dans les listes. Rien n'est supprimé définitivement.`
            : undefined
        }
        confirmLabel="Désactiver"
        busy={deletePays.isPending}
        error={deletePays.isError ? apiErrorMessage(deletePays.error, 'Désactivation impossible') : undefined}
        onCancel={() => {
          setConfirmPays(null);
          deletePays.reset();
        }}
        onConfirm={() => {
          if (confirmPays) deletePays.mutate(confirmPays.id, { onSuccess: () => setConfirmPays(null) });
        }}
      />

      <ConfirmDialog
        open={!!confirmDiv}
        variant="warning"
        icon={PowerOff}
        title={confirmDiv ? `Désactiver la division ${confirmDiv.code} ?` : ''}
        description={
          confirmDiv
            ? `« ${confirmDiv.libelle} » ne sera plus sélectionnable pour les restitutions. Rien n'est supprimé définitivement.`
            : undefined
        }
        confirmLabel="Désactiver"
        busy={deleteDivision.isPending}
        error={deleteDivision.isError ? apiErrorMessage(deleteDivision.error, 'Désactivation impossible') : undefined}
        onCancel={() => {
          setConfirmDiv(null);
          deleteDivision.reset();
        }}
        onConfirm={() => {
          if (confirmDiv) deleteDivision.mutate(confirmDiv.id, { onSuccess: () => setConfirmDiv(null) });
        }}
      />
    </div>
  );
}
