import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from '@tanstack/react-router';
import {
  ArrowDownCircle,
  ArrowLeftRight,
  ArrowUpCircle,
  Check,
  ExternalLink,
  History,
  Landmark,
  Plus,
  SlidersHorizontal,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import { useExtensionsEnAttente, useApprouverExtension, useRefuserExtension, useSousBons } from '@/api/bons';
import { useCaisses, useCaisseSolde } from '@/api/caisses';
import { usePortefeuilles, usePortefeuilleSolde } from '@/api/financierRef';
import { useOperationsByCaisse, useOperationsByPortefeuille } from '@/api/ledger';
import { useCreateDemandeRecharge } from '@/api/demandesRecharge';
import { useUsers, useUserRoles, useMyPermissions } from '@/api/users';
import { useAuthStore } from '@/stores/auth.store';
import { apiErrorMessage, cn, formatMontant } from '@/lib/utils';
import type { Bon, Caisse, ExtensionMode, Operation, Portefeuille, TypeOperation } from '@/types/api';
import { Panel, PanelHeader } from '@/components/ui/panel';

const MODE_LABEL: Record<ExtensionMode, string> = {
  DECOUVERT: 'Autoriser le dépassement (découvert)',
  RECHARGE: 'Recharger le portefeuille',
};

const OP_META: Record<TypeOperation, { label: string; cls: string; sign: string; icon: typeof ArrowUpCircle }> = {
  RECHARGE: { label: 'Recharge', cls: 'text-[#047857]', sign: '+', icon: ArrowUpCircle },
  DECAISSEMENT: { label: 'Décaissement', cls: 'text-[#B42318]', sign: '−', icon: ArrowDownCircle },
  TRANSFERT: { label: 'Transfert', cls: 'text-[#1A6DB5]', sign: '', icon: ArrowLeftRight },
  AJUSTEMENT: { label: 'Ajustement', cls: 'text-[#92400E]', sign: '', icon: SlidersHorizontal },
  ENCAISSEMENT: { label: 'Encaissement', cls: 'text-[#047857]', sign: '+', icon: ArrowUpCircle },
  CREDIT: { label: 'Crédit', cls: 'text-[#6D28D9]', sign: '−', icon: ArrowDownCircle },
  SALAIRE: { label: 'Salaire', cls: 'text-[#6D28D9]', sign: '−', icon: ArrowDownCircle },
  // Le remboursement fait RENTRER l'argent : signe et flèche inverses du crédit.
  REMBOURSEMENT_CREDIT: { label: 'Remb. crédit', cls: 'text-[#047857]', sign: '+', icon: ArrowUpCircle },
};

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-[9px] border border-[rgba(15,76,129,0.08)] bg-[#F8FAFC] px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.6px] text-[#64748B]">{label}</div>
      <div className={cn('mt-0.5 font-display text-[15px] font-semibold tabular-nums text-[#0F172A]', accent)}>
        {value}
      </div>
    </div>
  );
}

/** Bloc « budget » d'une demande : portefeuille étendu + caisse source + montant demandé. */
function BudgetBlock({
  caisseId,
  portefeuilleId,
  caisseLabel,
  portefeuilleLabel,
  montantDemande,
}: {
  caisseId: string;
  portefeuilleId: string;
  caisseLabel: string;
  portefeuilleLabel: string;
  montantDemande: string;
}) {
  const { data: ptf } = usePortefeuilleSolde(portefeuilleId);
  const { data: caisse } = useCaisseSolde(caisseId);

  return (
    <div className="mt-3 rounded-[10px] border border-[rgba(15,76,129,0.1)] bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
        <span className="inline-flex items-center gap-1.5 font-medium text-[#0F172A]">
          <Wallet className="h-3.5 w-3.5 text-[#00C896]" /> {portefeuilleLabel}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[#64748B]">
          <Landmark className="h-3.5 w-3.5 text-[#1A6DB5]" /> {caisseLabel}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Budget alloué" value={ptf?.soldeInitial ? formatMontant(ptf.soldeInitial) : '…'} />
        <Stat
          label="Solde portefeuille"
          value={ptf?.solde ? formatMontant(ptf.solde) : '…'}
          accent={ptf && Number(ptf.solde) < 0 ? 'text-[#B42318]' : 'text-[#047857]'}
        />
        <Stat label="Solde caisse" value={caisse?.solde ? formatMontant(caisse.solde) : '…'} />
        <Stat label="Montant demandé" value={formatMontant(montantDemande)} accent="text-[#92400E]" />
      </div>
    </div>
  );
}

/** Historique (modal) des mouvements — d'une caisse OU d'un portefeuille. */
function HistoryModal({
  title,
  label,
  caisseId,
  portefeuilleId,
  onClose,
}: {
  title: string;
  label: string;
  caisseId?: string;
  portefeuilleId?: string;
  onClose: () => void;
}) {
  // Aperçu des 50 derniers mouvements : la troncature est faite EN BASE (TOP 50).
  const caisseQ = useOperationsByCaisse(caisseId ?? null, !!caisseId, 50);
  const ptfQ = useOperationsByPortefeuille(portefeuilleId ?? null, !!portefeuilleId, 50);
  const ops = caisseId ? caisseQ.data : ptfQ.data;
  const isLoading = caisseId ? caisseQ.isLoading : ptfQ.isLoading;
  const recent = ops ?? [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0A1628]/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="flex max-h-[82vh] w-full max-w-lg flex-col overflow-hidden rounded-[14px] border border-[rgba(15,76,129,0.1)] bg-white shadow-[0_20px_50px_rgba(15,23,42,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[rgba(15,76,129,0.08)] bg-[#F8FAFC] px-5 py-3.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#EFF6FF] text-[#1A6DB5]">
            <History className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[13px] font-semibold text-[#0F172A]">{title}</div>
            <div className="truncate text-[11px] text-[#64748B]">{label}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] transition-colors hover:bg-white hover:text-[#0F172A]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading && <div className="px-5 py-8 text-center text-xs text-[#64748B]">Chargement…</div>}
          {!isLoading && recent.length === 0 && (
            <div className="px-5 py-8 text-center text-xs text-[#64748B]">Aucun mouvement.</div>
          )}
          {recent.map((op: Operation) => {
            const m = OP_META[op.typeOperation];
            const Icon = m.icon;
            return (
              <div
                key={op.id}
                className="flex items-center gap-3 border-t border-[rgba(15,76,129,0.05)] px-5 py-2.5 text-xs first:border-t-0"
              >
                <Icon className={cn('h-4 w-4 shrink-0', m.cls)} />
                <span className="w-28 shrink-0 text-[#64748B]">
                  {new Date(op.dateOperation).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
                <span className="flex-1 truncate text-[#475569]">
                  {m.label}
                  {op.reference ? <span className="text-[#94A3B8]"> · {op.reference}</span> : null}
                </span>
                <span className={cn('shrink-0 font-semibold tabular-nums', m.cls)}>
                  {m.sign}
                  {formatMontant(op.montant)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Modal : demander une recharge (anticipation) pour un portefeuille donné. */
function RechargeRequestModal({ ptf, onClose }: { ptf: Portefeuille; onClose: () => void }) {
  const create = useCreateDemandeRecharge();
  const [montant, setMontant] = useState('');
  const [motif, setMotif] = useState('');
  const [done, setDone] = useState(false);
  const valid = /^\d+(\.\d{1,4})?$/.test(montant) && Number(montant) > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !create.isPending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [create.isPending, onClose]);

  const submit = () => {
    if (!valid) return;
    create.mutate(
      { montant, motif: motif || undefined, portefeuilleId: ptf.id },
      { onSuccess: () => setDone(true) },
    );
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0A1628]/60 p-4"
      onClick={create.isPending ? undefined : onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Demander une recharge"
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-[14px] border border-[rgba(15,76,129,0.1)] bg-white shadow-[0_20px_50px_rgba(15,23,42,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[rgba(15,76,129,0.08)] bg-[#F8FAFC] px-5 py-3.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#ECFDF5] text-[#047857]">
            <Wallet className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[13px] font-semibold text-[#0F172A]">Demander une recharge</div>
            <div className="truncate text-[11px] text-[#64748B]">
              {ptf.libelle} ({ptf.code})
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] transition-colors hover:bg-white hover:text-[#0F172A]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {done ? (
          <div className="px-5 py-6 text-center">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[#ECFDF5] text-[#047857]">
              <Check className="h-5 w-5" />
            </div>
            <p className="text-sm text-[#0F172A]">Demande envoyée. Un caissier la traitera.</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 rounded-[9px] bg-[#0F4C81] px-4 py-2 text-xs font-medium text-white hover:bg-[#1A6DB5]"
            >
              Fermer
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-3 px-5 py-4">
              <div className="space-y-1.5">
                <label htmlFor="anticip-montant" className="text-[11px] font-semibold uppercase tracking-[0.6px] text-[#64748B]">
                  Montant souhaité
                </label>
                <input
                  id="anticip-montant"
                  inputMode="decimal"
                  autoFocus
                  value={montant}
                  onChange={(e) => setMontant(e.target.value)}
                  placeholder="Ex : 50 000"
                  className={cn(
                    'h-10 w-full rounded-[9px] border bg-white px-3 text-sm text-[#0F172A] outline-none focus:border-[#1A6DB5]',
                    valid || !montant ? 'border-[rgba(15,76,129,0.12)]' : 'border-[#FCA5A5]',
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="anticip-motif" className="text-[11px] font-semibold uppercase tracking-[0.6px] text-[#64748B]">
                  Motif (optionnel)
                </label>
                <input
                  id="anticip-motif"
                  value={motif}
                  onChange={(e) => setMotif(e.target.value)}
                  placeholder="Anticipation de dépenses…"
                  className="h-10 w-full rounded-[9px] border border-[rgba(15,76,129,0.12)] bg-white px-3 text-sm text-[#0F172A] outline-none focus:border-[#1A6DB5]"
                />
              </div>
              {create.isError && (
                <p className="text-xs text-[#EF4444]">{apiErrorMessage(create.error, 'Demande impossible')}</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 bg-[#F8FAFC] px-5 py-3">
              <button
                type="button"
                onClick={onClose}
                disabled={create.isPending}
                className="rounded-[9px] border border-[rgba(15,76,129,0.15)] bg-white px-3.5 py-2 text-xs font-medium text-[#475569] hover:bg-[#F1F5F9] disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!valid || create.isPending}
                className="inline-flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#1A6DB5] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus className="h-4 w-4" /> {create.isPending ? 'Envoi…' : 'Envoyer la demande'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Largeur de la barre par paliers de 10 % (évite un style inline dynamique). */
const BAR_WIDTH: Record<number, string> = {
  0: 'w-0',
  10: 'w-[10%]',
  20: 'w-[20%]',
  30: 'w-[30%]',
  40: 'w-[40%]',
  50: 'w-[50%]',
  60: 'w-[60%]',
  70: 'w-[70%]',
  80: 'w-[80%]',
  90: 'w-[90%]',
  100: 'w-full',
};

/** Carte budget d'un WALLET : budget alloué, dépensé, restant, taux % + actions. */
function WalletBudgetCard({ ptf, caisseLabel }: { ptf: Portefeuille; caisseLabel: string }) {
  const { data } = usePortefeuilleSolde(ptf.id);
  const [histOpen, setHistOpen] = useState(false);
  const [rechargeOpen, setRechargeOpen] = useState(false);

  const budget = Number(data?.soldeInitial ?? ptf.soldeInitial ?? 0);
  const solde = data ? Number(data.solde) : null;
  const depense = solde != null ? Math.max(0, budget - solde) : null;
  const taux = budget > 0 && depense != null ? Math.min(100, (depense / budget) * 100) : null;
  const barCls = taux == null ? 'bg-[#CBD5E1]' : taux >= 90 ? 'bg-[#EF4444]' : taux >= 75 ? 'bg-[#F59E0B]' : 'bg-[#00C896]';
  const widthCls = BAR_WIDTH[Math.min(100, Math.max(0, Math.round((taux ?? 0) / 10) * 10))];

  return (
    <div className="rounded-[11px] border border-[rgba(15,76,129,0.1)] bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-[9px] bg-[#ECFDF5] text-[#047857]">
          <Wallet className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="font-semibold text-[#0F172A]">
            {ptf.libelle} <span className="text-[11px] font-normal text-[#94A3B8]">({ptf.code})</span>
          </div>
          <div className="inline-flex items-center gap-1 text-[11px] text-[#64748B]">
            <Landmark className="h-3 w-3 text-[#1A6DB5]" /> {caisseLabel}
          </div>
        </div>
        <span className="ml-auto font-display text-[18px] font-bold tabular-nums text-[#0F172A]">
          {taux != null ? `${Math.round(taux)} %` : '…'}
        </span>
      </div>

      {/* Barre de consommation du budget */}
      <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-[#F1F5F9]">
        <div className={cn('h-full rounded-full transition-all', barCls, widthCls)} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Budget" value={formatMontant(String(budget))} />
        <Stat label="Dépensé" value={depense != null ? formatMontant(String(depense)) : '…'} accent="text-[#B42318]" />
        <Stat
          label="Restant"
          value={solde != null ? formatMontant(String(solde)) : '…'}
          accent={solde != null && solde < 0 ? 'text-[#B42318]' : 'text-[#047857]'}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setHistOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-[9px] border border-[rgba(15,76,129,0.15)] bg-white px-3 py-1.5 text-xs font-medium text-[#0F4C81] transition hover:bg-[#E8F2FF]"
        >
          <History className="h-4 w-4" /> Historique
        </button>
        <button
          type="button"
          onClick={() => setRechargeOpen(true)}
          title="Anticiper : demander une recharge de ce portefeuille"
          className="inline-flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#1A6DB5]"
        >
          <Plus className="h-4 w-4" /> Faire une demande
        </button>
      </div>

      {histOpen && (
        <HistoryModal
          title="Historique du portefeuille"
          label={`${ptf.libelle} (${ptf.code})`}
          portefeuilleId={ptf.id}
          onClose={() => setHistOpen(false)}
        />
      )}
      {rechargeOpen && <RechargeRequestModal ptf={ptf} onClose={() => setRechargeOpen(false)} />}
    </div>
  );
}

function ExtensionRow({ bon, demandeur }: { bon: Bon; demandeur?: string }) {
  const approuver = useApprouverExtension();
  const refuser = useRefuserExtension();
  const [mode, setMode] = useState<ExtensionMode>('DECOUVERT');
  const [commentaire, setCommentaire] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const busy = approuver.isPending || refuser.isPending;
  const error = apiErrorMessage(approuver.error, '') || apiErrorMessage(refuser.error, '');

  // Le portefeuille / la caisse vivent sur les sous-bons (un bon = enveloppe).
  const { data: sousBons } = useSousBons(bon.id);
  const { data: caisses } = useCaisses();
  const { data: portefeuilles } = usePortefeuilles();
  const sb = sousBons?.[0];
  const caisseId = sb?.caisseId ?? null;
  const portefeuilleId = sb?.portefeuilleId ?? null;
  const caisse = caisses?.find((c) => c.id === caisseId);
  const portefeuille = portefeuilles?.find((p) => p.id === portefeuilleId);
  const caisseLabel = caisse ? `${caisse.libelle} (${caisse.code})` : caisseId ? `Caisse #${caisseId}` : '—';
  const ptfLabel = portefeuille
    ? `${portefeuille.libelle} (${portefeuille.code})`
    : portefeuilleId
      ? `Portefeuille #${portefeuilleId}`
      : '—';
  const multi = (sousBons?.length ?? 0) > 1;

  return (
    <div className="rounded-[11px] border border-[rgba(15,76,129,0.08)] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#0F172A]">{bon.numero}</span>
            <span className="rounded-full bg-[#FFFBEB] px-2 py-0.5 text-[11px] font-semibold text-[#92400E]">
              {formatMontant(bon.montantTotal)}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-[#64748B]">
            {demandeur ? `Demandeur : ${demandeur} · ` : ''}
            {new Date(bon.createdAt).toLocaleString('fr-FR')}
          </div>
        </div>
      </div>

      {bon.descriptionExtension && (
        <p className="mt-2 rounded-[8px] bg-[#F8FAFC] px-3 py-2 text-[13px] text-[#334155]">
          <span className="font-medium text-[#475569]">Justification : </span>
          {bon.descriptionExtension}
        </p>
      )}

      {caisseId && portefeuilleId && (
        <BudgetBlock
          caisseId={caisseId}
          portefeuilleId={portefeuilleId}
          caisseLabel={caisseLabel}
          portefeuilleLabel={ptfLabel}
          montantDemande={bon.montantTotal}
        />
      )}
      {multi && (
        <p className="mt-1 text-[11px] text-[#94A3B8]">
          Ce bon comporte plusieurs sous-bons — budget affiché pour le premier.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!caisseId}
          onClick={() => setHistoryOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-[9px] border border-[rgba(15,76,129,0.15)] bg-white px-3 py-1.5 text-xs font-medium text-[#0F4C81] transition hover:bg-[#E8F2FF] disabled:opacity-50"
        >
          <History className="h-4 w-4" /> Historique
        </button>
        <Link
          to="/bons/$bonId"
          params={{ bonId: bon.id }}
          className="inline-flex items-center gap-1.5 rounded-[9px] border border-[rgba(15,76,129,0.15)] bg-white px-3 py-1.5 text-xs font-medium text-[#475569] transition hover:bg-[#F1F5F9]"
        >
          <ExternalLink className="h-4 w-4" /> Voir la demande
        </Link>
      </div>

      {historyOpen && caisseId && (
        <HistoryModal
          title="Historique de la caisse"
          label={caisseLabel}
          caisseId={caisseId}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      <div className="mt-3 grid gap-3 border-t border-[rgba(15,76,129,0.08)] pt-3 sm:grid-cols-[minmax(0,260px)_1fr]">
        <div className="space-y-1">
          <label className="text-[11px] font-semibold uppercase tracking-[0.6px] text-[#64748B]">
            Mode d'approbation
          </label>
          <select
            aria-label="Mode d'approbation"
            value={mode}
            onChange={(e) => setMode(e.target.value as ExtensionMode)}
            className="h-9 w-full rounded-[9px] border border-[rgba(15,76,129,0.12)] bg-white px-2 text-sm text-[#0F172A] outline-none focus:border-[#1A6DB5]"
          >
            <option value="DECOUVERT">{MODE_LABEL.DECOUVERT}</option>
            <option value="RECHARGE">{MODE_LABEL.RECHARGE}</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-semibold uppercase tracking-[0.6px] text-[#64748B]">
            Commentaire (optionnel)
          </label>
          <input
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            placeholder="Motivation de la décision…"
            className="h-9 w-full rounded-[9px] border border-[rgba(15,76,129,0.12)] bg-white px-3 text-sm text-[#0F172A] outline-none focus:border-[#1A6DB5]"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => approuver.mutate({ id: bon.id, mode, commentaire: commentaire || undefined })}
          className="inline-flex items-center gap-1.5 rounded-[9px] bg-[#047857] px-3.5 py-2 text-xs font-medium text-white transition hover:bg-[#059669] disabled:opacity-60"
        >
          <Check className="h-4 w-4" /> Approuver
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => refuser.mutate({ id: bon.id, commentaire: commentaire || undefined })}
          className="inline-flex items-center gap-1.5 rounded-[9px] border border-[#FECACA] bg-white px-3.5 py-2 text-xs font-medium text-[#B42318] transition hover:bg-[#FEF2F2] disabled:opacity-60"
        >
          <X className="h-4 w-4" /> Refuser
        </button>
        {error && <span className="text-xs text-[#EF4444]">{error}</span>}
      </div>
    </div>
  );
}

export function DemandesExtensionPage() {
  const user = useAuthStore((s) => s.user);
  const { data: roles } = useUserRoles(user?.id ?? null);
  const { data: perms } = useMyPermissions(user?.id ?? null);
  const roleCodes = useMemo(() => new Set((roles ?? []).map((r) => r.code)), [roles]);
  const isAdmin = roleCodes.has('SUPER_ADMIN') || roleCodes.has('ADMINISTRATEUR');
  // Approbateur : peut valider/refuser les demandes (section du haut).
  const canApprove = isAdmin || (perms ?? []).includes('EXTENSION_APPROUVER');
  // Propriétaire de wallet : peut voir SES budgets et anticiper (section du bas).
  const isWalletOwner = roleCodes.has('VALIDATEUR') || roleCodes.has('GESTIONNAIRE_PORTEFEUILLE');
  const canAccess = canApprove || isWalletOwner;

  const { data: bons, isLoading } = useExtensionsEnAttente(canApprove);
  const { data: users } = useUsers();
  const userById = useMemo(() => new Map((users ?? []).map((u) => [u.id, `${u.prenom} ${u.nom}`])), [users]);
  const list: Bon[] = bons ?? [];

  // Budgets par WALLET (toujours affichés, indépendamment des demandes).
  const { data: caisses } = useCaisses();
  const { data: portefeuilles } = usePortefeuilles();
  const caisseById = useMemo(() => new Map<string, Caisse>((caisses ?? []).map((c) => [c.id, c])), [caisses]);
  const activePtfs = useMemo(() => (portefeuilles ?? []).filter((p) => p.estActif), [portefeuilles]);

  if (!canAccess) {
    return (
      <Panel>
        <div className="px-[18px] py-10 text-center text-sm text-[#64748B]">
          Vous n'avez pas accès à cette page.
        </div>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 1) Demandes d'extension en attente — réservé aux approbateurs */}
      {canApprove && (
        <Panel>
          <PanelHeader
            title={
              <span className={cn('inline-flex items-center gap-2')}>
                <TrendingUp className="h-4 w-4 text-[#1A6DB5]" /> Demandes d'extension de budget
              </span>
            }
            badge={`${list.length}`}
          />
          <div className="flex flex-col gap-3 p-[18px]">
            {isLoading && <div className="py-8 text-center text-sm text-[#64748B]">Chargement…</div>}
            {!isLoading && list.length === 0 && (
              <div className="py-10 text-center text-sm text-[#64748B]">
                Aucune demande d'extension en attente.
              </div>
            )}
            {list.map((bon) => (
              <ExtensionRow key={bon.id} bon={bon} demandeur={userById.get(bon.demandeurId)} />
            ))}
          </div>
        </Panel>
      )}

      {/* 2) Budgets des portefeuilles — visibles en permanence, avec demande d'anticipation */}
      <Panel>
        <PanelHeader
          title={
            <span className="inline-flex items-center gap-2">
              <Wallet className="h-4 w-4 text-[#047857]" /> Budgets des portefeuilles
            </span>
          }
          badge={`${activePtfs.length}`}
        />
        <div className="grid gap-3 p-[18px] lg:grid-cols-2">
          {activePtfs.length === 0 && (
            <div className="col-span-full py-6 text-center text-sm text-[#64748B]">Aucun portefeuille actif.</div>
          )}
          {activePtfs.map((p) => {
            const c = caisseById.get(p.caisseSourceId);
            return (
              <WalletBudgetCard
                key={p.id}
                ptf={p}
                caisseLabel={c ? `${c.libelle} (${c.code})` : `Caisse #${p.caisseSourceId}`}
              />
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
