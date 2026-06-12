import { useMemo, useState } from 'react';
import { Banknote, Check, Clock, Plus, X } from 'lucide-react';
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

const inputClass =
  'h-10 w-full rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-white px-3 text-sm text-[#0F172A] outline-none transition focus:border-[#1A6DB5]';
const labelClass = 'text-[11px] font-semibold uppercase tracking-[0.6px] text-[#64748B]';

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

function RequestForm() {
  const create = useCreateDemandeRecharge();
  const { data: portefeuilles } = useMesPortefeuillesRechargeables();
  const [montant, setMontant] = useState('');
  const [motif, setMotif] = useState('');
  const [portefeuilleId, setPortefeuilleId] = useState('');
  const [done, setDone] = useState(false);

  const ptfs = portefeuilles ?? [];
  const plusieurs = ptfs.length > 1;
  // Sélection auto si un seul portefeuille ; sinon l'utilisateur doit choisir.
  const cibleId = plusieurs ? portefeuilleId : (ptfs[0]?.id ?? '');
  const montantValid = /^\d+(\.\d{1,4})?$/.test(montant) && Number(montant) > 0;
  const valid = montantValid && (!plusieurs || !!portefeuilleId);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setDone(false);
    create.mutate(
      { montant, motif: motif || undefined, portefeuilleId: cibleId || undefined },
      {
        onSuccess: () => {
          setDone(true);
          setMontant('');
          setMotif('');
          setPortefeuilleId('');
        },
      },
    );
  };

  return (
    <Panel>
      <PanelHeader title="Demander une recharge" />
      <form onSubmit={submit} className="grid gap-4 p-[18px] sm:grid-cols-2">
        {plusieurs && (
          <div className="flex flex-col gap-1.5 sm:col-span-2">
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
          />
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <button
            type="submit"
            disabled={!valid || create.isPending}
            className="flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-4 py-2 text-xs font-medium text-white transition hover:bg-[#1A6DB5] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="h-4 w-4" /> {create.isPending ? 'Envoi…' : 'Envoyer la demande'}
          </button>
          {done && <p className="text-sm text-[#059669]">Demande envoyée. Un caissier la traitera.</p>}
          {create.isError && (
            <p className="text-sm text-[#EF4444]">{apiErrorMessage(create.error, 'Demande impossible')}</p>
          )}
        </div>
      </form>
      <p className="px-[18px] pb-4 text-[11px] text-[#94A3B8]">
        {plusieurs
          ? 'Vous gérez plusieurs portefeuilles : choisissez celui à recharger.'
          : 'La recharge sera dirigée automatiquement vers votre portefeuille.'}
      </p>
    </Panel>
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

  const actionError =
    apiErrorMessage(traiter.error, '') || apiErrorMessage(rejeter.error, '') || apiErrorMessage(annuler.error, '');

  return (
    <div className="flex flex-col gap-4">
      {peutDemander && <RequestForm />}

      <Panel>
        <PanelHeader title={peutTraiter ? 'Demandes de recharge' : 'Mes demandes'} badge={`${demandes?.length ?? 0}`} />

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
                {demandes.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-[#64748B]">
                      Aucune demande de recharge.
                    </td>
                  </tr>
                )}
                {demandes.map((d: DemandeRecharge) => {
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
                                  onClick={() => traiter.mutate({ id: d.id })}
                                  title="Effectuer la recharge"
                                  className="inline-flex items-center gap-1 rounded-[7px] bg-[#0F4C81] px-2.5 py-1 text-[11px] font-medium text-white hover:bg-[#1A6DB5] disabled:opacity-60"
                                >
                                  <Check className="h-3 w-3" /> Recharger
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => rejeter.mutate({ id: d.id })}
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
                                onClick={() => annuler.mutate(d.id)}
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
