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

const schema = z
  .object({
    code: z.string().trim().min(1, 'Requis'),
    libelle: z.string().trim().min(1, 'Requis'),
    modeMontant: z.enum(['SAISI', 'FIXE', 'POURCENTAGE_SALAIRE']),
    montantFixe: z.string().trim().optional(),
    pourcentageSalaire: z.string().trim().optional(),
    plafondPourcentageSalaire: z.string().trim().optional(),
    jourMinMois: z.string().trim().optional(),
    requiertPeriode: z.boolean(),
    recurrent: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.modeMontant === 'FIXE' && (!v.montantFixe || Number(v.montantFixe) <= 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['montantFixe'], message: 'Montant fixe requis (> 0)' });
    }
    if (v.modeMontant === 'POURCENTAGE_SALAIRE' && (!v.pourcentageSalaire || Number(v.pourcentageSalaire) <= 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pourcentageSalaire'], message: 'Pourcentage requis (> 0)' });
    }
    if (v.jourMinMois && (Number(v.jourMinMois) < 1 || Number(v.jourMinMois) > 31)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['jourMinMois'], message: 'Entre 1 et 31' });
    }
  });
type FormValues = z.infer<typeof schema>;

const MODE_OPTIONS: { value: FormValues['modeMontant']; label: string; hint: string }[] = [
  { value: 'SAISI', label: 'Saisi librement', hint: 'L’utilisateur saisit le montant à l’attribution.' },
  { value: 'FIXE', label: 'Montant fixe', hint: 'Montant imposé, identique pour tous.' },
  { value: 'POURCENTAGE_SALAIRE', label: '% du salaire', hint: 'Montant calculé = pourcentage du salaire de l’employé.' },
];

/** Résumé lisible du mode d'attribution d'un type (colonne du tableau). */
function describeAttribution(t: TypeBenefice): string {
  const parts: string[] = [];
  if (t.modeMontant === 'FIXE') parts.push(`Fixe : ${t.montantFixe ?? '?'}`);
  else if (t.modeMontant === 'POURCENTAGE_SALAIRE') parts.push(`${t.pourcentageSalaire ?? '?'} % du salaire`);
  else parts.push('Montant saisi');
  if (t.plafondPourcentageSalaire) parts.push(`plafond ${t.plafondPourcentageSalaire} %`);
  if (t.jourMinMois) parts.push(`dès le ${t.jourMinMois}`);
  parts.push(t.requiertPeriode ? 'avec période' : 'ponctuel');
  if (t.recurrent) parts.push('récurrent');
  return parts.join(' · ');
}

function TypeBeneficeForm({ type, onDone }: { type?: TypeBenefice; onDone: () => void }) {
  const isEdit = !!type;
  const create = useCreateTypeBenefice();
  const update = useUpdateTypeBenefice();
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: type
      ? {
          code: type.code,
          libelle: type.libelle,
          modeMontant: type.modeMontant,
          montantFixe: type.montantFixe ?? '',
          pourcentageSalaire: type.pourcentageSalaire ?? '',
          plafondPourcentageSalaire: type.plafondPourcentageSalaire ?? '',
          jourMinMois: type.jourMinMois != null ? String(type.jourMinMois) : '',
          requiertPeriode: type.requiertPeriode,
          recurrent: type.recurrent,
        }
      : {
          code: '',
          libelle: '',
          modeMontant: 'SAISI',
          montantFixe: '',
          pourcentageSalaire: '',
          plafondPourcentageSalaire: '',
          jourMinMois: '',
          requiertPeriode: true,
          recurrent: false,
        },
  });

  const mode = watch('modeMontant');
  const pending = create.isPending || update.isPending;
  const mutError = create.error || update.error;
  const hasError = create.isError || update.isError;

  const onSubmit = handleSubmit((values) => {
    const done = () => {
      reset();
      onDone();
    };
    // Réglages communs création/mise à jour. Les champs non pertinents pour le
    // mode choisi sont neutralisés (null) pour ne pas laisser de valeur fantôme.
    const config = {
      modeMontant: values.modeMontant,
      montantFixe: values.modeMontant === 'FIXE' ? values.montantFixe || null : null,
      pourcentageSalaire: values.modeMontant === 'POURCENTAGE_SALAIRE' ? values.pourcentageSalaire || null : null,
      plafondPourcentageSalaire: values.plafondPourcentageSalaire || null,
      jourMinMois: values.jourMinMois ? Number(values.jourMinMois) : null,
      requiertPeriode: values.requiertPeriode,
      recurrent: values.recurrent,
    };
    if (isEdit) {
      // Le code n'est pas modifiable côté serveur : on n'envoie que le libellé + la config.
      update.mutate({ id: type!.id, payload: { libelle: values.libelle, ...config } }, { onSuccess: done });
    } else {
      create.mutate({ code: values.code, libelle: values.libelle, ...config }, { onSuccess: done });
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

        {/* --------------------------------------------- Mode d'attribution -- */}
        <div className="sm:col-span-2 rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-[#FBFCFE] p-3.5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.6px] text-[#64748B]">
            Mode d’attribution
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="modeMontant">Montant</Label>
              <select
                id="modeMontant"
                className="flex h-9 w-full rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-white px-3 text-xs text-[#0F172A] outline-none focus:border-[#1A6DB5]"
                {...register('modeMontant')}
              >
                {MODE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-[#94A3B8]">{MODE_OPTIONS.find((o) => o.value === mode)?.hint}</p>
            </div>

            {mode === 'FIXE' && (
              <div className="space-y-1.5">
                <Label htmlFor="montantFixe">Montant fixe</Label>
                <Input id="montantFixe" type="number" min="0" step="1" placeholder="Ex : 100000" {...register('montantFixe')} />
                {errors.montantFixe && <p className="text-sm text-destructive">{errors.montantFixe.message}</p>}
              </div>
            )}
            {mode === 'POURCENTAGE_SALAIRE' && (
              <div className="space-y-1.5">
                <Label htmlFor="pourcentageSalaire">Pourcentage du salaire (%)</Label>
                <Input id="pourcentageSalaire" type="number" min="0" max="100" step="0.01" placeholder="Ex : 50" {...register('pourcentageSalaire')} />
                {errors.pourcentageSalaire && <p className="text-sm text-destructive">{errors.pourcentageSalaire.message}</p>}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="plafondPourcentageSalaire">Plafond (% du salaire) — optionnel</Label>
              <Input
                id="plafondPourcentageSalaire"
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="Ex : 50"
                {...register('plafondPourcentageSalaire')}
              />
              <p className="text-[11px] text-[#94A3B8]">Empêche d’accorder plus de X % du salaire.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="jourMinMois">Jour min. du mois — optionnel</Label>
              <Input id="jourMinMois" type="number" min="1" max="31" step="1" placeholder="Ex : 15" {...register('jourMinMois')} />
              {errors.jourMinMois ? (
                <p className="text-sm text-destructive">{errors.jourMinMois.message}</p>
              ) : (
                <p className="text-[11px] text-[#94A3B8]">Attribution autorisée seulement à partir de ce jour.</p>
              )}
            </div>

            <label className="flex items-center gap-2 text-xs text-[#0F172A]">
              <input type="checkbox" className="h-4 w-4 rounded border-[rgba(15,76,129,0.3)]" {...register('requiertPeriode')} />
              Requiert une période (dates début / fin)
            </label>
            <label className="flex items-center gap-2 text-xs text-[#0F172A]">
              <input type="checkbox" className="h-4 w-4 rounded border-[rgba(15,76,129,0.3)]" {...register('recurrent')} />
              Bénéfice récurrent (vs ponctuel)
            </label>
          </div>
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
                <th className="px-4 py-2.5 font-semibold">Attribution</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {types.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-[#64748B]">
                    Aucun type de bénéfice. Créez-en un (ex. Billet d'avion) pour pouvoir l'accorder aux employés.
                  </td>
                </tr>
              )}
              {types.map((t) => (
                <tr key={t.id} className="border-t border-[rgba(15,76,129,0.07)] hover:bg-[#FAFBFF]">
                  <td className="px-4 py-3 font-medium">{t.code}</td>
                  <td className="px-4 py-3">{t.libelle}</td>
                  <td className="px-4 py-3 text-[11px] text-[#64748B]">{describeAttribution(t)}</td>
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
