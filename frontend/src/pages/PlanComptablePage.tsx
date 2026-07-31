import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BookOpen, Plus, Search, Trash2 } from 'lucide-react';
import {
  usePlanComptable,
  usePlanComptableStats,
  useCreatePlanComptable,
  useDeletePlanComptable,
} from '@/api/referentiel';
import { SortableHeader } from '@/components/SortableHeader';
import { useTableSort } from '@/hooks/useTableSort';
import { apiErrorMessage } from '@/lib/utils';
import type { PlanComptable, TypeCompte } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { Pill, type PillTone } from '@/components/ui/pill';
import { RoleGuard } from '@/components/RoleGuard';
import { ConfirmDialog } from '@/components/ConfirmDialog';

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const TYPE_TONE: Record<TypeCompte, { tone: PillTone; label: string }> = {
  ACTIF: { tone: 'blue', label: 'Actif' },
  PASSIF: { tone: 'purple', label: 'Passif' },
  CHARGE: { tone: 'amber', label: 'Charge' },
  PRODUIT: { tone: 'green', label: 'Produit' },
};

const TYPE_OPTIONS: { value: TypeCompte; label: string }[] = [
  { value: 'ACTIF', label: 'Actif' },
  { value: 'PASSIF', label: 'Passif' },
  { value: 'CHARGE', label: 'Charge' },
  { value: 'PRODUIT', label: 'Produit' },
];

const PC_SORT_COLUMNS = ['numeroCompte', 'libelle', 'typeCompte'] as const;
type PcSortCol = (typeof PC_SORT_COLUMNS)[number];

const schema = z.object({
  numeroCompte: z
    .string()
    .trim()
    .min(1, 'Requis')
    .regex(/^\d+$/, 'Le numéro de compte doit être numérique (chiffres uniquement)'),
  libelle: z.string().trim().min(1, 'Requis'),
  typeCompte: z.enum(['ACTIF', 'PASSIF', 'CHARGE', 'PRODUIT']),
  parentId: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

function CreatePlanComptableForm({ onDone }: { onDone: () => void }) {
  const create = useCreatePlanComptable();
  const { data: comptes } = usePlanComptable();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { typeCompte: 'CHARGE' },
  });

  const onSubmit = handleSubmit((values) => {
    create.mutate(
      {
        numeroCompte: values.numeroCompte,
        libelle: values.libelle,
        typeCompte: values.typeCompte,
        parentId: values.parentId || undefined,
      },
      {
        onSuccess: () => {
          reset({ typeCompte: 'CHARGE' });
          onDone();
        },
      },
    );
  });

  return (
    <Panel>
      <PanelHeader title="Nouveau compte" />
      <form onSubmit={onSubmit} className="grid gap-4 p-[18px] sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="numeroCompte">Numéro de compte</Label>
          <Input
            id="numeroCompte"
            inputMode="numeric"
            placeholder="ex. 401, 411, 512100"
            {...register('numeroCompte')}
          />
          {errors.numeroCompte && (
            <p className="text-sm text-destructive">{errors.numeroCompte.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="typeCompte">Type</Label>
          <select id="typeCompte" className={selectClass} {...register('typeCompte')}>
            {TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="libelle">Libellé</Label>
          <Input id="libelle" placeholder="Intitulé du compte" {...register('libelle')} />
          {errors.libelle && <p className="text-sm text-destructive">{errors.libelle.message}</p>}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="parentId">
            Compte parent <span className="text-xs font-normal text-[#64748B]">(optionnel)</span>
          </Label>
          <select id="parentId" className={selectClass} {...register('parentId')}>
            <option value="">— Aucun (compte racine) —</option>
            {comptes?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.numeroCompte} — {c.libelle}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Création…' : 'Créer'}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Annuler
          </Button>
          {create.isError && (
            <p className="text-sm text-destructive">
              {apiErrorMessage(create.error, 'Création impossible')}
            </p>
          )}
        </div>
      </form>
    </Panel>
  );
}

function PlanComptablePageInner() {
  const sort = useTableSort<PcSortCol>('/plan-comptable', PC_SORT_COLUMNS, {
    by: 'numeroCompte',
    dir: 'asc',
  });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const [typeFilter, setTypeFilter] = useState<TypeCompte | 'ALL'>('ALL');

  // Recherche, filtre par type et tri sont exécutés EN BASE.
  const { data: comptes, isLoading, isError } = usePlanComptable({
    search: debouncedSearch || undefined,
    typeCompte: typeFilter === 'ALL' ? undefined : typeFilter,
    sortBy: sort.state.by ?? undefined,
    sortDir: sort.state.by ? sort.state.dir : undefined,
  });
  // Compteurs des onglets : GROUP BY en base, donc indépendants du filtre courant.
  const { data: stats } = usePlanComptableStats();
  const remove = useDeletePlanComptable();
  const [showForm, setShowForm] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PlanComptable | null>(null);

  const filtered = comptes ?? [];

  const counts: Record<TypeCompte | 'ALL', number> = {
    ALL: stats?.total ?? 0,
    ACTIF: stats?.parType.ACTIF ?? 0,
    PASSIF: stats?.parType.PASSIF ?? 0,
    CHARGE: stats?.parType.CHARGE ?? 0,
    PRODUIT: stats?.parType.PRODUIT ?? 0,
  };

  return (
    <div className="flex flex-col gap-4">
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <CreatePlanComptableForm onDone={() => setShowForm(false)} />
          </div>
        </div>
      )}

      <Panel>
        <PanelHeader title="Plan comptable" badge={`${stats?.total ?? comptes?.length ?? 0}`}>
          {!showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="ml-auto flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-3.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-[#1A6DB5]"
            >
              <Plus className="h-4 w-4" /> Nouveau compte
            </button>
          )}
        </PanelHeader>

        <div className="flex flex-wrap items-center gap-2 border-b border-[rgba(15,76,129,0.07)] px-[18px] py-3">
          {/* Filtres par type */}
          <div className="flex flex-wrap gap-1.5">
            {(['ALL', 'ACTIF', 'PASSIF', 'CHARGE', 'PRODUIT'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={
                  typeFilter === t
                    ? 'rounded-[7px] border border-[#0F4C81] bg-[#0F4C81] px-2.5 py-1 text-[10px] font-medium text-white'
                    : 'rounded-[7px] border border-[rgba(15,76,129,0.1)] bg-white px-2.5 py-1 text-[10px] font-medium text-[#475569] hover:bg-[#F8FAFC]'
                }
              >
                {t === 'ALL' ? 'Tous' : TYPE_TONE[t].label}{' '}
                <span className="opacity-60">({counts[t]})</span>
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Search className="h-4 w-4 text-[#64748B]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher (n°, libellé)…"
              className="w-56 rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-[#F8FAFC] px-3 py-1.5 text-xs text-[#0F172A] outline-none focus:border-[#1A6DB5] focus:bg-white"
            />
          </div>
        </div>

        {isLoading && <div className="px-[18px] py-8 text-sm text-[#64748B]">Chargement…</div>}
        {isError && (
          <div className="px-[18px] py-8 text-sm text-[#EF4444]">
            Impossible de charger le plan comptable.
          </div>
        )}

        {comptes && (
          <table className="w-full text-xs">
            <thead className="bg-[#F8FAFC]">
              <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
                <SortableHeader column="numeroCompte" state={sort.state} onSort={sort.setSort}>
                  N° compte
                </SortableHeader>
                <SortableHeader column="libelle" state={sort.state} onSort={sort.setSort}>
                  Libellé
                </SortableHeader>
                <SortableHeader column="typeCompte" state={sort.state} onSort={sort.setSort}>
                  Type
                </SortableHeader>
                <th className="px-4 py-2.5 font-semibold">Parent</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[#64748B]">
                    <div className="mb-2 flex justify-center text-[#94A3B8]">
                      <BookOpen className="h-8 w-8" />
                    </div>
                    {search || typeFilter !== 'ALL'
                      ? 'Aucun compte ne correspond à votre filtre.'
                      : 'Aucun compte créé. Cliquez sur « Nouveau compte ».'}
                  </td>
                </tr>
              )}
              {filtered.map((c) => {
                const t = TYPE_TONE[c.typeCompte];
                const parent = c.parent ?? undefined;
                return (
                  <tr key={c.id} className="border-t border-[rgba(15,76,129,0.07)] hover:bg-[#FAFBFF]">
                    <td className="px-4 py-3 font-mono font-semibold text-[#0F172A]">
                      {c.numeroCompte}
                    </td>
                    <td className="px-4 py-3">{c.libelle}</td>
                    <td className="px-4 py-3">
                      <Pill tone={t.tone}>{t.label}</Pill>
                    </td>
                    <td className="px-4 py-3 text-[#64748B]">
                      {parent ? (
                        <span>
                          <span className="font-mono text-[10px]">{parent.numeroCompte}</span>{' '}
                          {parent.libelle}
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase tracking-[0.5px] text-[#94A3B8]">
                          racine
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        aria-label="Désactiver"
                        disabled={remove.isPending}
                        onClick={() => setPendingDelete(c)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] transition-colors hover:bg-[#FEF2F2] hover:text-[#EF4444]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>

      <ConfirmDialog
        open={!!pendingDelete}
        variant="warning"
        title={pendingDelete ? `Désactiver le compte ${pendingDelete.numeroCompte} ?` : ''}
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

export function PlanComptablePage() {
  return (
    <RoleGuard allow={['SUPER_ADMIN', 'ADMINISTRATEUR']}>
      <PlanComptablePageInner />
    </RoleGuard>
  );
}
