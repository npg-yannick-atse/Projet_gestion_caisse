import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowRight,
  ArrowRightLeft,
  Ban,
  CheckCircle2,
  Filter,
  PlayCircle,
  Plus,
  Send,
  XCircle,
} from 'lucide-react';
import {
  useDemandesTransfert,
  useCreateDemandeTransfert,
  useDecisionDemandeTransfert,
  useCancelDemandeTransfert,
  useExecuteDemandeTransfert,
} from '@/api/demandesTransfert';
import { useCaisses } from '@/api/caisses';
import { usePortefeuilles, useDevises } from '@/api/financierRef';
import { useMyBonPerimeter } from '@/api/bons';
import { useUsers, useUserRoles } from '@/api/users';
import { useAuthStore } from '@/stores/auth.store';
import { apiErrorMessage, cn, formatMontant, timeAgo } from '@/lib/utils';
import type {
  DemandeTransfert,
  DemandeTransfertStatut,
  TransfertCompteType,
} from '@/types/api';
import { Button } from '@/components/ui/button';
import { SortableHeader } from '@/components/SortableHeader';
import { useTableSort } from '@/hooks/useTableSort';

const DT_SORT_COLUMNS = ['numero', 'statut', 'montant', 'createdAt'] as const;
type DtSortCol = (typeof DT_SORT_COLUMNS)[number];
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Panel, PanelHeader } from '@/components/ui/panel';

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const STATUT_TONE: Record<
  DemandeTransfertStatut,
  { bg: string; text: string; label: string }
> = {
  CREE: { bg: 'bg-[#FFFBEB]', text: 'text-[#92400E]', label: 'En attente' },
  APPROUVEE: { bg: 'bg-[#EFF6FF]', text: 'text-[#1A6DB5]', label: 'Approuvée' },
  EXECUTEE: { bg: 'bg-[#ECFDF5]', text: 'text-[#047857]', label: 'Exécutée' },
  REJETEE: { bg: 'bg-[#FEF3F2]', text: 'text-[#B42318]', label: 'Rejetée' },
  ANNULEE: { bg: 'bg-[#F1F5F9]', text: 'text-[#64748B]', label: 'Annulée' },
};

const FILTRES: { key: 'ALL' | DemandeTransfertStatut; label: string }[] = [
  { key: 'ALL', label: 'Toutes' },
  { key: 'CREE', label: 'En attente' },
  { key: 'APPROUVEE', label: 'Approuvées' },
  { key: 'EXECUTEE', label: 'Exécutées' },
  { key: 'REJETEE', label: 'Rejetées' },
  { key: 'ANNULEE', label: 'Annulées' },
];

/* ============================================================
 * FORMULAIRE DE CRÉATION
 * ============================================================ */
const schema = z
  .object({
    sourceType: z.enum(['CAISSE', 'PORTEFEUILLE']),
    sourceId: z.string().min(1, 'Source requise'),
    destinationType: z.enum(['CAISSE', 'PORTEFEUILLE']),
    destinationId: z.string().min(1, 'Destination requise'),
    montant: z.string().regex(/^\d+(\.\d{1,4})?$/, 'Montant invalide'),
    deviseId: z.string().min(1, 'Devise requise'),
    motif: z.string().max(500).optional(),
  })
  .refine(
    (v) => !(v.sourceType === v.destinationType && v.sourceId === v.destinationId),
    { message: 'Source et destination doivent être différentes', path: ['destinationId'] },
  );
type FormValues = z.infer<typeof schema>;

function CreateTransfertForm({ onDone }: { onDone: () => void }) {
  const create = useCreateDemandeTransfert();
  const { data: caisses } = useCaisses();
  const { data: portefeuilles } = usePortefeuilles();
  const { data: devises } = useDevises();
  // Périmètre de l'utilisateur : limite les comptes SOURCE (on ne transfère que depuis
  // ses propres caisses/portefeuilles). La destination reste libre.
  const { data: perimeter } = useMyBonPerimeter();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { sourceType: 'PORTEFEUILLE', destinationType: 'CAISSE' },
  });

  const sourceType = watch('sourceType');
  const destinationType = watch('destinationType');

  const renderOptions = (type: TransfertCompteType, scope: 'source' | 'destination') => {
    // Source : restreinte au périmètre de l'utilisateur. Destination : tous les comptes.
    const caisseList = scope === 'source' ? perimeter?.caisses : caisses;
    const ptfList = scope === 'source' ? perimeter?.portefeuilles : portefeuilles;
    return type === 'CAISSE'
      ? caisseList?.map((c) => (
          <option key={c.id} value={c.id}>
            {c.code} — {c.libelle}
          </option>
        ))
      : ptfList
          ?.filter((p) => p.estActif !== false)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.libelle}
            </option>
          ));
  };

  const onSubmit = handleSubmit((values) => {
    create.mutate(
      {
        ...values,
        motif: values.motif || undefined,
      },
      {
        onSuccess: () => {
          reset();
          onDone();
        },
      },
    );
  });

  return (
    <Panel>
      <PanelHeader title="Nouvelle demande de transfert" />
      <form onSubmit={onSubmit} className="grid gap-4 p-[18px] sm:grid-cols-2">
        {/* SOURCE */}
        <div className="space-y-1.5">
          <Label htmlFor="dt-source-type">Source — Type</Label>
          <select
            id="dt-source-type"
            aria-label="Type de compte source"
            title="Type de compte source"
            className={selectClass}
            {...register('sourceType')}
          >
            <option value="CAISSE">Caisse</option>
            <option value="PORTEFEUILLE">Portefeuille</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dt-source-id">Source — Compte</Label>
          <select
            id="dt-source-id"
            aria-label="Compte source"
            title="Compte source"
            className={selectClass}
            {...register('sourceId')}
          >
            <option value="">— Choisir —</option>
            {renderOptions(sourceType, 'source')}
          </select>
          {errors.sourceId && <p className="text-sm text-destructive">{errors.sourceId.message}</p>}
        </div>

        {/* DESTINATION */}
        <div className="space-y-1.5">
          <Label htmlFor="dt-dest-type">Destination — Type</Label>
          <select
            id="dt-dest-type"
            aria-label="Type de compte destination"
            title="Type de compte destination"
            className={selectClass}
            {...register('destinationType')}
          >
            <option value="CAISSE">Caisse</option>
            <option value="PORTEFEUILLE">Portefeuille</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dt-dest-id">Destination — Compte</Label>
          <select
            id="dt-dest-id"
            aria-label="Compte destination"
            title="Compte destination"
            className={selectClass}
            {...register('destinationId')}
          >
            <option value="">— Choisir —</option>
            {renderOptions(destinationType, 'destination')}
          </select>
          {errors.destinationId && (
            <p className="text-sm text-destructive">{errors.destinationId.message}</p>
          )}
        </div>

        {/* MONTANT + DEVISE */}
        <div className="space-y-1.5">
          <Label htmlFor="dt-montant">Montant</Label>
          <Input id="dt-montant" inputMode="decimal" {...register('montant')} />
          {errors.montant && <p className="text-sm text-destructive">{errors.montant.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dt-devise">Devise</Label>
          <select
            id="dt-devise"
            aria-label="Devise"
            title="Devise"
            className={selectClass}
            {...register('deviseId')}
          >
            <option value="">— Choisir —</option>
            {devises?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code}
              </option>
            ))}
          </select>
          {errors.deviseId && <p className="text-sm text-destructive">{errors.deviseId.message}</p>}
        </div>

        {/* MOTIF */}
        <div className="space-y-1.5 sm:col-span-2">
          <Label>
            Motif <span className="text-xs font-normal text-[#64748B]">(optionnel)</span>
          </Label>
          <textarea
            rows={3}
            placeholder="Préciser la raison du transfert…"
            {...register('motif')}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-[#1A6DB5] focus:ring-2 focus:ring-[#1A6DB5]/15"
            maxLength={500}
          />
        </div>

        <div className="flex items-center gap-2 sm:col-span-2">
          <Button type="submit" disabled={create.isPending}>
            <Send className="h-3.5 w-3.5" />
            {create.isPending ? 'Envoi…' : 'Soumettre la demande'}
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

/* ============================================================
 * MODAL DE DÉCISION (approuver / rejeter)
 * ============================================================ */
function DecisionModal({
  demande,
  approuve,
  onClose,
}: {
  demande: DemandeTransfert;
  approuve: boolean;
  onClose: () => void;
}) {
  const decision = useDecisionDemandeTransfert();
  const [commentaire, setCommentaire] = useState('');

  const submit = () => {
    decision.mutate(
      { id: demande.id, payload: { approuve, commentaire: commentaire.trim() || undefined } },
      { onSuccess: () => onClose() },
    );
  };

  const action = approuve ? 'Approuver' : 'Rejeter';
  const color = approuve ? 'text-[#047857]' : 'text-[#B42318]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-[13px] border border-[rgba(15,76,129,0.1)] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[rgba(15,76,129,0.07)] px-5 py-3">
          <div className={cn('font-display text-sm font-semibold', color)}>{action} la demande</div>
          <div className="text-[11px] text-[#64748B]">
            {demande.numero} • {formatMontant(demande.montant)}
          </div>
        </div>
        <div className="space-y-3 p-5">
          <div>
            <Label htmlFor="cmt">
              Commentaire <span className="text-xs font-normal text-[#64748B]">(optionnel)</span>
            </Label>
            <textarea
              id="cmt"
              rows={3}
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              placeholder="Précisions à transmettre au demandeur…"
              aria-label="Commentaire de décision"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-[#1A6DB5] focus:ring-2 focus:ring-[#1A6DB5]/15"
              maxLength={500}
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[rgba(15,76,129,0.07)] bg-[#F8FAFC] px-5 py-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={decision.isPending}
            className={approuve ? '' : 'bg-[#B42318] hover:bg-[#7F1D1D]'}
          >
            {decision.isPending ? 'Envoi…' : action}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * PAGE PRINCIPALE
 * ============================================================ */
export function DemandesTransfertPage() {
  const me = useAuthStore((s) => s.user);
  const { data: userRoles } = useUserRoles(me?.id ?? null);
  const isAdmin = (userRoles ?? []).some(
    (r) => r.code === 'SUPER_ADMIN' || r.code === 'ADMINISTRATEUR',
  );
  const isGestionnaire = (userRoles ?? []).some(
    (r) => r.code === 'GESTIONNAIRE_PORTEFEUILLE',
  );

  const [statutFilter, setStatutFilter] = useState<'ALL' | DemandeTransfertStatut>('ALL');
  const [showForm, setShowForm] = useState(false);
  const [decisionTarget, setDecisionTarget] = useState<{
    demande: DemandeTransfert;
    approuve: boolean;
  } | null>(null);

  // Tri serveur URL-synced
  const sort = useTableSort<DtSortCol>('/transferts', DT_SORT_COLUMNS);
  const { data: demandes, isLoading } = useDemandesTransfert({
    statut: statutFilter === 'ALL' ? undefined : statutFilter,
    sortBy: sort.state.by ?? undefined,
    sortDir: sort.state.by ? sort.state.dir : undefined,
  });
  const { data: caisses } = useCaisses();
  const { data: portefeuilles } = usePortefeuilles();
  const { data: users } = useUsers();
  const { data: devises } = useDevises();

  const caissesById = new Map((caisses ?? []).map((c) => [c.id, c]));
  const ptfById = new Map((portefeuilles ?? []).map((p) => [p.id, p]));
  const userById = new Map((users ?? []).map((u) => [u.id, u]));
  const deviseById = new Map((devises ?? []).map((d) => [d.id, d]));

  const cancel = useCancelDemandeTransfert();
  const execute = useExecuteDemandeTransfert();

  const compteLabel = (type: TransfertCompteType, id: string) => {
    if (type === 'CAISSE') {
      const c = caissesById.get(id);
      return c ? `${c.code} · ${c.libelle}` : id;
    }
    const p = ptfById.get(id);
    return p ? `${p.code} · ${p.libelle}` : id;
  };

  // Compteurs pour les onglets
  const counts = useMemo(() => {
    const init: Record<'ALL' | DemandeTransfertStatut, number> = {
      ALL: 0,
      CREE: 0,
      APPROUVEE: 0,
      EXECUTEE: 0,
      REJETEE: 0,
      ANNULEE: 0,
    };
    for (const d of demandes ?? []) {
      init.ALL += 1;
      init[d.statut] += 1;
    }
    return init;
  }, [demandes]);

  return (
    <div className="flex flex-col gap-4">
      {showForm && <CreateTransfertForm onDone={() => setShowForm(false)} />}

      <Panel>
        <PanelHeader
          title="Demandes de transfert"
          badge={`${demandes?.length ?? 0}`}
        >
          {!showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="ml-auto flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-3.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-[#1A6DB5]"
            >
              <Plus className="h-4 w-4" /> Nouvelle demande
            </button>
          )}
        </PanelHeader>

        {/* Filtres */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[rgba(15,76,129,0.07)] px-[18px] py-3">
          <Filter className="h-3.5 w-3.5 text-[#64748B]" />
          {FILTRES.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatutFilter(f.key)}
              className={
                statutFilter === f.key
                  ? 'rounded-[7px] border border-[#0F4C81] bg-[#0F4C81] px-2.5 py-1 text-[10px] font-medium text-white'
                  : 'rounded-[7px] border border-[rgba(15,76,129,0.1)] bg-white px-2.5 py-1 text-[10px] font-medium text-[#475569] hover:bg-[#F8FAFC]'
              }
            >
              {f.label} <span className="opacity-60">({counts[f.key]})</span>
            </button>
          ))}
        </div>

        {isLoading && <div className="px-[18px] py-8 text-sm text-[#64748B]">Chargement…</div>}

        {demandes && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#F8FAFC]">
                <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
                  <SortableHeader column="numero" state={sort.state} onSort={sort.setSort}>
                    N°
                  </SortableHeader>
                  <th className="px-4 py-2.5 font-semibold">Source</th>
                  <th className="px-4 py-2.5"></th>
                  <th className="px-4 py-2.5 font-semibold">Destination</th>
                  <SortableHeader
                    column="montant"
                    state={sort.state}
                    onSort={sort.setSort}
                    align="right"
                    defaultDir="desc"
                  >
                    Montant
                  </SortableHeader>
                  <th className="px-4 py-2.5 font-semibold">Demandeur</th>
                  <SortableHeader column="statut" state={sort.state} onSort={sort.setSort}>
                    Statut
                  </SortableHeader>
                  <SortableHeader
                    column="createdAt"
                    state={sort.state}
                    onSort={sort.setSort}
                    defaultDir="desc"
                  >
                    Date
                  </SortableHeader>
                  <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {demandes.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-[#64748B]">
                      <div className="mb-2 flex justify-center">
                        <ArrowRightLeft className="h-8 w-8 text-[#94A3B8]" />
                      </div>
                      Aucune demande de transfert.
                    </td>
                  </tr>
                )}
                {demandes.map((d) => {
                  const u = userById.get(d.demandeurId);
                  const tone = STATUT_TONE[d.statut];
                  const dev = deviseById.get(d.deviseId);
                  const isMine = me?.id === d.demandeurId;
                  const canDecide = !isMine && d.statut === 'CREE' && (isAdmin || isGestionnaire);
                  const canExecute = d.statut === 'APPROUVEE' && (isAdmin || isGestionnaire);
                  const canCancel = isMine && d.statut === 'CREE';

                  return (
                    <tr key={d.id} className="border-t border-[rgba(15,76,129,0.07)] hover:bg-[#FAFBFF]">
                      <td className="px-4 py-3 font-mono font-semibold text-[#1A6DB5]">{d.numero}</td>
                      <td className="px-4 py-3">
                        <div className="text-[#0F172A]">
                          {compteLabel(d.sourceType, d.sourceId)}
                        </div>
                        <div className="text-[10px] uppercase tracking-[0.5px] text-[#94A3B8]">
                          {d.sourceType}
                        </div>
                      </td>
                      <td className="px-2 py-3 text-[#94A3B8]">
                        <ArrowRight className="h-4 w-4" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-[#0F172A]">
                          {compteLabel(d.destinationType, d.destinationId)}
                        </div>
                        <div className="text-[10px] uppercase tracking-[0.5px] text-[#94A3B8]">
                          {d.destinationType}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-display text-[13px] font-semibold tabular-nums text-[#0F172A]">
                          {formatMontant(d.montant)}
                        </div>
                        {dev && <div className="text-[10px] text-[#94A3B8]">{dev.code}</div>}
                      </td>
                      <td className="px-4 py-3 text-[#475569]">
                        {u ? `${u.prenom} ${u.nom}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                            tone.bg,
                            tone.text,
                          )}
                        >
                          {tone.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#64748B]">
                        {timeAgo(d.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          {canDecide && (
                            <>
                              <button
                                type="button"
                                onClick={() => setDecisionTarget({ demande: d, approuve: true })}
                                title="Approuver"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] bg-[#ECFDF5] text-[#047857] hover:bg-[#10B981] hover:text-white"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDecisionTarget({ demande: d, approuve: false })}
                                title="Rejeter"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] bg-[#FEF3F2] text-[#B42318] hover:bg-[#EF4444] hover:text-white"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                          {canExecute && (
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(`Exécuter le transfert ${d.numero} ?`))
                                  execute.mutate(d.id);
                              }}
                              disabled={execute.isPending}
                              title="Exécuter"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] bg-[#EFF6FF] text-[#0F4C81] hover:bg-[#1A6DB5] hover:text-white disabled:opacity-50"
                            >
                              <PlayCircle className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {canCancel && (
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(`Annuler votre demande ${d.numero} ?`))
                                  cancel.mutate(d.id);
                              }}
                              disabled={cancel.isPending}
                              title="Annuler"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] bg-[#F1F5F9] text-[#475569] hover:bg-[#FEF3F2] hover:text-[#B42318]"
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {!canDecide && !canExecute && !canCancel && (
                            <span className="text-[10px] text-[#94A3B8]">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {decisionTarget && (
        <DecisionModal
          demande={decisionTarget.demande}
          approuve={decisionTarget.approuve}
          onClose={() => setDecisionTarget(null)}
        />
      )}
    </div>
  );
}
