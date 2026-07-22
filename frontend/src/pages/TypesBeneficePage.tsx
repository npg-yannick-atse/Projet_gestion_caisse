import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import {
  useTypesBenefice,
  useCreateTypeBenefice,
  useUpdateTypeBenefice,
  useDeleteTypeBenefice,
} from '@/api/employes';
import { apiErrorMessage } from '@/lib/utils';
import type { TypeBenefice } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SortableHeader } from '@/components/SortableHeader';
import { useTableSort } from '@/hooks/useTableSort';

const TB_SORT_COLUMNS = ['code', 'libelle'] as const;
type TbSortCol = (typeof TB_SORT_COLUMNS)[number];

const schema = z.object({
  code: z.string().trim().min(1, 'Requis'),
  libelle: z.string().trim().min(1, 'Requis'),
});
type FormValues = z.infer<typeof schema>;

function TypeBeneficeForm({ type, onDone }: { type?: TypeBenefice; onDone: () => void }) {
  const isEdit = !!type;
  const create = useCreateTypeBenefice();
  const update = useUpdateTypeBenefice();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: type ? { code: type.code, libelle: type.libelle } : undefined,
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
      // Le code n'est pas modifiable côté serveur : on n'envoie que le libellé.
      update.mutate({ id: type!.id, payload: { libelle: values.libelle } }, { onSuccess: done });
    } else {
      create.mutate({ code: values.code, libelle: values.libelle }, { onSuccess: done });
    }
  });

  return (
    <Panel>
      <PanelHeader title={isEdit ? `Modifier « ${type!.libelle} »` : 'Nouveau type de bénéfice'} />
      <form onSubmit={onSubmit} className="grid gap-4 p-[18px] sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="code">Code</Label>
          <Input id="code" placeholder="Ex : BILLET_AVION" disabled={isEdit} {...register('code')} />
          {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="libelle">Libellé</Label>
          <Input id="libelle" placeholder="Ex : Billet d'avion" {...register('libelle')} />
          {errors.libelle && <p className="text-sm text-destructive">{errors.libelle.message}</p>}
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

export function TypesBeneficePage() {
  const sort = useTableSort<TbSortCol>('/types-benefice', TB_SORT_COLUMNS, { by: 'libelle', dir: 'asc' });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: types, isLoading, isError } = useTypesBenefice({
    search: debouncedSearch || undefined,
    sortBy: sort.state.by ?? undefined,
    sortDir: sort.state.by ? sort.state.dir : undefined,
  });
  const remove = useDeleteTypeBenefice();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TypeBenefice | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TypeBenefice | null>(null);

  const openCreate = () => {
    setEditing(null);
    setShowForm(true);
  };
  const openEdit = (t: TypeBenefice) => {
    setEditing(t);
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  return (
    <div className="flex flex-col gap-4">
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center" onClick={closeForm}>
          <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <TypeBeneficeForm key={editing?.id ?? 'new'} type={editing ?? undefined} onDone={closeForm} />
          </div>
        </div>
      )}

      <Panel>
        <PanelHeader title="Types de bénéfice" badge={`${types?.length ?? 0}`}>
          {!showForm && (
            <button
              type="button"
              onClick={openCreate}
              className="ml-auto flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-3.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-[#1A6DB5]"
            >
              <Plus className="h-4 w-4" /> Nouveau type
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
        {isError && <div className="px-[18px] py-8 text-sm text-[#EF4444]">Impossible de charger les types de bénéfice.</div>}

        {types && (
          <table className="w-full text-xs">
            <thead className="bg-[#F8FAFC]">
              <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
                <SortableHeader column="code" state={sort.state} onSort={sort.setSort}>Code</SortableHeader>
                <SortableHeader column="libelle" state={sort.state} onSort={sort.setSort}>Libellé</SortableHeader>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {types.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-[#64748B]">
                    Aucun type de bénéfice. Créez-en un (ex. Billet d'avion) pour pouvoir l'accorder aux employés.
                  </td>
                </tr>
              )}
              {types.map((t) => (
                <tr key={t.id} className="border-t border-[rgba(15,76,129,0.07)] hover:bg-[#FAFBFF]">
                  <td className="px-4 py-3 font-medium">{t.code}</td>
                  <td className="px-4 py-3">{t.libelle}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        aria-label="Modifier"
                        onClick={() => openEdit(t)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] transition-colors hover:bg-[#EFF6FF] hover:text-[#1A6DB5]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Supprimer"
                        onClick={() => setPendingDelete(t)}
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
        title={pendingDelete ? `Supprimer « ${pendingDelete.libelle} » ?` : ''}
        description={
          pendingDelete
            ? 'Le type sera désactivé. Impossible s’il est encore accordé à des employés (bénéfices valides).'
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
