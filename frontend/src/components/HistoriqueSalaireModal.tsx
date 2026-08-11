import { useState } from 'react';
import { TrendingDown, TrendingUp, X } from 'lucide-react';
import { useChangerSalaire, useHistoriqueSalaire, type PeriodeSalaire } from '@/api/employes';
import { apiErrorMessage, cn, formatMontant } from '@/lib/utils';
import type { Employe } from '@/types/api';

/** Premier jour du mois prochain — l'effet le plus courant d'une augmentation. */
function moisProchain(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 1)).toISOString().slice(0, 10);
}

function formatJour(d: string): string {
  return new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Historique des salaires d'un employé, et enregistrement d'un nouveau montant.
 *
 * Le salaire n'est pas une valeur qu'on écrase : c'est une succession de
 * périodes. Une augmentation clôt la période en cours et en ouvre une nouvelle,
 * si bien qu'un mois passé conserve le montant qui s'appliquait alors — un
 * arriéré de juillet réglé en août se paie au tarif de juillet.
 */
export function HistoriqueSalaireModal({ employe, onClose }: { employe: Employe; onClose: () => void }) {
  const { data: periodes, isLoading } = useHistoriqueSalaire(employe.id);
  const changer = useChangerSalaire(employe.id);

  const [montant, setMontant] = useState('');
  const [dateDebut, setDateDebut] = useState(moisProchain());
  const [motif, setMotif] = useState('');

  const courant = (periodes ?? []).find((p) => !p.dateFin) ?? null;
  const montantValide = /^\d+(\.\d{1,4})?$/.test(montant) && Number(montant) > 0;

  /** Sens de l'évolution par rapport à la période précédente, pour la lisibilité. */
  const evolution = (p: PeriodeSalaire, i: number): number => {
    const suivante = (periodes ?? [])[i + 1]; // la liste va du plus récent au plus ancien
    if (!suivante) return 0;
    return Number(p.montant) - Number(suivante.montant);
  };

  const enregistrer = () => {
    if (!montantValide) return;
    changer.mutate(
      { montant, dateDebut, motif: motif.trim() || undefined },
      { onSuccess: () => { setMontant(''); setMotif(''); } },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-[13px] border border-[rgba(15,76,129,0.1)] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[rgba(15,76,129,0.07)] px-5 py-3.5">
          <div>
            <div className="font-display text-sm font-semibold text-[#0F172A]">
              Salaire — {employe.nom} {employe.prenoms}
            </div>
            <div className="text-[11px] text-[#64748B]">
              {courant ? `En vigueur : ${formatMontant(courant.montant)}` : 'Aucun salaire enregistré'}
            </div>
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

        <div className="overflow-y-auto p-5">
          {/* Nouveau salaire */}
          <div className="mb-5 rounded-[10px] border border-[#BFDBFE] bg-[#F0F7FF] p-3.5">
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.6px] text-[#1E40AF]">
              Enregistrer un nouveau salaire
            </p>
            <div className="grid gap-2.5 sm:grid-cols-3">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-[0.5px] text-[#64748B]">Montant</label>
                <input
                  value={montant}
                  onChange={(e) => setMontant(e.target.value)}
                  inputMode="decimal"
                  placeholder="450000"
                  className="w-full rounded-[9px] border border-[rgba(15,76,129,0.12)] bg-white px-3 py-1.5 text-xs outline-none focus:border-[#1A6DB5]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-[0.5px] text-[#64748B]">À partir du</label>
                <input
                  type="date"
                  value={dateDebut}
                  onChange={(e) => setDateDebut(e.target.value)}
                  className="w-full rounded-[9px] border border-[rgba(15,76,129,0.12)] bg-white px-3 py-1.5 text-xs outline-none focus:border-[#1A6DB5]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-[0.5px] text-[#64748B]">Motif</label>
                <input
                  value={motif}
                  onChange={(e) => setMotif(e.target.value)}
                  placeholder="Augmentation annuelle…"
                  className="w-full rounded-[9px] border border-[rgba(15,76,129,0.12)] bg-white px-3 py-1.5 text-xs outline-none focus:border-[#1A6DB5]"
                />
              </div>
            </div>
            <div className="mt-2.5 flex items-center gap-2.5">
              <button
                type="button"
                disabled={!montantValide || changer.isPending}
                onClick={enregistrer}
                className="rounded-[9px] bg-[#0F4C81] px-3.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-[#1A6DB5] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {changer.isPending ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              <span className="text-[11px] text-[#64748B]">
                La période en cours sera close la veille. Les mois déjà écoulés gardent leur montant.
              </span>
            </div>
            {changer.isError && (
              <p className="mt-2 text-[11px] text-[#EF4444]">
                {apiErrorMessage(changer.error, 'Enregistrement impossible')}
              </p>
            )}
          </div>

          {/* Historique */}
          {isLoading && <p className="text-xs text-[#64748B]">Chargement…</p>}
          {periodes && periodes.length === 0 && (
            <p className="rounded-[10px] border border-dashed border-[rgba(15,76,129,0.15)] p-4 text-center text-xs text-[#94A3B8]">
              Aucune période enregistrée.
            </p>
          )}
          {periodes && periodes.length > 0 && (
            <table className="w-full text-xs">
              <thead className="bg-[#F8FAFC]">
                <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
                  <th className="px-3 py-2 font-semibold">Période</th>
                  <th className="px-3 py-2 text-right font-semibold">Montant</th>
                  <th className="px-3 py-2 font-semibold">Motif</th>
                </tr>
              </thead>
              <tbody>
                {periodes.map((p, i) => {
                  const delta = evolution(p, i);
                  return (
                    <tr key={p.id} className="border-t border-[rgba(15,76,129,0.07)]">
                      <td className="px-3 py-2.5">
                        {formatJour(p.dateDebut)}
                        {p.dateFin ? (
                          <span className="text-[#64748B]"> → {formatJour(p.dateFin)}</span>
                        ) : (
                          <span className="ml-1.5 rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[10px] font-semibold text-[#047857]">
                            en cours
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          {delta !== 0 && (
                            <span className={cn('inline-flex items-center', delta > 0 ? 'text-[#047857]' : 'text-[#B42318]')}>
                              {delta > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                            </span>
                          )}
                          {formatMontant(p.montant)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[#64748B]">{p.motif ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
