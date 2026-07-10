import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Banknote, CalendarRange, Check, Clock, Plus, Search, Wallet, X } from 'lucide-react';
import {
  useDemandesRecharge,
  useCreateDemandeRecharge,
  useMesPortefeuillesRechargeables,
  useTraiterDemandeRecharge,
  useRejeterDemandeRecharge,
  useAnnulerDemandeRecharge,
} from '@/api/demandesRecharge';
import { usePortefeuilles } from '@/api/financierRef';
import { useUserRoles, useUsers } from '@/api/users';
import { useAuthStore } from '@/stores/auth.store';
import { apiErrorMessage, cn, formatMontant } from '@/lib/utils';
import type { DemandeRecharge, DemandeRechargeStatut, RoleCode } from '@/types/api';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { RoleGuard } from '@/components/RoleGuard';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CharCounter } from '@/components/ui/char-counter';

const inputClass =
  'h-10 w-full rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-white px-3 text-sm text-[#0F172A] outline-none transition focus:border-[#1A6DB5]';
const labelClass = 'text-[11px] font-semibold uppercase tracking-[0.6px] text-[#64748B]';

/** Date du jour au format YYYY-MM-DD (heure locale). */
function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const STATUT_BADGE: Record<DemandeRechargeStatut, { label: string; cls: string }> = {
  EN_ATTENTE: { label: 'En attente', cls: 'bg-[#FFFBEB] text-[#92400E]' },
  TRAITEE: { label: 'Traitée', cls: 'bg-[#ECFDF5] text-[#047857]' },
  REJETEE: { label: 'Rejetée', cls: 'bg-[#FEF3F2] text-[#B42318]' },
  ANNULEE: { label: 'Annulée', cls: 'bg-[#F1F5F9] text-[#475569]' },
};

function StatutBadge({ statut }: { statut: DemandeRechargeStatut }) {
  const b = STATUT_BADGE[statut];
  return <span className={cn('inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold', b.cls)}>{b.label}</span>;
}

/** Modal de confirmation de recharge : montant pré-rempli, modifiable avant validation. */
function RechargeConfirmModal({
  demande,
  portefeuilleLabel,
  demandeur,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  demande: DemandeRecharge;
  portefeuilleLabel: string;
  demandeur: string;
  busy: boolean;
  error?: string;
  onConfirm: (montant: string) => void;
  onCancel: () => void;
}) {
  const [montant, setMontant] = useState(demande.montant);
  const valid = /^\d+(\.\d{1,4})?$/.test(montant) && Number(montant) > 0;
  const modifie = montant !== demande.montant;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0A1628]/60 p-4"
      onClick={busy ? undefined : onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="Confirmer la recharge"
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-[14px] border border-[rgba(15,76,129,0.1)] bg-white shadow-[0_20px_50px_rgba(15,23,42,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[rgba(15,76,129,0.08)] bg-[#F8FAFC] px-5 py-3.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#ECFDF5] text-[#047857]">
            <Wallet className="h-4.5 w-4.5" />
          </span>
          <div className="flex-1">
            <div className="font-display text-[13px] font-semibold text-[#0F172A]">Confirmer la recharge</div>
            <div className="text-[11px] text-[#64748B]">Demande {demande.numero}</div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Fermer"
            className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] transition-colors hover:bg-white hover:text-[#0F172A] disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.6px] text-[#64748B]">Portefeuille</div>
              <div className="mt-0.5 font-medium text-[#0F172A]">{portefeuilleLabel}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.6px] text-[#64748B]">Demandeur</div>
              <div className="mt-0.5 font-medium text-[#0F172A]">{demandeur}</div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="recharge-montant" className={labelClass}>
              Montant à recharger
            </label>
            <input
              id="recharge-montant"
              inputMode="decimal"
              autoFocus
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              className={cn(inputClass, !valid && 'border-[#FCA5A5]')}
            />
            <p className="text-[11px] text-[#94A3B8]">
              Montant demandé : <span className="font-medium text-[#475569]">{formatMontant(demande.montant)}</span>
              {modifie && <span className="ml-1 text-[#92400E]">· ajusté</span>}
            </p>
          </div>

          {error && <p className="text-xs text-[#EF4444]">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 bg-[#F8FAFC] px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-[9px] border border-[rgba(15,76,129,0.15)] bg-white px-3.5 py-2 text-xs font-medium text-[#475569] hover:bg-[#F1F5F9] disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onConfirm(montant)}
            disabled={busy || !valid}
            className="inline-flex items-center gap-1.5 rounded-[9px] bg-[#047857] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#059669] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Check className="h-4 w-4" /> {busy ? 'Recharge…' : 'Confirmer la recharge'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function RequestModal({ onClose }: { onClose: () => void }) {
  const create = useCreateDemandeRecharge();
  const { data: portefeuilles } = useMesPortefeuillesRechargeables();
  const [montant, setMontant] = useState('');
  const [motif, setMotif] = useState('');
  const [portefeuilleId, setPortefeuilleId] = useState('');
  // Étape de confirmation avant l'envoi réel.
  const [confirming, setConfirming] = useState(false);

  const ptfs = portefeuilles ?? [];
  const aucunPtf = ptfs.length === 0;
  const plusieurs = ptfs.length > 1;
  // Sélection auto si un seul portefeuille ; sinon l'utilisateur doit choisir.
  const cibleId = plusieurs ? portefeuilleId : (ptfs[0]?.id ?? '');
  const ciblePtf = ptfs.find((p) => String(p.id) === String(cibleId));
  const montantValid = /^\d+(\.\d{1,4})?$/.test(montant) && Number(montant) > 0;
  const valid = !aucunPtf && montantValid && (!plusieurs || !!portefeuilleId);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setConfirming(true);
  };

  const confirmSend = () => {
    create.mutate(
      { montant, motif: motif || undefined, portefeuilleId: cibleId || undefined },
      {
        onSuccess: () => {
          setConfirming(false);
          onClose();
        },
      },
    );
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
        role="dialog"
        aria-modal="true"
      >
        <div className="w-full max-w-md rounded-[13px] border border-[rgba(15,76,129,0.1)] bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-[rgba(15,76,129,0.07)] px-5 py-3">
            <div className="font-display text-sm font-semibold text-[#0F172A]">
              Faire une demande de recharge
            </div>
            <button
              type="button"
              aria-label="Fermer"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] hover:bg-[#F8FAFC] hover:text-[#0F172A]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={submit} className="grid gap-4 p-5">
            {aucunPtf ? (
              <p className="rounded-[8px] bg-[#FFFBEB] px-3 py-2 text-xs text-[#92400E]">
                Aucun portefeuille n'est rattaché à votre compte. Contactez un administrateur.
              </p>
            ) : (
              <>
                {plusieurs && (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="dr-portefeuille" className={labelClass}>
                      Portefeuille à recharger
                    </label>
                    <select
                      id="dr-portefeuille"
                      className={inputClass}
                      value={portefeuilleId}
                      onChange={(e) => setPortefeuilleId(e.target.value)}
                    >
                      <option value="">— Choisir un portefeuille —</option>
                      {ptfs.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code ? `${p.code} — ${p.libelle}` : p.libelle}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="dr-montant" className={labelClass}>
                    Montant souhaité
                  </label>
                  <input
                    id="dr-montant"
                    inputMode="decimal"
                    className={inputClass}
                    value={montant}
                    onChange={(e) => setMontant(e.target.value)}
                    placeholder="Ex : 50 000"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="dr-motif" className={labelClass}>
                    Motif (optionnel)
                  </label>
                  <input
                    id="dr-motif"
                    className={inputClass}
                    value={motif}
                    onChange={(e) => setMotif(e.target.value)}
                    placeholder="Motif de la recharge…"
                    maxLength={500}
                  />
                  <CharCounter value={motif} max={500} />
                </div>
                <p className="text-[11px] text-[#94A3B8]">
                  {plusieurs
                    ? 'Choisissez le portefeuille à recharger.'
                    : 'La recharge sera dirigée automatiquement vers votre portefeuille.'}
                </p>
              </>
            )}

            <div className="flex justify-end gap-2 border-t border-[rgba(15,76,129,0.07)] pt-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-[9px] border border-[rgba(15,76,129,0.15)] bg-white px-4 py-2 text-xs font-medium text-[#475569] hover:bg-[#F1F5F9]"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={!valid}
                className="flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-4 py-2 text-xs font-medium text-white transition hover:bg-[#1A6DB5] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus className="h-4 w-4" /> Envoyer la demande
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Confirmation avant envoi réel */}
      <ConfirmDialog
        open={confirming}
        variant="default"
        icon={Banknote}
        title="Confirmer la demande de recharge ?"
        description={`Recharge de ${montant ? formatMontant(montant) : '—'}${
          ciblePtf ? ` pour ${ciblePtf.libelle}` : ''
        }${motif ? ` · ${motif}` : ''}.`}
        confirmLabel="Confirmer la demande"
        cancelLabel="Retour"
        busy={create.isPending}
        error={create.isError ? apiErrorMessage(create.error, 'Demande impossible') : undefined}
        onCancel={() => {
          setConfirming(false);
          create.reset();
        }}
        onConfirm={confirmSend}
      />
    </>
  );
}

function DemandesRechargePageInner() {
  const user = useAuthStore((s) => s.user);
  const { data: roles } = useUserRoles(user?.id ?? null);
  const roleCodes = new Set<RoleCode>((roles ?? []).map((r) => r.code));
  const isAdmin = roleCodes.has('SUPER_ADMIN') || roleCodes.has('ADMINISTRATEUR');
  const isCaissier = roleCodes.has('CAISSIER');
  const peutTraiter = isAdmin || isCaissier;
  // La recharge est demandée par le responsable du portefeuille (validateur ou
  // gestionnaire de portefeuille), pas par le demandeur de bons.
  const peutDemander =
    isAdmin || roleCodes.has('VALIDATEUR') || roleCodes.has('GESTIONNAIRE_PORTEFEUILLE');

  const { data: demandes, isLoading } = useDemandesRecharge();
  const { data: portefeuilles } = usePortefeuilles();
  const ptfById = useMemo(() => new Map((portefeuilles ?? []).map((p) => [p.id, p])), [portefeuilles]);
  const { data: users } = useUsers();
  const userById = useMemo(() => new Map((users ?? []).map((u) => [u.id, u])), [users]);

  const traiter = useTraiterDemandeRecharge();
  const rejeter = useRejeterDemandeRecharge();
  const annuler = useAnnulerDemandeRecharge();
  const busy = traiter.isPending || rejeter.isPending || annuler.isPending;
  const [confirmRecharge, setConfirmRecharge] = useState<DemandeRecharge | null>(null);
  const [confirmReject, setConfirmReject] = useState<DemandeRecharge | null>(null);
  const [confirmAnnuler, setConfirmAnnuler] = useState<DemandeRecharge | null>(null);
  const [showRequest, setShowRequest] = useState(false);
  const [search, setSearch] = useState('');
  // Par défaut, on n'affiche que les demandes du JOUR (comme Opérations / Audit).
  const today = todayLocal();
  const [dateFrom, setDateFrom] = useState(() => todayLocal());
  const [dateTo, setDateTo] = useState(() => todayLocal());

  const filtered = (demandes ?? []).filter((d) => {
    if (dateFrom && new Date(d.createdAt) < new Date(`${dateFrom}T00:00:00`)) return false;
    if (dateTo && new Date(d.createdAt) > new Date(`${dateTo}T23:59:59.999`)) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const u = userById.get(d.demandeurId);
    const demandeur = u ? `${u.prenom} ${u.nom}`.toLowerCase() : '';
    const ptf = ptfById.get(d.portefeuilleId);
    const ptfLabel = ptf ? `${ptf.code} ${ptf.libelle}`.toLowerCase() : '';
    return (
      d.numero.toLowerCase().includes(q) ||
      demandeur.includes(q) ||
      ptfLabel.includes(q) ||
      String(d.montant).includes(q) ||
      (d.motif ?? '').toLowerCase().includes(q)
    );
  });
  const isDefaultView = !search && dateFrom === today && dateTo === today;
  const resetFilters = () => {
    setSearch('');
    setDateFrom(today);
    setDateTo(today);
  };

  const actionError =
    apiErrorMessage(traiter.error, '') || apiErrorMessage(rejeter.error, '') || apiErrorMessage(annuler.error, '');

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <PanelHeader title={peutTraiter ? 'Demandes de recharge' : 'Mes demandes'} badge={`${demandes?.length ?? 0}`}>
          {peutDemander && (
            <button
              type="button"
              onClick={() => setShowRequest(true)}
              className="ml-auto flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-3.5 py-2 text-xs font-medium text-white transition hover:bg-[#1A6DB5]"
            >
              <Plus className="h-4 w-4" /> Faire une demande
            </button>
          )}
        </PanelHeader>

        {/* Recherche + filtre par dates */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[rgba(15,76,129,0.07)] px-[18px] py-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#94A3B8]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher (n°, demandeur, portefeuille, montant, motif…)"
              className="h-9 w-full rounded-[9px] border border-[rgba(15,76,129,0.12)] bg-white pl-8 pr-3 text-xs text-[#0F172A] outline-none focus:border-[#1A6DB5]"
            />
          </div>
          <div className="flex items-center gap-1.5 rounded-[9px] border border-[rgba(15,76,129,0.12)] bg-white px-2.5 py-1.5 text-xs">
            <CalendarRange className="h-3.5 w-3.5 text-[#64748B]" />
            <input
              type="date"
              aria-label="Du"
              title="Du"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border-0 bg-transparent text-xs text-[#0F172A] outline-none"
            />
            <span className="text-[#64748B]">au</span>
            <input
              type="date"
              aria-label="Au"
              title="Au"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border-0 bg-transparent text-xs text-[#0F172A] outline-none"
            />
          </div>
          {!isDefaultView && (
            <button
              type="button"
              onClick={resetFilters}
              title="Revenir aux demandes du jour"
              className="rounded-[9px] border border-[rgba(15,76,129,0.12)] bg-white px-3 py-1.5 text-xs font-medium text-[#475569] hover:bg-[#F1F5F9]"
            >
              Aujourd'hui
            </button>
          )}
          <span className="ml-auto text-[11px] text-[#64748B]">
            {filtered.length} résultat{filtered.length > 1 ? 's' : ''}
          </span>
        </div>

        {actionError && <div className="px-[18px] pt-3 text-sm text-[#EF4444]">{actionError}</div>}
        {isLoading && <div className="px-[18px] py-8 text-sm text-[#64748B]">Chargement…</div>}

        {demandes && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#F8FAFC]">
                <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
                  <th className="px-4 py-2.5 font-semibold">N°</th>
                  <th className="px-4 py-2.5 font-semibold">Date &amp; heure</th>
                  <th className="px-4 py-2.5 font-semibold">Demandeur</th>
                  <th className="px-4 py-2.5 font-semibold">Portefeuille</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Montant</th>
                  <th className="px-4 py-2.5 font-semibold">Statut</th>
                  <th className="px-4 py-2.5 font-semibold">Motif</th>
                  <th className="px-4 py-2.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-[#64748B]">
                      {isDefaultView ? 'Aucune demande de recharge.' : 'Aucune demande pour ces filtres.'}
                    </td>
                  </tr>
                )}
                {filtered.map((d: DemandeRecharge) => {
                  const ptf = ptfById.get(d.portefeuilleId);
                  const isOwner = user?.id === d.demandeurId;
                  return (
                    <tr key={d.id} className="border-t border-[rgba(15,76,129,0.05)] hover:bg-[#FAFBFF]">
                      <td className="px-4 py-3 font-mono text-[11px] text-[#1A6DB5]">{d.numero}</td>
                      <td className="px-4 py-3">
                        <div className="text-[13px] font-medium text-[#0F172A]">
                          {new Date(d.createdAt).toLocaleDateString('fr-FR')}
                        </div>
                        <div className="text-[12px] text-[#64748B]">
                          {new Date(d.createdAt).toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const u = userById.get(d.demandeurId);
                          return u ? `${u.prenom} ${u.nom}` : `#${d.demandeurId}`;
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        {ptf ? (
                          <span className="inline-flex items-center gap-1">
                            <Banknote className="h-3 w-3 text-[#00C896]" />
                            {ptf.libelle} <span className="text-[10px] text-[#94A3B8]">({ptf.code})</span>
                          </span>
                        ) : (
                          <span className="text-[#94A3B8]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-display font-semibold tabular-nums">
                        {formatMontant(d.montant)}
                      </td>
                      <td className="px-4 py-3">
                        <StatutBadge statut={d.statut} />
                      </td>
                      <td className="px-4 py-3 text-[#64748B]">{d.motif || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        {d.statut === 'EN_ATTENTE' && (
                          <div className="flex items-center justify-end gap-1.5">
                            {peutTraiter && (
                              <>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => setConfirmRecharge(d)}
                                  title="Effectuer la recharge"
                                  className="inline-flex items-center gap-1 rounded-[7px] bg-[#0F4C81] px-2.5 py-1 text-[11px] font-medium text-white hover:bg-[#1A6DB5] disabled:opacity-60"
                                >
                                  <Check className="h-3 w-3" /> Recharger
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => setConfirmReject(d)}
                                  title="Rejeter la demande"
                                  className="inline-flex items-center gap-1 rounded-[7px] border border-[rgba(15,76,129,0.15)] px-2.5 py-1 text-[11px] font-medium text-[#B42318] hover:bg-[#FEF3F2] disabled:opacity-60"
                                >
                                  <X className="h-3 w-3" /> Rejeter
                                </button>
                              </>
                            )}
                            {!peutTraiter && isOwner && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setConfirmAnnuler(d)}
                                title="Annuler ma demande"
                                className="inline-flex items-center gap-1 rounded-[7px] border border-[rgba(15,76,129,0.15)] px-2.5 py-1 text-[11px] font-medium text-[#475569] hover:bg-[#F1F5F9] disabled:opacity-60"
                              >
                                <X className="h-3 w-3" /> Annuler
                              </button>
                            )}
                          </div>
                        )}
                        {d.statut !== 'EN_ATTENTE' && <Clock className="ml-auto h-3.5 w-3.5 text-[#CBD5E1]" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {showRequest && peutDemander && <RequestModal onClose={() => setShowRequest(false)} />}

      {confirmRecharge &&
        (() => {
          const ptf = ptfById.get(confirmRecharge.portefeuilleId);
          const u = userById.get(confirmRecharge.demandeurId);
          return (
            <RechargeConfirmModal
              demande={confirmRecharge}
              portefeuilleLabel={ptf ? `${ptf.libelle} (${ptf.code})` : `#${confirmRecharge.portefeuilleId}`}
              demandeur={u ? `${u.prenom} ${u.nom}` : `#${confirmRecharge.demandeurId}`}
              busy={traiter.isPending}
              error={apiErrorMessage(traiter.error, '') || undefined}
              onCancel={() => {
                setConfirmRecharge(null);
                traiter.reset();
              }}
              onConfirm={(montant) =>
                traiter.mutate(
                  { id: confirmRecharge.id, montant },
                  { onSuccess: () => setConfirmRecharge(null) },
                )
              }
            />
          );
        })()}

      <ConfirmDialog
        open={!!confirmReject}
        variant="danger"
        icon={X}
        title={confirmReject ? `Rejeter la demande ${confirmReject.numero} ?` : ''}
        description="La demande de recharge sera rejetée. Le demandeur devra en refaire une si besoin."
        confirmLabel="Rejeter"
        cancelLabel="Retour"
        busy={rejeter.isPending}
        error={rejeter.isError ? apiErrorMessage(rejeter.error, 'Rejet impossible') : undefined}
        onCancel={() => {
          setConfirmReject(null);
          rejeter.reset();
        }}
        onConfirm={() => {
          if (confirmReject)
            rejeter.mutate({ id: confirmReject.id }, { onSuccess: () => setConfirmReject(null) });
        }}
      />

      <ConfirmDialog
        open={!!confirmAnnuler}
        variant="warning"
        icon={X}
        title={confirmAnnuler ? `Annuler la demande ${confirmAnnuler.numero} ?` : ''}
        description="Votre demande de recharge sera annulée."
        confirmLabel="Annuler la demande"
        cancelLabel="Retour"
        busy={annuler.isPending}
        error={annuler.isError ? apiErrorMessage(annuler.error, 'Annulation impossible') : undefined}
        onCancel={() => {
          setConfirmAnnuler(null);
          annuler.reset();
        }}
        onConfirm={() => {
          if (confirmAnnuler)
            annuler.mutate(confirmAnnuler.id, { onSuccess: () => setConfirmAnnuler(null) });
        }}
      />
    </div>
  );
}

export function DemandesRechargePage() {
  return (
    <RoleGuard allow={['SUPER_ADMIN', 'ADMINISTRATEUR', 'CAISSIER', 'VALIDATEUR', 'GESTIONNAIRE_PORTEFEUILLE']}>
      <DemandesRechargePageInner />
    </RoleGuard>
  );
}
