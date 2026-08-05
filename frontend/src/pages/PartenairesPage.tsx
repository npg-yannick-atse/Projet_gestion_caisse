import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronLeft, ChevronRight, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { usePartenaires, useCreatePartenaire, useUpdatePartenaire, useDeletePartenaire } from '@/api/referentiel';
import { useSyncFournisseursSap } from '@/api/sap';
import { apiErrorMessage, NUMERO_CLIENT_REGEX, chiffresSeulement } from '@/lib/utils';
import type { Partenaire, TypePartenaire } from '@/types/api';
import { SapCheckButton } from '@/components/sap/SapVerify';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { Pill, type PillTone } from '@/components/ui/pill';
import { SortableHeader } from '@/components/SortableHeader';
import { useTableSort } from '@/hooks/useTableSort';

const PART_SORT_COLUMNS = ['code', 'raisonSociale'] as const;
type PartSortCol = (typeof PART_SORT_COLUMNS)[number];

const PAGE_SIZES = [10, 20, 50, 100] as const;

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const schema = z.object({
  code: z.string().trim().min(1, 'Requis'),
  raisonSociale: z.string().trim().min(1, 'Requis'),
  typePartenaire: z.enum(['CLIENT', 'FOURNISSEUR', 'MIXTE']),
  sigle: z.string().optional(),
  // Identifiant SAP (KUNNR) : chiffres uniquement (règle appliquée aussi côté serveur).
  numeroClient: z.string().regex(NUMERO_CLIENT_REGEX, 'Chiffres uniquement').optional(),
  numeroFournisseur: z.string().optional(),
  adresse: z.string().optional(),
  telephone: z.string().optional(),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  pays: z.string().optional(),
  ville: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

const TYPE_TONE: Record<TypePartenaire, { tone: PillTone; label: string }> = {
  CLIENT: { tone: 'blue', label: 'Client' },
  FOURNISSEUR: { tone: 'amber', label: 'Fournisseur' },
  MIXTE: { tone: 'purple', label: 'Mixte' },
};

function PartenaireForm({ editing, onDone }: { editing?: Partenaire; onDone: () => void }) {
  const isEdit = !!editing;
  const create = useCreatePartenaire();
  const update = useUpdatePartenaire();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: editing
      ? {
          code: editing.code,
          raisonSociale: editing.raisonSociale,
          typePartenaire: editing.typePartenaire,
          sigle: editing.sigle ?? '',
          numeroClient: editing.numeroClient ?? '',
          numeroFournisseur: editing.numeroFournisseur ?? '',
          adresse: editing.adresse ?? '',
          telephone: editing.telephone ?? '',
          email: editing.email ?? '',
          pays: editing.pays ?? '',
          ville: editing.ville ?? '',
        }
      : { typePartenaire: 'CLIENT' },
  });

  const typePartenaire = watch('typePartenaire');
  const estFournisseur = typePartenaire === 'FOURNISSEUR' || typePartenaire === 'MIXTE';
  const pending = create.isPending || update.isPending;
  const err = create.error || update.error;
  const hasError = create.isError || update.isError;

  const onSubmit = handleSubmit((values) => {
    const clean = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v !== undefined && v !== ''),
    ) as FormValues;
    const opts = {
      onSuccess: () => {
        reset({ typePartenaire: 'CLIENT' });
        onDone();
      },
    };
    if (isEdit) update.mutate({ id: editing!.id, payload: clean }, opts);
    else create.mutate(clean, opts);
  });

  return (
    <Panel>
      <PanelHeader title={isEdit ? `Modifier — ${editing!.code}` : 'Nouveau partenaire'} />
      <form onSubmit={onSubmit} className="grid gap-4 p-[18px] sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="code">Code</Label>
          <Input id="code" {...register('code')} />
          {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="typePartenaire">Type</Label>
          <select id="typePartenaire" className={selectClass} {...register('typePartenaire')}>
            <option value="CLIENT">Client</option>
            <option value="FOURNISSEUR">Fournisseur</option>
            <option value="MIXTE">Mixte</option>
          </select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="raisonSociale">Raison sociale</Label>
          <Input id="raisonSociale" {...register('raisonSociale')} />
          {errors.raisonSociale && <p className="text-sm text-destructive">{errors.raisonSociale.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sigle">Sigle (optionnel)</Label>
          <Input id="sigle" {...register('sigle')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="numeroClient">N° client SAP (optionnel)</Label>
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <Input
                id="numeroClient"
                inputMode="numeric"
                {...register('numeroClient')}
                onChange={(e) => setValue('numeroClient', chiffresSeulement(e.target.value), { shouldValidate: true })}
              />
            </div>
            <SapCheckButton
              kind="client"
              value={watch('numeroClient') ?? ''}
              onResult={(existe, nom) => {
                if (existe && nom && !watch('raisonSociale')) setValue('raisonSociale', nom, { shouldValidate: true });
              }}
            />
          </div>
        </div>
        {estFournisseur && (
          <div className="space-y-1.5">
            <Label htmlFor="numeroFournisseur">N° fournisseur SAP (LIFNR)</Label>
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <Input id="numeroFournisseur" {...register('numeroFournisseur')} />
              </div>
              <SapCheckButton
                kind="fournisseur"
                value={watch('numeroFournisseur') ?? ''}
                onResult={(existe, nom) => {
                  if (existe && nom && !watch('raisonSociale')) setValue('raisonSociale', nom, { shouldValidate: true });
                }}
              />
            </div>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="telephone">Téléphone (optionnel)</Label>
          <Input id="telephone" {...register('telephone')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email (optionnel)</Label>
          <Input id="email" type="email" {...register('email')} />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ville">Ville (optionnel)</Label>
          <Input id="ville" {...register('ville')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pays">Pays (optionnel)</Label>
          <Input id="pays" {...register('pays')} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="adresse">Adresse (optionnel)</Label>
          <Input id="adresse" {...register('adresse')} />
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
              {apiErrorMessage(err, isEdit ? 'Modification impossible' : 'Création impossible')}
            </p>
          )}
        </div>
      </form>
    </Panel>
  );
}

export function PartenairesPage() {
  const sort = useTableSort<PartSortCol>('/partenaires', PART_SORT_COLUMNS, { by: 'raisonSociale', dir: 'asc' });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: partenaires, isLoading, isError } = usePartenaires({
    search: debouncedSearch || undefined,
    sortBy: sort.state.by ?? undefined,
    sortDir: sort.state.by ? sort.state.dir : undefined,
  });
  const remove = useDeletePartenaire();
  const sync = useSyncFournisseursSap();
  const [form, setForm] = useState<{ editing?: Partenaire } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Partenaire | null>(null);

  // Pagination client.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, pageSize, sort.state.by, sort.state.dir]);
  const list = partenaires ?? [];
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pagedPartenaires = list.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  return (
    <div className="flex flex-col gap-4">
      {form && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center" onClick={() => setForm(null)}>
          <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <PartenaireForm key={form.editing?.id ?? 'new'} editing={form.editing} onDone={() => setForm(null)} />
          </div>
        </div>
      )}

      <Panel>
        <PanelHeader title="Partenaires" badge={`${partenaires?.length ?? 0}`}>
          {!form && (
            <div className="ml-auto flex items-center gap-2">
              {sync.data && !sync.isPending && (
                <span className="text-[11px] font-medium text-[#047857]">
                  +{sync.data.ajoutes} fournisseur(s) ({sync.data.totalSap} dans SAP)
                </span>
              )}
              {sync.isError && (
                <span className="text-[11px] text-[#B42318]">{apiErrorMessage(sync.error, 'Sync impossible')}</span>
              )}
              <button
                type="button"
                onClick={() => sync.mutate()}
                disabled={sync.isPending}
                title="Récupérer les nouveaux fournisseurs depuis SAP"
                className="flex items-center gap-1.5 rounded-[9px] border border-[rgba(15,76,129,0.2)] px-3 py-1.5 text-[11px] font-medium text-[#0F4C81] transition hover:bg-[#EFF6FF] disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${sync.isPending ? 'animate-spin' : ''}`} />
                {sync.isPending ? 'Synchronisation…' : 'Synchronisation'}
              </button>
              <button
                type="button"
                onClick={() => setForm({})}
                className="flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-3.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-[#1A6DB5]"
              >
                <Plus className="h-4 w-4" /> Nouveau partenaire
              </button>
            </div>
          )}
        </PanelHeader>

        <div className="flex flex-wrap items-center gap-2 border-b border-[rgba(15,76,129,0.07)] px-[18px] py-3">
          <Search className="h-4 w-4 text-[#64748B]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher (raison sociale, code, n° client)…"
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
        {isError && <div className="px-[18px] py-8 text-sm text-[#EF4444]">Impossible de charger les partenaires.</div>}

        {partenaires && (
          <table className="w-full text-xs">
            <thead className="bg-[#F8FAFC]">
              <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
                <SortableHeader column="code" state={sort.state} onSort={sort.setSort}>Code</SortableHeader>
                <SortableHeader column="raisonSociale" state={sort.state} onSort={sort.setSort}>Raison sociale</SortableHeader>
                <th className="px-4 py-2.5 font-semibold">Type</th>
                <th className="px-4 py-2.5 font-semibold">N° client SAP</th>
                <th className="px-4 py-2.5 font-semibold">N° fournisseur SAP</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-[#64748B]">
                    Aucun partenaire.
                  </td>
                </tr>
              )}
              {pagedPartenaires.map((p) => {
                const t = TYPE_TONE[p.typePartenaire];
                return (
                  <tr key={p.id} className="border-t border-[rgba(15,76,129,0.07)] hover:bg-[#FAFBFF]">
                    <td className="px-4 py-3 font-medium">{p.code}</td>
                    <td className="px-4 py-3">{p.raisonSociale}</td>
                    <td className="px-4 py-3">
                      <Pill tone={t.tone}>{t.label}</Pill>
                    </td>
                    <td className="px-4 py-3 font-mono text-[#64748B]">{p.numeroClient ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-[#64748B]">{p.numeroFournisseur ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          aria-label="Modifier"
                          onClick={() => setForm({ editing: p })}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] transition-colors hover:bg-[#EFF6FF] hover:text-[#1A6DB5]"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Désactiver"
                          disabled={remove.isPending}
                          onClick={() => setPendingDelete(p)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] transition-colors hover:bg-[#FEF2F2] hover:text-[#EF4444]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
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
        title={pendingDelete ? `Désactiver le partenaire ${pendingDelete.code} ?` : ''}
        description={
          pendingDelete
            ? `« ${pendingDelete.raisonSociale} » n'apparaîtra plus dans les listes. Rien n'est supprimé définitivement.`
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
          if (pendingDelete) remove.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) });
        }}
      />
    </div>
  );
}
