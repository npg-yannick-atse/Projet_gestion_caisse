import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Search, Trash2 } from 'lucide-react';
import { useCostCenters, useCreateCostCenter, useDeleteCostCenter } from '@/api/referentiel';
import { useDirections } from '@/api/directions';
import { apiErrorMessage, formatMontant } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Panel, PanelHeader } from '@/components/ui/panel';

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const schema = z.object({
  code: z.string().min(1, 'Requis'),
  libelle: z.string().min(1, 'Requis'),
  directionId: z.string().optional(),
  budgetAnnuel: z
    .string()
    .optional()
    .refine((v) => !v || /^\d+(\.\d{1,4})?$/.test(v), 'Montant invalide'),
});
type FormValues = z.infer<typeof schema>;

function CreateCostCenterForm({ onDone }: { onDone: () => void }) {
  const { data: directions } = useDirections();
  const create = useCreateCostCenter();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit((values) => {
    const payload = {
      code: values.code,
      libelle: values.libelle,
      directionId: values.directionId || undefined,
      budgetAnnuel: values.budgetAnnuel || undefined,
    };
    create.mutate(payload, {
      onSuccess: () => {
        reset();
        onDone();
      },
    });
  });

  return (
    <Panel>
      <PanelHeader title="Nouveau centre de coût" />
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
          <Label htmlFor="budgetAnnuel">Budget annuel (optionnel)</Label>
          <Input id="budgetAnnuel" inputMode="decimal" placeholder="0" {...register('budgetAnnuel')} />
          {errors.budgetAnnuel && <p className="text-sm text-destructive">{errors.budgetAnnuel.message}</p>}
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Création…' : 'Créer'}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Annuler
          </Button>
          {create.isError && (
            <p className="text-sm text-destructive">{apiErrorMessage(create.error, 'Création impossible')}</p>
          )}
        </div>
      </form>
    </Panel>
  );
}

export function CostCentersPage() {
  const { data: costCenters, isLoading, isError } = useCostCenters();
  const { data: directions } = useDirections();
  const remove = useDeleteCostCenter();
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');

  const directionLabel = useMemo(
    () => new Map((directions ?? []).map((d) => [d.id, `${d.code} — ${d.libelle}`])),
    [directions],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (costCenters ?? []).filter(
      (c) => !q || c.libelle.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
    );
  }, [costCenters, search]);

  return (
    <div className="flex flex-col gap-4">
      {showForm && <CreateCostCenterForm onDone={() => setShowForm(false)} />}

      <Panel>
        <PanelHeader title="Centres de coût" badge={`${costCenters?.length ?? 0}`}>
          {!showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
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
                <th className="px-4 py-2.5 font-semibold">Code</th>
                <th className="px-4 py-2.5 font-semibold">Libellé</th>
                <th className="px-4 py-2.5 font-semibold">Direction</th>
                <th className="px-4 py-2.5 text-right font-semibold">Budget annuel</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[#64748B]">
                    Aucun centre de coût.
                  </td>
                </tr>
              )}
              {filtered.map((c) => (
                <tr key={c.id} className="border-t border-[rgba(15,76,129,0.07)] hover:bg-[#FAFBFF]">
                  <td className="px-4 py-3 font-medium">{c.code}</td>
                  <td className="px-4 py-3">{c.libelle}</td>
                  <td className="px-4 py-3 text-[#64748B]">
                    {c.directionId ? (directionLabel.get(c.directionId) ?? c.directionId) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {c.budgetAnnuel ? formatMontant(c.budgetAnnuel) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      aria-label="Désactiver"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (confirm(`Désactiver le centre ${c.code} ?`)) remove.mutate(c.id);
                      }}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] transition-colors hover:bg-[#FEF2F2] hover:text-[#EF4444]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
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
