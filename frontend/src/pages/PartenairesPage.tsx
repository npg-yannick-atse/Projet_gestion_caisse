import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Search, Trash2 } from 'lucide-react';
import { usePartenaires, useCreatePartenaire, useDeletePartenaire } from '@/api/referentiel';
import { apiErrorMessage } from '@/lib/utils';
import type { TypePartenaire } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { Pill, type PillTone } from '@/components/ui/pill';

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const schema = z.object({
  code: z.string().min(1, 'Requis'),
  raisonSociale: z.string().min(1, 'Requis'),
  typePartenaire: z.enum(['CLIENT', 'FOURNISSEUR', 'MIXTE']),
  sigle: z.string().optional(),
  numeroClient: z.string().optional(),
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

function CreatePartenaireForm({ onDone }: { onDone: () => void }) {
  const create = useCreatePartenaire();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { typePartenaire: 'CLIENT' } });

  const onSubmit = handleSubmit((values) => {
    const clean = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v !== undefined && v !== ''),
    ) as FormValues;
    create.mutate(clean, {
      onSuccess: () => {
        reset({ typePartenaire: 'CLIENT' });
        onDone();
      },
    });
  });

  return (
    <Panel>
      <PanelHeader title="Nouveau partenaire" />
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
          <Label htmlFor="numeroClient">N° client (optionnel)</Label>
          <Input id="numeroClient" {...register('numeroClient')} />
        </div>
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

export function PartenairesPage() {
  const { data: partenaires, isLoading, isError } = usePartenaires();
  const remove = useDeletePartenaire();
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (partenaires ?? []).filter(
      (p) =>
        !q ||
        p.raisonSociale.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        (p.numeroClient ?? '').toLowerCase().includes(q),
    );
  }, [partenaires, search]);

  return (
    <div className="flex flex-col gap-4">
      {showForm && <CreatePartenaireForm onDone={() => setShowForm(false)} />}

      <Panel>
        <PanelHeader title="Partenaires" badge={`${partenaires?.length ?? 0}`}>
          {!showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="ml-auto flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-3.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-[#1A6DB5]"
            >
              <Plus className="h-4 w-4" /> Nouveau partenaire
            </button>
          )}
        </PanelHeader>

        <div className="flex items-center gap-2 border-b border-[rgba(15,76,129,0.07)] px-[18px] py-3">
          <Search className="h-4 w-4 text-[#64748B]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher (raison sociale, code, n° client)…"
            className="w-full rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-[#F8FAFC] px-3 py-1.5 text-xs text-[#0F172A] outline-none focus:border-[#1A6DB5] focus:bg-white"
          />
        </div>

        {isLoading && <div className="px-[18px] py-8 text-sm text-[#64748B]">Chargement…</div>}
        {isError && <div className="px-[18px] py-8 text-sm text-[#EF4444]">Impossible de charger les partenaires.</div>}

        {partenaires && (
          <table className="w-full text-xs">
            <thead className="bg-[#F8FAFC]">
              <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
                <th className="px-4 py-2.5 font-semibold">Code</th>
                <th className="px-4 py-2.5 font-semibold">Raison sociale</th>
                <th className="px-4 py-2.5 font-semibold">Type</th>
                <th className="px-4 py-2.5 font-semibold">Contact</th>
                <th className="px-4 py-2.5 font-semibold">Ville</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-[#64748B]">
                    Aucun partenaire.
                  </td>
                </tr>
              )}
              {filtered.map((p) => {
                const t = TYPE_TONE[p.typePartenaire];
                return (
                  <tr key={p.id} className="border-t border-[rgba(15,76,129,0.07)] hover:bg-[#FAFBFF]">
                    <td className="px-4 py-3 font-medium">{p.code}</td>
                    <td className="px-4 py-3">{p.raisonSociale}</td>
                    <td className="px-4 py-3">
                      <Pill tone={t.tone}>{t.label}</Pill>
                    </td>
                    <td className="px-4 py-3 text-[#64748B]">{p.numeroClient ?? '—'}</td>
                    <td className="px-4 py-3 text-[#64748B]">—</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        aria-label="Désactiver"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (confirm(`Désactiver le partenaire ${p.code} ?`)) remove.mutate(p.id);
                        }}
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
    </div>
  );
}
