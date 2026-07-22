import { useMemo, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Scale, User as UserIcon } from 'lucide-react';
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

export function ReleveAgentPage() {
  const { data: users } = useUsers();
  const [userId, setUserId] = useState('');
  const { data: ops } = useOperations(userId ? { userId } : {});

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

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <PanelHeader title="Relevé Débit / Crédit par agent" />
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
          <span className="text-[11px] text-[#94A3B8]">
            Crédit = encaissements + recharges · Débit = décaissements
          </span>
        </div>
      </Panel>

      {userId && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard tone="green" icon={ArrowUpCircle} label="Total Crédit" value={formatMontant(releve.totalCredit)} sub="Entrées" />
            <StatCard tone="amber" icon={ArrowDownCircle} label="Total Débit" value={formatMontant(releve.totalDebit)} sub="Sorties" />
            <StatCard
              tone={releve.solde >= 0 ? 'blue' : 'amber'}
              icon={Scale}
              label="Solde"
              value={formatMontant(releve.solde)}
              sub="Crédit − Débit"
            />
          </div>

          <Panel>
            <PanelHeader title="Mouvements" badge={`${releve.lignes.length}`} />
            <table className="w-full text-xs">
              <thead className="bg-[#F8FAFC]">
                <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
                  <th className="px-4 py-2.5 font-semibold">Date</th>
                  <th className="px-4 py-2.5 font-semibold">Type</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Débit</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Crédit</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Solde</th>
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
                {releve.lignes.map(({ op, debit, credit, solde }) => (
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
          </Panel>
        </>
      )}
    </div>
  );
}
