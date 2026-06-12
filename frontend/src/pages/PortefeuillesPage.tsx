import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Wallet } from 'lucide-react';
import {
  usePortefeuilles,
  useCreatePortefeuille,
  useDevises,
  usePortefeuilleSolde,
} from '@/api/financierRef';
import { useCaisses } from '@/api/caisses';
import { useUsers } from '@/api/users';
import { useDirections } from '@/api/directions';
import { useOperations } from '@/api/ledger';
import { apiErrorMessage, cn, formatMontant } from '@/lib/utils';
import type { Portefeuille, TypeOperation } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { Pill, type PillTone } from '@/components/ui/pill';

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const WALLET_BG = ['bg-[#0F4C81]', 'bg-[#047857]', 'bg-[#5B21B6]'];

const schema = z.object({
  code: z.string().min(1, 'Requis'),
  libelle: z.string().min(1, 'Requis'),
  caisseSourceId: z.string().min(1, 'Caisse requise'),
  deviseId: z.string().min(1, 'Devise requise'),
  proprietaireType: z.enum(['USER', 'DIRECTION']),
  proprietaireId: z.string().min(1, 'Propriétaire requis'),
  soldeInitial: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

const OP_PILL: Record<TypeOperation, { tone: PillTone; label: string }> = {
  RECHARGE: { tone: 'blue', label: 'Crédit' },
  DECAISSEMENT: { tone: 'red', label: 'Débit' },
  TRANSFERT: { tone: 'amber', label: 'Transfert' },
  AJUSTEMENT: { tone: 'gray', label: 'Ajustement' },
};

function WalletCard({ pf, deviseCode, color }: { pf: Portefeuille; deviseCode: string; color: string }) {
  const { data } = usePortefeuilleSolde(pf.id);
  return (
    <div className={cn('relative overflow-hidden rounded-[13px] p-[18px] text-white', color)}>
      <div className="absolute -right-5 -top-5 h-20 w-20 rounded-full bg-white/[0.06]" />
      <div className="absolute -bottom-8 right-2.5 h-[100px] w-[100px] rounded-full bg-white/[0.04]" />
      <Wallet className="absolute right-4 top-1/2 h-7 w-7 -translate-y-1/2 text-white/15" />
      <div className="relative">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.7px] text-white/60">{pf.libelle}</div>
        <div className="font-display text-[22px] font-bold leading-none">{data ? formatMontant(data.solde) : '…'}</div>
        <div className="mt-[3px] text-[11px] text-white/50">{deviseCode} • Solde disponible</div>
      </div>
    </div>
  );
}

function CreatePortefeuilleForm({ onDone }: { onDone: () => void }) {
  const { data: caisses } = useCaisses();
  const { data: users } = useUsers();
  const { data: directions } = useDirections();
  const createPortefeuille = useCreatePortefeuille();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { proprietaireType: 'USER' } });

  const caisseSourceId = watch('caisseSourceId');
  const proprietaireType = watch('proprietaireType');
  const selectedCaisse = caisses?.find((c) => c.id === caisseSourceId);

  useEffect(() => {
    if (selectedCaisse) setValue('deviseId', selectedCaisse.deviseId);
  }, [selectedCaisse, setValue]);

  const onSubmit = handleSubmit((values) => {
    createPortefeuille.mutate(
      { ...values, soldeInitial: values.soldeInitial || undefined },
      {
        onSuccess: () => {
          reset({ proprietaireType: 'USER' });
          onDone();
        },
      },
    );
  });

  return (
    <Panel>
      <PanelHeader title="Nouveau portefeuille" />
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
          <Label htmlFor="caisseSourceId">Caisse source</Label>
          <select id="caisseSourceId" className={selectClass} {...register('caisseSourceId')}>
            <option value="">— Choisir —</option>
            {caisses?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.libelle}
              </option>
            ))}
          </select>
          {errors.caisseSourceId && <p className="text-sm text-destructive">{errors.caisseSourceId.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Propriétaire</Label>
          <div className="flex gap-2">
            <select
              className={selectClass}
              {...register('proprietaireType')}
              onChange={(e) => {
                setValue('proprietaireType', e.target.value as 'USER' | 'DIRECTION');
                setValue('proprietaireId', '');
              }}
            >
              <option value="USER">Utilisateur</option>
              <option value="DIRECTION">Direction</option>
            </select>
            <select className={selectClass} {...register('proprietaireId')}>
              <option value="">— Choisir —</option>
              {proprietaireType === 'USER'
                ? users?.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.prenom} {u.nom}
                    </option>
                  ))
                : directions?.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} — {d.libelle}
                    </option>
                  ))}
            </select>
          </div>
          {errors.proprietaireId && <p className="text-sm text-destructive">{errors.proprietaireId.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="soldeInitial">Solde initial (optionnel)</Label>
          <Input id="soldeInitial" inputMode="decimal" placeholder="0" {...register('soldeInitial')} />
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Button type="submit" disabled={createPortefeuille.isPending}>
            {createPortefeuille.isPending ? 'Création…' : 'Créer'}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Annuler
          </Button>
          {createPortefeuille.isError && (
            <p className="text-sm text-destructive">{apiErrorMessage(createPortefeuille.error, 'Création impossible')}</p>
          )}
        </div>
      </form>
    </Panel>
  );
}

export function PortefeuillesPage() {
  const { data: portefeuilles, isLoading } = usePortefeuilles();
  const { data: devises } = useDevises();
  const { data: operations } = useOperations();
  const [showForm, setShowForm] = useState(false);

  const deviseCode = useMemo(() => new Map((devises ?? []).map((d) => [d.id, d.code])), [devises]);
  const recentOps = (operations ?? []).slice(0, 8);

  return (
    <div className="flex flex-col gap-4">
      {showForm && <CreatePortefeuilleForm onDone={() => setShowForm(false)} />}

      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold text-[#0F172A]">Soldes des portefeuilles</h2>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-3.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-[#1A6DB5]"
          >
            <Plus className="h-4 w-4" /> Nouveau portefeuille
          </button>
        )}
      </div>

      {isLoading && <p className="text-sm text-[#64748B]">Chargement…</p>}

      {portefeuilles && portefeuilles.length === 0 ? (
        <Panel>
          <div className="py-10 text-center text-sm text-[#64748B]">
            <div className="mb-2 text-2xl opacity-25">👛</div>
            Aucun portefeuille. Créez-en un pour commencer.
          </div>
        </Panel>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {portefeuilles?.map((pf, i) => (
            <WalletCard
              key={pf.id}
              pf={pf}
              deviseCode={deviseCode.get(pf.deviseId) ?? ''}
              color={WALLET_BG[i % WALLET_BG.length]}
            />
          ))}
        </div>
      )}

      <Panel>
        <PanelHeader title="Mouvements récents" badge={`${recentOps.length}`} />
        <table className="w-full text-xs">
          <thead className="bg-[#F8FAFC]">
            <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
              <th className="px-4 py-2.5 font-semibold">Date</th>
              <th className="px-4 py-2.5 font-semibold">Type</th>
              <th className="px-4 py-2.5 text-right font-semibold">Montant</th>
              <th className="px-4 py-2.5 font-semibold">Référence</th>
            </tr>
          </thead>
          <tbody>
            {recentOps.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-[#64748B]">
                  Aucun mouvement.
                </td>
              </tr>
            )}
            {recentOps.map((op) => {
              const p = OP_PILL[op.typeOperation];
              const credit = op.typeOperation === 'RECHARGE';
              const debit = op.typeOperation === 'DECAISSEMENT';
              return (
                <tr key={op.id} className="border-t border-[rgba(15,76,129,0.07)] hover:bg-[#FAFBFF]">
                  <td className="px-4 py-3 text-[#64748B]">{new Date(op.dateOperation).toLocaleDateString('fr-FR')}</td>
                  <td className="px-4 py-3">
                    <Pill tone={p.tone}>{p.label}</Pill>
                  </td>
                  <td
                    className={cn(
                      'px-4 py-3 text-right font-semibold tabular-nums',
                      credit ? 'text-[#059669]' : debit ? 'text-[#EF4444]' : 'text-[#0F172A]',
                    )}
                  >
                    {credit ? '+' : debit ? '−' : ''}
                    {formatMontant(op.montant)}
                  </td>
                  <td className="px-4 py-3 text-[#64748B]">{op.reference ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
