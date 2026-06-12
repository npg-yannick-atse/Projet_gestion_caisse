import { useMemo, useState } from 'react';
import { Check, TrendingUp, X } from 'lucide-react';
import { useExtensionsEnAttente, useApprouverExtension, useRefuserExtension } from '@/api/bons';
import { useUsers, useUserRoles, useMyPermissions } from '@/api/users';
import { useAuthStore } from '@/stores/auth.store';
import { apiErrorMessage, cn, formatMontant } from '@/lib/utils';
import type { Bon, ExtensionMode } from '@/types/api';
import { Panel, PanelHeader } from '@/components/ui/panel';

const MODE_LABEL: Record<ExtensionMode, string> = {
  DECOUVERT: 'Autoriser le dépassement (découvert)',
  RECHARGE: 'Recharger le portefeuille',
};

function ExtensionRow({ bon, demandeur }: { bon: Bon; demandeur?: string }) {
  const approuver = useApprouverExtension();
  const refuser = useRefuserExtension();
  const [mode, setMode] = useState<ExtensionMode>('DECOUVERT');
  const [commentaire, setCommentaire] = useState('');
  const busy = approuver.isPending || refuser.isPending;
  const error = apiErrorMessage(approuver.error, '') || apiErrorMessage(refuser.error, '');

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

      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,260px)_1fr]">
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
  const isAdmin = (roles ?? []).some((r) => r.code === 'SUPER_ADMIN' || r.code === 'ADMINISTRATEUR');
  const canApprove = isAdmin || (perms ?? []).includes('EXTENSION_APPROUVER');

  const { data: bons, isLoading } = useExtensionsEnAttente(canApprove);
  const { data: users } = useUsers();
  const userById = useMemo(() => new Map((users ?? []).map((u) => [u.id, `${u.prenom} ${u.nom}`])), [users]);
  const list: Bon[] = bons ?? [];

  if (!canApprove) {
    return (
      <Panel>
        <div className="px-[18px] py-10 text-center text-sm text-[#64748B]">
          Vous n'avez pas la permission d'approuver les demandes d'extension.
        </div>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
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
    </div>
  );
}
