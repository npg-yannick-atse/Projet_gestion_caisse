import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import {
  useCostCenters,
  useCreateCostCenter,
  useUpdateCostCenter,
  useDeleteCostCenter,
  useNaturesComptable,
  useNaturesDeCostCenter,
  useSetNaturesDeCostCenter,
} from '@/api/referentiel';
import { useMyPermissions } from '@/api/users';
import { useAuthStore } from '@/stores/auth.store';
import { LiaisonModal } from '@/components/LiaisonModal';
import { useDirections } from '@/api/directions';
import { apiErrorMessage, formatMontant } from '@/lib/utils';
import type { CostCenter } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SortableHeader } from '@/components/SortableHeader';
import { useTableSort } from '@/hooks/useTableSort';

const CC_SORT_COLUMNS = ['code', 'libelle'] as const;
type CcSortCol = (typeof CC_SORT_COLUMNS)[number];
import { PowerOff } from 'lucide-react';

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const schema = z.object({
  code: z.string().trim().min(1, 'Requis'),
  libelle: z.string().trim().min(1, 'Requis'),
  directionId: z.string().optional(),
  budgetMensuel: z
    .string()
    .optional()
    .refine((v) => !v || /^\d+(\.\d{1,4})?$/.test(v), 'Montant invalide'),
});
type FormValues = z.infer<typeof schema>;

function CostCenterForm({ costCenter, onDone }: { costCenter?: CostCenter; onDone: () => void }) {
  const isEdit = !!costCenter;
  const { data: directions } = useDirections();
  const create = useCreateCostCenter();
  const update = useUpdateCostCenter();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: costCenter
      ? {
          code: costCenter.code,
          libelle: costCenter.libelle,
          directionId: costCenter.directionId ?? '',
          budgetMensuel: costCenter.budgetMensuel ?? '',
        }
      : undefined,
  });

  const pending = create.isPending || update.isPending;
  const mutError = create.error || update.error;
  const hasError = create.isError || update.isError;

  const onSubmit = handleSubmit((values) => {
    const done = () => {
      reset();
      onDone();
    };
    if (isEdit) {
      // Le code n'est pas modifiable : on n'envoie que les champs éditables.
      update.mutate(
        {
          id: costCenter!.id,
          payload: {
            libelle: values.libelle,
            directionId: values.directionId ?? '',
            budgetMensuel: values.budgetMensuel ?? '',
          },
        },
        { onSuccess: done },
      );
    } else {
      create.mutate(
        {
          code: values.code,
          libelle: values.libelle,
          directionId: values.directionId || undefined,
          budgetMensuel: values.budgetMensuel || undefined,
        },
        { onSuccess: done },
      );
    }
  });

  return (
    <Panel>
      <PanelHeader title={isEdit ? `Modifier le centre ${costCenter!.code}` : 'Nouveau centre de coût'} />
      <form onSubmit={onSubmit} className="grid gap-4 p-[18px] sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="code">Code{isEdit && ' (non modifiable)'}</Label>
          <Input id="code" disabled={isEdit} {...register('code')} />
          {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="libelle">Libellé</Label>
          <Input id="libelle" {...register('libelle')} />
          {errors.libelle && <p className="text-sm text-destructive">{errors.libelle.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="directionId">Direction (optionnel)</Label>
          <select id="directionId" className={selectClass} {...register('directionId')}>
            <option value="">— Aucune —</option>
            {directions?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} — {d.libelle}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="budgetMensuel">Budget mensuel (optionnel)</Label>
          <Input id="budgetMensuel" inputMode="decimal" placeholder="0" {...register('budgetMensuel')} />
          {errors.budgetMensuel && <p className="text-sm text-destructive">{errors.budgetMensuel.message}</p>}
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer'}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Annuler
          </Button>
          {hasError && (
            <p className="text-sm text-destructive">
              {apiErrorMessage(mutError, isEdit ? 'Modification impossible' : 'Création impossible')}
            </p>
          )}
        </div>
      </form>
    </Panel>
  );
}

/** Le sens inverse de la même liaison : quelles natures pour ce centre de coût. */
function NaturesDuCentre({ centre, onFermer }: { centre: CostCenter; onFermer: () => void }) {
  // Les 599 natures d'un coup : la modale a sa propre recherche, et un
  // aller-retour serveur à chaque frappe serait plus coûteux que le chargement.
  const { data: toutes } = useNaturesComptable({ limit: 1000 });
  const { data: liees } = useNaturesDeCostCenter(centre.id);
  const enregistrer = useSetNaturesDeCostCenter(centre.id);

  return (
    <LiaisonModal
      titre={`Natures comptables — ${centre.code}`}
      sousTitre="Un centre de coût emploie plusieurs natures. La même liaison se retrouve depuis l’écran Plan comptable."
      elements={toutes?.map((n) => ({ id: n.id, code: n.codeComptableSap, libelle: n.libelle }))}
      dejaLies={liees?.map((n) => ({ id: n.id, code: n.codeComptableSap, libelle: n.libelle }))}
      enCours={enregistrer.isPending}
      erreur={enregistrer.isError ? enregistrer.error : undefined}
      onEnregistrer={(ids) => enregistrer.mutate(ids, { onSuccess: onFermer })}
      onFermer={onFermer}
    />
  );
}

export function CostCentersPage() {
  const sort = useTableSort<CcSortCol>('/cost-centers', CC_SORT_COLUMNS, { by: 'libelle', dir: 'asc' });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: costCenters, isLoading, isError } = useCostCenters({
    search: debouncedSearch || undefined,
    sortBy: sort.state.by ?? undefined,
    sortDir: sort.state.by ? sort.state.dir : undefined,
  });
  const { data: directions } = useDirections();
  const remove = useDeleteCostCenter();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CostCenter | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CostCenter | null>(null);
  const [liaison, setLiaison] = useState<CostCenter | null>(null);
  const user = useAuthStore((s) => s.user);
  const { data: perms } = useMyPermissions(user?.id ?? null);
  const peutLier = new Set(perms ?? []).has('NATURE_CC_LIER');

  const openCreate = () => {
    setEditing(null);
    setShowForm(true);
  };
  const openEdit = (c: CostCenter) => {
    setEditing(c);
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  const directionLabel = useMemo(
    () => new Map((directions ?? []).map((d) => [d.id, `${d.code} — ${d.libelle}`])),
    [directions],
  );

  return (
    <div className="flex flex-col gap-4">
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center" onClick={closeForm}>
          <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <CostCenterForm key={editing?.id ?? 'new'} costCenter={editing ?? undefined} onDone={closeForm} />
          </div>
        </div>
      )}
      {liaison && <NaturesDuCentre centre={liaison} onFermer={() => setLiaison(null)} />}

      <Panel>
        <PanelHeader title="Centres de coût" badge={`${costCenters?.length ?? 0}`}>
          {!showForm && (
            <button
              type="button"
              onClick={openCreate}
              className="ml-auto flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-3.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-[#1A6DB5]"
            >
              <Plus className="h-4 w-4" /> Nouveau centre
            </button>
          )}
        </PanelHeader>

        <div className="flex items-center gap-2 border-b border-[rgba(15,76,129,0.07)] px-[18px] py-3">
          <Search className="h-4 w-4 text-[#64748B]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher (libellé ou code)…"
            className="w-full rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-[#F8FAFC] px-3 py-1.5 text-xs text-[#0F172A] outline-none focus:border-[#1A6DB5] focus:bg-white"
          />
        </div>

        {isLoading && <div className="px-[18px] py-8 text-sm text-[#64748B]">Chargement…</div>}
        {isError && <div className="px-[18px] py-8 text-sm text-[#EF4444]">Impossible de charger les centres de coût.</div>}

        {costCenters && (
          <table className="w-full text-xs">
            <thead className="bg-[#F8FAFC]">
              <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
                <SortableHeader column="code" state={sort.state} onSort={sort.setSort}>Code</SortableHeader>
                <SortableHeader column="libelle" state={sort.state} onSort={sort.setSort}>Libellé</SortableHeader>
                <th className="px-4 py-2.5 font-semibold">Direction</th>
                <th className="px-4 py-2.5 text-right font-semibold">Budget mensuel</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {costCenters && costCenters.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[#64748B]">
                    Aucun centre de coût.
                  </td>
                </tr>
              )}
              {(costCenters ?? []).map((c) => (
                <tr key={c.id} className="border-t border-[rgba(15,76,129,0.07)] hover:bg-[#FAFBFF]">
                  <td className="px-4 py-3 font-medium">{c.code}</td>
                  <td className="px-4 py-3">{c.libelle}</td>
                  <td className="px-4 py-3 text-[#64748B]">
                    {c.directionId ? (directionLabel.get(c.directionId) ?? c.directionId) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {c.budgetMensuel ? formatMontant(c.budgetMensuel) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {peutLier && (
                        <button
                          type="button"
                          onClick={() => setLiaison(c)}
                          title="Rattacher des natures comptables à ce centre de coût"
                          className="inline-flex items-center gap-1 rounded-[7px] border border-[rgba(15,76,129,0.15)] px-2 py-1 text-[10px] font-medium text-[#475569] transition-colors hover:bg-[#EFF6FF] hover:text-[#1A6DB5]"
                        >
                          <Link2 className="h-3 w-3" /> Natures
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label="Modifier"
                        onClick={() => openEdit(c)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] transition-colors hover:bg-[#EFF6FF] hover:text-[#1A6DB5]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Désactiver"
                        onClick={() => setPendingDelete(c)}
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
      </Panel>

      <ConfirmDialog
        open={!!pendingDelete}
        variant="warning"
        icon={PowerOff}
        title={pendingDelete ? `Désactiver le centre ${pendingDelete.code} ?` : ''}
        description={
          pendingDelete
            ? `« ${pendingDelete.libelle} » n'apparaîtra plus dans les listes de sélection. Les bons et natures comptables existants ne sont pas affectés.`
            : undefined
        }
        confirmLabel="Désactiver"
        busy={remove.isPending}
        error={remove.isError ? apiErrorMessage(remove.error, 'Désactivation impossible') : undefined}
        onCancel={() => {
          setPendingDelete(null);
          remove.reset();
        }}
        onConfirm={() => {
          if (!pendingDelete) return;
          remove.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) });
        }}
      />
    </div>
  );
}
