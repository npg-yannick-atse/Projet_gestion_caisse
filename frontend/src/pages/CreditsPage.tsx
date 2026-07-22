import { useMemo, useState } from 'react';
import { AlertTriangle, Banknote, CheckCircle2, Pencil, X } from 'lucide-react';
import { useCredits, useCreateCredit, useUpdateCredit, useSolderCredit } from '@/api/credits';
import { useEmployes } from '@/api/employes';
import { useCaisses } from '@/api/caisses';
import { usePortefeuilles, useDevises } from '@/api/financierRef';
import { useAuthStore } from '@/stores/auth.store';
import { apiErrorMessage, formatMontant } from '@/lib/utils';
import type { Credit, CreditSource } from '@/types/api';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { ConfirmDialog } from '@/components/ConfirmDialog';

const selectClass =
  'h-10 w-full rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-white px-3 text-sm text-[#0F172A] outline-none focus:border-[#1A6DB5]';
const labelClass = 'text-[11px] font-semibold uppercase tracking-[0.6px] text-[#64748B]';

function mensualite(montant: string, nbMois: number): number {
  const m = Number(montant || 0);
  return nbMois > 0 ? m / nbMois : 0;
}

function dateFin(dateDebut: string, nbMois: number): string {
  const d = new Date(dateDebut);
  if (Number.isNaN(d.getTime())) return '—';
  d.setMonth(d.getMonth() + nbMois);
  return d.toLocaleDateString('fr-FR');
}

export function CreditsPage() {
  const currentUser = useAuthStore((s) => s.user);
  const { data: credits } = useCredits();
  const { data: employes } = useEmployes();
  const { data: caisses } = useCaisses();
  const { data: portefeuilles } = usePortefeuilles();
  const { data: devises } = useDevises();
  const create = useCreateCredit();
  const solder = useSolderCredit();

  const [employeId, setEmployeId] = useState('');
  const [montant, setMontant] = useState('');
  const [nbMois, setNbMois] = useState('12');
  const [sourceType, setSourceType] = useState<CreditSource>('CAISSE');
  const [sourceId, setSourceId] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [pendingSolde, setPendingSolde] = useState<Credit | null>(null);
  const [editing, setEditing] = useState<Credit | null>(null);

  // Employés proposés : ceux de la direction de l'utilisateur (tous pour un admin).
  const employesList = useMemo(() => {
    const list = employes ?? [];
    if (!currentUser?.directionId) return list;
    // Un admin verra quand même tout côté serveur ; ici on aide le validateur.
    const mine = list.filter((e) => String(e.directionId ?? '') === String(currentUser.directionId));
    return mine.length > 0 ? mine : list;
  }, [employes, currentUser]);

  const employeById = useMemo(() => new Map((employes ?? []).map((e) => [e.id, e])), [employes]);
  const codeOf = (deviseId?: string | null) => (devises ?? []).find((d) => d.id === deviseId)?.code ?? '';
  const openCaisses = (caisses ?? []).filter((c) => c.statut === 'OUVERTE');

  // Alerte : l'employé sélectionné a-t-il déjà un crédit en cours ?
  const creditEnCours = useMemo(
    () => (credits ?? []).find((c) => c.employeId === employeId && c.statut === 'EN_COURS'),
    [credits, employeId],
  );

  const valid = employeId && Number(montant) > 0 && Number(nbMois) >= 1 && sourceId && !creditEnCours;

  const resetForm = () => {
    setMontant('');
    setNbMois('12');
    setSourceId('');
    setCommentaire('');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    create.mutate(
      { employeId, montant, nbMois: Number(nbMois), sourceType, sourceId, commentaire: commentaire.trim() || undefined },
      { onSuccess: () => { setEmployeId(''); resetForm(); } },
    );
  };

  const empLabel = (id: string) => {
    const e = employeById.get(id);
    return e ? `${e.nom} ${e.prenoms} — ${e.matricule}` : id;
  };
  const sourceLabel = (c: Credit) => {
    if (c.sourceType === 'CAISSE') return (caisses ?? []).find((x) => x.id === c.sourceId)?.code ?? 'Caisse';
    return (portefeuilles ?? []).find((x) => x.id === c.sourceId)?.code ?? 'Portefeuille';
  };

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <PanelHeader title="Accorder un crédit" />
        <form onSubmit={submit} className="grid gap-4 p-[18px] sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className={labelClass}>Employé</label>
            <select className={selectClass} value={employeId} onChange={(e) => setEmployeId(e.target.value)}>
              <option value="">— Choisir —</option>
              {employesList.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nom} {e.prenoms} — {e.matricule}
                </option>
              ))}
            </select>
            {creditEnCours && (
              <div className="flex items-center gap-2 rounded-[9px] border border-[#FDE68A] bg-[#FEF9C3] px-3 py-2 text-[12px] text-[#92400E]">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Cet employé a déjà un crédit en cours ({formatMontant(creditEnCours.montant)}{' '}
                {codeOf(creditEnCours.deviseId)}). Soldez-le avant d'en accorder un nouveau.
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Montant</label>
            <input
              type="number" min="0" step="1"
              className={selectClass}
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              placeholder="Ex : 500000"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Nombre de mois</label>
            <input
              type="number" min="1" step="1"
              className={selectClass}
              value={nbMois}
              onChange={(e) => setNbMois(e.target.value)}
            />
            {Number(montant) > 0 && Number(nbMois) >= 1 && (
              <p className="text-[11px] text-[#64748B]">
                Mensualité ≈ <strong>{formatMontant(mensualite(montant, Number(nbMois)))}</strong> / mois
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Source de l'argent</label>
            <div className="inline-flex rounded-[9px] border border-[rgba(15,76,129,0.12)] p-0.5">
              {(['CAISSE', 'PORTEFEUILLE'] as CreditSource[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setSourceType(s); setSourceId(''); }}
                  className={`flex-1 rounded-[7px] px-3 py-1.5 text-xs font-medium transition ${
                    sourceType === s ? 'bg-[#0F4C81] text-white' : 'text-[#475569] hover:bg-[#F1F5F9]'
                  }`}
                >
                  {s === 'CAISSE' ? 'Caisse' : 'Portefeuille'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>{sourceType === 'CAISSE' ? 'Caisse' : 'Portefeuille'}</label>
            <select className={selectClass} value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              <option value="">— Choisir —</option>
              {(sourceType === 'CAISSE' ? openCaisses : portefeuilles ?? []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.code} — {x.libelle}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className={labelClass}>Commentaire (optionnel)</label>
            <input className={selectClass} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
          </div>

          <div className="flex items-center gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={!valid || create.isPending}
              className="inline-flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#1A6DB5] disabled:opacity-50"
            >
              <Banknote className="h-4 w-4" />
              {create.isPending ? 'Décaissement…' : 'Accorder le crédit'}
            </button>
            {create.isError && (
              <span className="text-sm text-destructive">{apiErrorMessage(create.error, 'Crédit impossible')}</span>
            )}
          </div>
        </form>
      </Panel>

      <Panel>
        <PanelHeader title="Crédits" badge={`${credits?.length ?? 0}`} />
        <table className="w-full text-xs">
          <thead className="bg-[#F8FAFC]">
            <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
              <th className="px-4 py-2.5 font-semibold">Employé</th>
              <th className="px-4 py-2.5 font-semibold text-right">Montant</th>
              <th className="px-4 py-2.5 font-semibold text-center">Mois</th>
              <th className="px-4 py-2.5 font-semibold text-right">Mensualité</th>
              <th className="px-4 py-2.5 font-semibold">Source</th>
              <th className="px-4 py-2.5 font-semibold">Fin prévue</th>
              <th className="px-4 py-2.5 font-semibold">Statut</th>
              <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {(credits ?? []).length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-[#64748B]">Aucun crédit.</td></tr>
            )}
            {(credits ?? []).map((c) => (
              <tr key={c.id} className="border-t border-[rgba(15,76,129,0.07)]">
                <td className="px-4 py-3">{empLabel(c.employeId)}</td>
                <td className="px-4 py-3 text-right font-medium">{formatMontant(c.montant)} {codeOf(c.deviseId)}</td>
                <td className="px-4 py-3 text-center">{c.nbMois}</td>
                <td className="px-4 py-3 text-right text-[#64748B]">{formatMontant(mensualite(c.montant, c.nbMois))}</td>
                <td className="px-4 py-3 text-[#64748B]">{sourceLabel(c)}</td>
                <td className="px-4 py-3 text-[#64748B]">{dateFin(c.dateDebut, c.nbMois)}</td>
                <td className="px-4 py-3">
                  {c.statut === 'EN_COURS' ? (
                    <span className="rounded-full bg-[#DBEAFE] px-2 py-0.5 text-[10px] font-semibold text-[#1E40AF]">En cours</span>
                  ) : (
                    <span className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[10px] font-semibold text-[#64748B]">Soldé</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {c.statut === 'EN_COURS' && (
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        aria-label="Modifier"
                        onClick={() => setEditing(c)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] hover:bg-[#EFF6FF] hover:text-[#1A6DB5]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingSolde(c)}
                        className="inline-flex items-center gap-1 rounded-[7px] border border-[rgba(15,76,129,0.15)] px-2 py-1 text-[11px] font-medium text-[#0F4C81] hover:bg-[#EFF6FF]"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Solder
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {editing && <EditCreditModal credit={editing} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={!!pendingSolde}
        title={pendingSolde ? 'Solder ce crédit ?' : ''}
        description="Le crédit sera clôturé. L'employé pourra alors recevoir un nouveau crédit. (Aucun remboursement n'est enregistré ici.)"
        confirmLabel="Solder"
        busy={solder.isPending}
        error={solder.isError ? apiErrorMessage(solder.error, 'Échec') : undefined}
        onCancel={() => { setPendingSolde(null); solder.reset(); }}
        onConfirm={() => {
          if (!pendingSolde) return;
          solder.mutate(pendingSolde.id, { onSuccess: () => setPendingSolde(null) });
        }}
      />
    </div>
  );
}

function EditCreditModal({ credit, onClose }: { credit: Credit; onClose: () => void }) {
  const update = useUpdateCredit();
  const [montant, setMontant] = useState(credit.montant);
  const [nbMois, setNbMois] = useState(String(credit.nbMois));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate(
      { id: credit.id, payload: { montant, nbMois: Number(nbMois) } },
      { onSuccess: onClose },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-[13px] border border-[rgba(15,76,129,0.1)] bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[rgba(15,76,129,0.07)] bg-[#F8FAFC] px-5 py-3">
          <span className="font-display text-sm font-semibold text-[#0F172A]">Modifier le crédit</span>
          <button type="button" aria-label="Fermer" onClick={onClose} className="text-[#94A3B8] hover:text-[#0F172A]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={submit} className="grid gap-4 p-5">
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Montant</label>
            <input type="number" min="0" step="1" className={selectClass} value={montant} onChange={(e) => setMontant(e.target.value)} />
            <p className="text-[11px] text-[#94A3B8]">
              Un changement de montant génère une écriture d'ajustement sur la source.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Nombre de mois</label>
            <input type="number" min="1" step="1" className={selectClass} value={nbMois} onChange={(e) => setNbMois(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={update.isPending} className="rounded-[9px] bg-[#0F4C81] px-4 py-2 text-sm font-medium text-white hover:bg-[#1A6DB5] disabled:opacity-50">
              {update.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button type="button" onClick={onClose} className="rounded-[9px] px-4 py-2 text-sm text-[#475569] hover:bg-[#F1F5F9]">
              Annuler
            </button>
            {update.isError && <span className="text-sm text-destructive">{apiErrorMessage(update.error, 'Échec')}</span>}
          </div>
        </form>
      </div>
    </div>
  );
}
