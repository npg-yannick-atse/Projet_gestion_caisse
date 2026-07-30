import { useEffect, useMemo, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, CalendarRange, ChevronLeft, ChevronRight, Scale, User as UserIcon } from 'lucide-react';
import { useOperations } from '@/api/ledger';
import { useUsers } from '@/api/users';
import { formatMontant } from '@/lib/utils';
import type { Operation, TypeOperation } from '@/types/api';
import { StatCard } from '@/components/ui/stat-card';
import { Panel, PanelHeader } from '@/components/ui/panel';

// Convention du relevé (validée) : ce qui fait ENTRER de l'argent = Crédit,
// ce qui le fait SORTIR = Débit. Solde = Σcrédit − Σdébit.
const CREDIT_TYPES: TypeOperation[] = ['ENCAISSEMENT', 'RECHARGE'];
const DEBIT_TYPES: TypeOperation[] = ['DECAISSEMENT', 'CREDIT'];

const TYPE_LABELS: Record<TypeOperation, string> = {
  RECHARGE: 'Recharge',
  DECAISSEMENT: 'Décaissement',
  TRANSFERT: 'Transfert',
  AJUSTEMENT: 'Ajustement',
  ENCAISSEMENT: 'Encaissement',
  CREDIT: 'Crédit',
};

function sensOf(t: TypeOperation): 'CREDIT' | 'DEBIT' | null {
  if (CREDIT_TYPES.includes(t)) return 'CREDIT';
  if (DEBIT_TYPES.includes(t)) return 'DEBIT';
  return null;
}

const PAGE_SIZE = 20;

export function ReleveAgentPage() {
  const { data: users } = useUsers();
  const [userId, setUserId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const { data: ops } = useOperations(
    userId ? { userId, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined } : {},
  );

  // Retour à la page 1 dès qu'un filtre change (agent ou période).
  useEffect(() => {
    setPage(1);
  }, [userId, dateFrom, dateTo]);

  const usersList = useMemo(
    () => (users ?? []).slice().sort((a, b) => `${a.nom}`.localeCompare(`${b.nom}`)),
    [users],
  );

  // Relevé : opérations triées par date croissante, avec solde courant cumulé.
  const releve = useMemo(() => {
    const rows = (ops ?? [])
      .slice()
      .sort((a, b) => new Date(a.dateOperation).getTime() - new Date(b.dateOperation).getTime());
    let solde = 0;
    let totalDebit = 0;
    let totalCredit = 0;
    const lignes = rows.map((o: Operation) => {
      const sens = sensOf(o.typeOperation);
      const montant = Number(o.montant || 0);
      const debit = sens === 'DEBIT' ? montant : 0;
      const credit = sens === 'CREDIT' ? montant : 0;
      solde += credit - debit;
      totalDebit += debit;
      totalCredit += credit;
      return { op: o, debit, credit, solde };
    });
    // Affichage du plus récent en haut.
    return { lignes: lignes.reverse(), totalDebit, totalCredit, solde };
  }, [ops]);

  // Pagination (côté client, sur la liste déjà filtrée par période côté serveur).
  const totalPages = Math.max(1, Math.ceil(releve.lignes.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pagedLignes = releve.lignes.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <PanelHeader title="Relevé Entrées / Sorties par agent" />
        <div className="flex flex-wrap items-center gap-2 p-[18px]">
          <UserIcon className="h-4 w-4 text-[#64748B]" />
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="h-10 min-w-[260px] rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-white px-3 text-sm text-[#0F172A] outline-none focus:border-[#1A6DB5]"
          >
            <option value="">— Choisir un agent —</option>
            {usersList.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nom} {u.prenom} — {u.matricule}
              </option>
            ))}
          </select>

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
          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
              }}
              className="rounded-[9px] border border-[rgba(15,76,129,0.12)] bg-white px-3 py-1.5 text-xs font-medium text-[#475569] hover:bg-[#F1F5F9]"
            >
              Effacer les dates
            </button>
          )}

          <span className="text-[11px] text-[#94A3B8]">
            Entrées = encaissements + recharges · Sorties = décaissements + crédits
          </span>
        </div>
      </Panel>

      {userId && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard tone="green" icon={ArrowUpCircle} label="Total Entrées" value={formatMontant(releve.totalCredit)} sub="Encaissements + recharges" />
            <StatCard tone="amber" icon={ArrowDownCircle} label="Total Sorties" value={formatMontant(releve.totalDebit)} sub="Décaissements + crédits" />
            <StatCard
              tone={releve.solde >= 0 ? 'blue' : 'amber'}
              icon={Scale}
              label="Net"
              value={formatMontant(releve.solde)}
              sub="Entrées − Sorties"
            />
          </div>

          <Panel>
            <PanelHeader title="Mouvements" badge={`${releve.lignes.length}`} />
            <table className="w-full text-xs">
              <thead className="bg-[#F8FAFC]">
                <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
                  <th className="px-4 py-2.5 font-semibold">Date</th>
                  <th className="px-4 py-2.5 font-semibold">Type</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Sorties</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Entrées</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {releve.lignes.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-[#64748B]">
                      Aucune opération pour cet agent.
                    </td>
                  </tr>
                )}
                {pagedLignes.map(({ op, debit, credit, solde }) => (
                  <tr key={op.id} className="border-t border-[rgba(15,76,129,0.07)]">
                    <td className="px-4 py-3 text-[#64748B]">
                      {new Date(op.dateOperation).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-4 py-3">{TYPE_LABELS[op.typeOperation] ?? op.typeOperation}</td>
                    <td className="px-4 py-3 text-right font-medium text-[#B91C1C]">
                      {debit ? formatMontant(debit) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-[#15803D]">
                      {credit ? formatMontant(credit) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatMontant(solde)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {releve.lignes.length > PAGE_SIZE && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[rgba(15,76,129,0.07)] px-4 py-2.5 text-xs">
                <span className="text-[#64748B]">
                  {(pageSafe - 1) * PAGE_SIZE + 1}–{Math.min(pageSafe * PAGE_SIZE, releve.lignes.length)} sur{' '}
                  {releve.lignes.length}
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
        </>
      )}
    </div>
  );
}
