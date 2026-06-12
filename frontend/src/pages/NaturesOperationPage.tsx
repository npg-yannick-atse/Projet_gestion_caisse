import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import {
  useNaturesOperation,
  useCreateNatureOperation,
  useUpdateNatureOperation,
  useDeleteNatureOperation,
  useCostCenters,
  usePlanComptable,
} from '@/api/referentiel';
import { apiErrorMessage } from '@/lib/utils';
import type { NatureOperation } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { RoleGuard } from '@/components/RoleGuard';

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const schema = z.object({
  code: z.string().min(1, 'Requis'),
  libelle: z.string().min(1, 'Requis'),
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
      <PanelHeader title={editing ? `Modifier — ${editing.code}` : "Nouvelle nature d'opération"} />
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
        <div className="space-y-1.5">
          <Label htmlFor="planComptableId">Compte comptable par défaut (optionnel)</Label>
          <select id="planComptableId" className={selectClass} {...register('planComptableId')}>
            <option value="">— Aucun —</option>
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

function NaturesOperationPageInner() {
  const { data: natures, isLoading, isError } = useNaturesOperation();
  const remove = useDeleteNatureOperation();
  // null = formulaire fermé ; { } = création ; un objet = édition de cette nature.
  const [form, setForm] = useState<{ editing: NatureOperation | null } | null>(null);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (natures ?? []).filter(
      (n) => !q || n.libelle.toLowerCase().includes(q) || n.code.toLowerCase().includes(q),
    );
  }, [natures, search]);

  return (
    <div className="flex flex-col gap-4">
      {form && (
        <NatureForm
          key={form.editing?.id ?? 'new'}
          editing={form.editing}
          onDone={() => setForm(null)}
        />
      )}

      <Panel>
        <PanelHeader title="Natures d'opération" badge={`${natures?.length ?? 0}`}>
          {!form && (
            <button
              type="button"
              onClick={() => setForm({ editing: null })}
              className="ml-auto flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-3.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-[#1A6DB5]"
            >
              <Plus className="h-4 w-4" /> Nouvelle nature
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
        {isError && <div className="px-[18px] py-8 text-sm text-[#EF4444]">Impossible de charger les natures d'opération.</div>}

        {natures && (
          <table className="w-full text-xs">
            <thead className="bg-[#F8FAFC]">
              <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
                <th className="px-4 py-2.5 font-semibold">Code</th>
                <th className="px-4 py-2.5 font-semibold">Libellé</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-[#64748B]">
                    Aucune nature d'opération. Créez-en une pour pouvoir créer des bons.
                  </td>
                </tr>
              )}
              {filtered.map((n) => (
                <tr key={n.id} className="border-t border-[rgba(15,76,129,0.07)] hover:bg-[#FAFBFF]">
                  <td className="px-4 py-3 font-medium">{n.code}</td>
                  <td className="px-4 py-3">{n.libelle}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
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
                        onClick={() => {
                          if (confirm(`Supprimer la nature ${n.code} ?`)) remove.mutate(n.id);
                        }}
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
