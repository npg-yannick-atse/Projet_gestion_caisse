import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import {
  useDirections,
  useCreateDirection,
  useUpdateDirection,
  useDeleteDirection,
} from '@/api/directions';
import { apiErrorMessage } from '@/lib/utils';
import type { Direction } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { ConfirmDialog } from '@/components/ConfirmDialog';

const schema = z.object({
  code: z.string().trim().min(1, 'Requis'),
  libelle: z.string().trim().min(1, 'Requis'),
  description: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

function DirectionForm({ direction, onDone }: { direction?: Direction; onDone: () => void }) {
  const isEdit = !!direction;
  const create = useCreateDirection();
  const update = useUpdateDirection();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: direction
      ? { code: direction.code, libelle: direction.libelle, description: direction.description ?? '' }
      : undefined,
  });

  const pending = create.isPending || update.isPending;
  const mutError = create.error || update.error;
  const hasError = create.isError || update.isError;

  const onSubmit = handleSubmit((values) => {
    const payload = {
      code: values.code,
      libelle: values.libelle,
      description: values.description || undefined,
    };
    const done = () => {
      reset();
      onDone();
    };
    if (isEdit) {
      update.mutate({ id: direction!.id, payload }, { onSuccess: done });
    } else {
      create.mutate(payload, { onSuccess: done });
    }
  });

  return (
    <Panel>
      <PanelHeader title={isEdit ? `Modifier la direction ${direction!.code}` : 'Nouvelle direction'} />
      <form onSubmit={onSubmit} className="grid gap-4 p-[18px] sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="code">Code</Label>
          <Input id="code" placeholder="Ex : DAF" {...register('code')} />
          {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="libelle">Libellé</Label>
          <Input id="libelle" placeholder="Ex : Direction Administrative et Financière" {...register('libelle')} />
          {errors.libelle && <p className="text-sm text-destructive">{errors.libelle.message}</p>}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="description">Description (optionnel)</Label>
          <Input id="description" {...register('description')} />
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

export function DirectionsPage() {
  const { data: directions, isLoading, isError } = useDirections();
  const remove = useDeleteDirection();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Direction | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Direction | null>(null);
  const [search, setSearch] = useState('');

  const openCreate = () => {
    setEditing(null);
    setShowForm(true);
  };
  const openEdit = (d: Direction) => {
    setEditing(d);
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (directions ?? []).filter(
      (d) => !q || d.libelle.toLowerCase().includes(q) || d.code.toLowerCase().includes(q),
    );
  }, [directions, search]);

  return (
    <div className="flex flex-col gap-4">
      {showForm && (
        <DirectionForm key={editing?.id ?? 'new'} direction={editing ?? undefined} onDone={closeForm} />
      )}

      <Panel>
        <PanelHeader title="Directions" badge={`${directions?.length ?? 0}`}>
          {!showForm && (
            <button
              type="button"
              onClick={openCreate}
              className="ml-auto flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-3.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-[#1A6DB5]"
            >
              <Plus className="h-4 w-4" /> Nouvelle direction
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
        {isError && <div className="px-[18px] py-8 text-sm text-[#EF4444]">Impossible de charger les directions.</div>}

        {directions && (
          <table className="w-full text-xs">
            <thead className="bg-[#F8FAFC]">
              <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
                <th className="px-4 py-2.5 font-semibold">Code</th>
                <th className="px-4 py-2.5 font-semibold">Libellé</th>
                <th className="px-4 py-2.5 font-semibold">Description</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-[#64748B]">
                    Aucune direction. Créez-en une pour pouvoir la lier aux utilisateurs et centres de coût.
                  </td>
                </tr>
              )}
              {filtered.map((d) => (
                <tr key={d.id} className="border-t border-[rgba(15,76,129,0.07)] hover:bg-[#FAFBFF]">
                  <td className="px-4 py-3 font-medium">{d.code}</td>
                  <td className="px-4 py-3">{d.libelle}</td>
                  <td className="px-4 py-3 text-[#64748B]">{d.description ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        aria-label="Modifier"
                        onClick={() => openEdit(d)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] transition-colors hover:bg-[#EFF6FF] hover:text-[#1A6DB5]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Supprimer"
                        onClick={() => setPendingDelete(d)}
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
        variant="danger"
        title={pendingDelete ? `Supprimer la direction ${pendingDelete.code} ?` : ''}
        description={
          pendingDelete
            ? `« ${pendingDelete.libelle} » sera retirée de la liste. Vérifiez qu'aucun utilisateur ni centre de coût n'y est rattaché.`
            : undefined
        }
        confirmLabel="Supprimer"
        busy={remove.isPending}
        error={remove.isError ? apiErrorMessage(remove.error, 'Suppression impossible') : undefined}
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
