import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronLeft, ChevronRight, Link2, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useSyncComptesSap } from '@/api/sap';
import {
  useNaturesOperation,
  useCreateNatureOperation,
  useUpdateNatureOperation,
  useDeleteNatureOperation,
  useCostCenters,
  usePlanComptable,
  useLiaisonsNatureCostCenter,
  useCostCentersDeNatureOperation,
  useSetCostCentersDeNatureOperation,
} from '@/api/referentiel';
import { useMyPermissions } from '@/api/users';
import { useAuthStore } from '@/stores/auth.store';
import { LiaisonModal } from '@/components/LiaisonModal';
import { apiErrorMessage } from '@/lib/utils';
import type { NatureOperation } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { RoleGuard } from '@/components/RoleGuard';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SortableHeader } from '@/components/SortableHeader';
import { useTableSort } from '@/hooks/useTableSort';

const NO_SORT_COLUMNS = ['code', 'libelle'] as const;
type NoSortCol = (typeof NO_SORT_COLUMNS)[number];

const PAGE_SIZES = [10, 20, 50] as const;

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const schema = z.object({
  code: z.string().trim().min(1, 'Requis'),
  libelle: z.string().trim().min(1, 'Requis'),
  costCenterId: z.string().optional(),
  planComptableId: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

/** Formulaire création/édition. `editing` non nul → mode modification. */
function NatureForm({ editing, onDone }: { editing: NatureOperation | null; onDone: () => void }) {
  const create = useCreateNatureOperation();
  const update = useUpdateNatureOperation();
  const { data: costCenters } = useCostCenters();
  const { data: planComptable } = usePlanComptable();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: editing?.code ?? '',
      libelle: editing?.libelle ?? '',
      costCenterId: editing?.costCenterId ?? '',
      planComptableId: editing?.planComptableId ?? '',
    },
  });

  const pending = create.isPending || update.isPending;
  const error = create.error || update.error;

  const onSubmit = handleSubmit((values) => {
    const payload = {
      code: values.code,
      libelle: values.libelle,
      costCenterId: values.costCenterId || undefined,
      planComptableId: values.planComptableId || undefined,
    };
    const opts = { onSuccess: () => onDone() };
    if (editing) update.mutate({ id: editing.id, payload }, opts);
    else create.mutate(payload, opts);
  });

  return (
    <Panel>
      <PanelHeader title={editing ? `Modifier — ${editing.code}` : 'Nouvelle nature comptable'} />
      <form onSubmit={onSubmit} className="grid gap-4 p-[18px] sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="code">Code</Label>
          <Input id="code" {...register('code')} />
          {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="libelle">Libellé</Label>
          <Input id="libelle" {...register('libelle')} />
          {errors.libelle && <p className="text-sm text-destructive">{errors.libelle.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="costCenterId">Centre de coût par défaut (optionnel)</Label>
          <select id="costCenterId" className={selectClass} {...register('costCenterId')}>
            <option value="">— Aucun —</option>
            {costCenters?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.libelle}
              </option>
            ))}
          </select>
        </div>
        {/* Le sélecteur « compte PCGG » a disparu : depuis la fusion des deux
            référentiels (migration 0070), la nature EST le compte. Elle ne peut
            plus se rattacher à un autre — elle se désignerait elle-même. Le
            champ « Code » ci-dessus porte ce compte. */}
        <div className="hidden">
          {/* Ancien « compte du plan interne » conservé mais masqué (déprécié au profit du compte PCGG). */}
          <select {...register('planComptableId')}>
            <option value="">—</option>
            {planComptable?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.numeroCompte} — {p.libelle}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Créer'}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Annuler
          </Button>
          {error && (
            <p className="text-sm text-destructive">{apiErrorMessage(error, 'Enregistrement impossible')}</p>
          )}
        </div>
      </form>
    </Panel>
  );
}

/** « Quels centres de coût pour cette nature ». Le sens inverse vit sur l'écran
 *  Centres de coût, et lit la même table. */
function CentresDeNature({ nature, onFermer }: { nature: NatureOperation; onFermer: () => void }) {
  const { data: tous } = useCostCenters();
  const { data: lies } = useCostCentersDeNatureOperation(nature.id);
  const enregistrer = useSetCostCentersDeNatureOperation(nature.id);

  return (
    <LiaisonModal
      titre={`Centres de coût — ${nature.code}`}
      sousTitre="Une nature peut être imputée à plusieurs centres de coût. On retrouve la même liaison depuis l’écran Centres de coût."
      elements={tous?.map((c) => ({ id: c.id, code: c.code, libelle: c.libelle }))}
      dejaLies={lies?.map((c) => ({ id: c.id, code: c.code, libelle: c.libelle }))}
      enCours={enregistrer.isPending}
      erreur={enregistrer.isError ? enregistrer.error : undefined}
      onEnregistrer={(ids) => enregistrer.mutate(ids, { onSuccess: onFermer })}
      onFermer={onFermer}
    />
  );
}

function NaturesOperationPageInner() {
  const sort = useTableSort<NoSortCol>('/natures-operation', NO_SORT_COLUMNS, { by: 'libelle', dir: 'asc' });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: natures, isLoading, isError } = useNaturesOperation({
    search: debouncedSearch || undefined,
    sortBy: sort.state.by ?? undefined,
    sortDir: sort.state.by ? sort.state.dir : undefined,
  });
  const remove = useDeleteNatureOperation();
  const sync = useSyncComptesSap();
  // Le centre de coût d'une nature n'est plus une simple valeur par défaut : il
  // s'impose au bon et y verrouille le champ. Le voir dans la liste permet de
  // repérer d'un coup d'œil les natures qui n'en portent pas.
  const { data: costCentersListe } = useCostCenters();
  const ccById = new Map(
    (costCentersListe ?? []).map((c) => [String(c.id), `${c.code} — ${c.libelle}`]),
  );
  // null = formulaire fermé ; { } = création ; un objet = édition de cette nature.
  const [form, setForm] = useState<{ editing: NatureOperation | null } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<NatureOperation | null>(null);
  const [liaison, setLiaison] = useState<NatureOperation | null>(null);

  const user = useAuthStore((s) => s.user);
  const { data: perms } = useMyPermissions(user?.id ?? null);
  const peutLier = new Set(perms ?? []).has('NATURE_CC_LIER');

  // Tous les couples en une requête : les demander ligne par ligne ferait
  // autant d'appels que de natures affichées.
  const { data: liaisons } = useLiaisonsNatureCostCenter();
  const ccParNature = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const l of liaisons ?? []) {
      const cle = String(l.natureOperationId);
      m.set(cle, [...(m.get(cle) ?? []), String(l.costCenterId)]);
    }
    return m;
  }, [liaisons]);

  // Pagination client.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, pageSize, sort.state.by, sort.state.dir]);
  const list = natures ?? [];
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pagedNatures = list.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  return (
    <div className="flex flex-col gap-4">
      {liaison && <CentresDeNature nature={liaison} onFermer={() => setLiaison(null)} />}
      {form && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center" onClick={() => setForm(null)}>
          <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <NatureForm
              key={form.editing?.id ?? 'new'}
              editing={form.editing}
              onDone={() => setForm(null)}
            />
          </div>
        </div>
      )}

      <Panel>
        <PanelHeader title="Natures comptables" badge={`${natures?.length ?? 0}`}>
          {!form && (
            <div className="ml-auto flex items-center gap-2">
              {sync.data && !sync.isPending && (
                <span className="text-[11px] font-medium text-[#047857]">
                  +{sync.data.comptesAjoutes} compte(s), +{sync.data.naturesAjoutees} nature(s)
                </span>
              )}
              {sync.isError && (
                <span className="text-[11px] text-[#B42318]">{apiErrorMessage(sync.error, 'Sync impossible')}</span>
              )}
              <button
                type="button"
                onClick={() => sync.mutate()}
                disabled={sync.isPending}
                title="Récupérer les nouveaux comptes/natures depuis SAP"
                className="flex items-center gap-1.5 rounded-[9px] border border-[rgba(15,76,129,0.2)] px-3 py-1.5 text-[11px] font-medium text-[#0F4C81] transition hover:bg-[#EFF6FF] disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${sync.isPending ? 'animate-spin' : ''}`} />
                {sync.isPending ? 'Synchronisation…' : 'Synchronisation'}
              </button>
              <button
                type="button"
                onClick={() => setForm({ editing: null })}
                className="flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-3.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-[#1A6DB5]"
              >
                <Plus className="h-4 w-4" /> Nouvelle nature
              </button>
            </div>
          )}
        </PanelHeader>

        <div className="flex flex-wrap items-center gap-2 border-b border-[rgba(15,76,129,0.07)] px-[18px] py-3">
          <Search className="h-4 w-4 text-[#64748B]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher (libellé ou code)…"
            className="min-w-[200px] flex-1 rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-[#F8FAFC] px-3 py-1.5 text-xs text-[#0F172A] outline-none focus:border-[#1A6DB5] focus:bg-white"
          />
          <label className="flex items-center gap-1.5 text-[11px] text-[#64748B]">
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
          </label>
          <span className="text-[11px] text-[#64748B]">{list.length} au total</span>
        </div>

        {isLoading && <div className="px-[18px] py-8 text-sm text-[#64748B]">Chargement…</div>}
        {isError && <div className="px-[18px] py-8 text-sm text-[#EF4444]">Impossible de charger les natures comptables.</div>}

        {natures && (
          <table className="w-full text-xs">
            <thead className="bg-[#F8FAFC]">
              <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
                <SortableHeader column="code" state={sort.state} onSort={sort.setSort}>Compte PCGG (SAP)</SortableHeader>
                <SortableHeader column="libelle" state={sort.state} onSort={sort.setSort}>Libellé</SortableHeader>
                <th className="px-4 py-2.5 font-semibold">Centre de coût</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {natures && natures.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-[#64748B]">
                    Aucune nature comptable. Créez-en une pour pouvoir créer des bons.
                  </td>
                </tr>
              )}
              {pagedNatures.map((n) => (
                <tr key={n.id} className="border-t border-[rgba(15,76,129,0.07)] hover:bg-[#FAFBFF]">
                  <td className="px-4 py-3 font-mono font-medium">{n.code || <span className="text-[#B45309]">sans compte</span>}</td>
                  <td className="px-4 py-3">{n.libelle}</td>
                  {/* Une nature peut être rattachée à PLUSIEURS centres de coût
                      (migration 0066). On les nomme tant qu'ils tiennent, puis
                      on compte : une liste de dix codes serait illisible. */}
                  <td className="px-4 py-3 text-[#64748B]">
                    {(() => {
                      const ccs = ccParNature.get(String(n.id)) ?? [];
                      if (ccs.length === 0)
                        return <span className="text-[11px] text-[#B45309]">non rattaché</span>;
                      if (ccs.length <= 2)
                        return (
                          <span className="text-[11px]">
                            {ccs.map((id) => ccById.get(id) ?? id).join(' · ')}
                          </span>
                        );
                      return <span className="text-[11px]">{ccs.length} centres de coût</span>;
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {peutLier && (
                        <button
                          type="button"
                          onClick={() => setLiaison(n)}
                          title="Rattacher cette nature à des centres de coût"
                          className="inline-flex items-center gap-1 rounded-[7px] border border-[rgba(15,76,129,0.15)] px-2 py-1 text-[10px] font-medium text-[#475569] transition-colors hover:bg-[#EFF6FF] hover:text-[#1A6DB5]"
                        >
                          <Link2 className="h-3 w-3" /> Centres de coût
                          <span
                            className={
                              n.nbCostCenters
                                ? 'ml-0.5 rounded-full bg-[#EFF6FF] px-1.5 font-semibold text-[#0C447C]'
                                : 'ml-0.5 text-[#CBD5E1]'
                            }
                          >
                            {n.nbCostCenters ?? 0}
                          </span>
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label="Modifier"
                        onClick={() => setForm({ editing: n })}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] transition-colors hover:bg-[#EFF6FF] hover:text-[#1A6DB5]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Supprimer"
                        disabled={remove.isPending}
                        onClick={() => setPendingDelete(n)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] transition-colors hover:bg-[#FEF2F2] hover:text-[#EF4444]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {list.length > pageSize && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[rgba(15,76,129,0.07)] px-4 py-2.5 text-xs">
            <span className="text-[#64748B]">
              {(pageSafe - 1) * pageSize + 1}–{Math.min(pageSafe * pageSize, list.length)} sur {list.length}
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

      <ConfirmDialog
        open={!!pendingDelete}
        variant="warning"
        title={pendingDelete ? `Désactiver la nature ${pendingDelete.code} ?` : ''}
        description={pendingDelete ? `« ${pendingDelete.libelle} » ne sera plus sélectionnable. Rien n'est supprimé définitivement.` : undefined}
        confirmLabel="Désactiver"
        busy={remove.isPending}
        error={remove.isError ? apiErrorMessage(remove.error, 'Désactivation impossible') : undefined}
        onCancel={() => { setPendingDelete(null); remove.reset(); }}
        onConfirm={() => { if (pendingDelete) remove.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) }); }}
      />
    </div>
  );
}

export function NaturesOperationPage() {
  return (
    <RoleGuard allow={['SUPER_ADMIN', 'ADMINISTRATEUR']}>
      <NaturesOperationPageInner />
    </RoleGuard>
  );
}
