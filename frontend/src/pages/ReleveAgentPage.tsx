import { useEffect, useMemo, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, CalendarRange, ChevronLeft, ChevronRight, Scale, User as UserIcon } from 'lucide-react';
import { useOperations } from '@/api/ledger';
import { useUsers } from '@/api/users';
import { formatMontant } from '@/lib/utils';
import type { Operation, TypeOperation } from '@/types/api';
import { StatCard } from '@/components/ui/stat-card';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { SortableHeader } from '@/components/SortableHeader';
import { useTableSort } from '@/hooks/useTableSort';
import { useClientSort } from '@/hooks/useClientSort';

// Convention du relevé (validée) : ce qui fait ENTRER de l'argent = Crédit,
// ce qui le fait SORTIR = Débit. Solde = Σcrédit − Σdébit.
/**
 * Ce relevé retrace l'argent qui est réellement passé entre les mains de
 * l'agent — pas les réorganisations internes.
 *
 * Une RECHARGE déplace de l'argent de la caisse vers un portefeuille : rien
 * n'entre ni ne sort de l'entreprise, l'argent change simplement de poche. Elle
 * était pourtant comptée comme une entrée, ce qui gonflait le total sans qu'un
 * centime soit rentré. Même raisonnement pour AJUSTEMENT (réajustement mensuel
 * d'un budget) et TRANSFERT.
 *
 * Ces trois types restent donc sans montant, et sont signalés « interne » à
 * l'écran plutôt que laissés vides — un tiret nu passait pour un oubli.
 */
const CREDIT_TYPES: TypeOperation[] = ['ENCAISSEMENT', 'REMBOURSEMENT_CREDIT'];
// SALAIRE est une SORTIE : l'agent remet l'argent à l'employé. Il en était
// absent, si bien que les lignes de paie s'affichaient sans montant et
// n'entraient pas dans le solde du relevé — un salaire versé restait invisible.
const DEBIT_TYPES: TypeOperation[] = ['DECAISSEMENT', 'CREDIT', 'SALAIRE'];
/** Mouvements internes : ni entrée ni sortie, mais volontairement affichés. */
const INTERNE_TYPES: TypeOperation[] = ['RECHARGE', 'AJUSTEMENT', 'TRANSFERT'];

const TYPE_LABELS: Record<TypeOperation, string> = {
  RECHARGE: 'Recharge',
  DECAISSEMENT: 'Décaissement',
  TRANSFERT: 'Transfert',
  AJUSTEMENT: 'Ajustement',
  ENCAISSEMENT: 'Encaissement',
  CREDIT: 'Crédit',
  SALAIRE: 'Salaire',
  REMBOURSEMENT_CREDIT: 'Remboursement crédit',
};

/** « août 2026 » à partir d'un 'AAAA-MM' trouvé dans un texte, sinon null. */
function moisDe(texte?: string | null): string | null {
  const m = /(\d{4})-(\d{2})/.exec(texte ?? '');
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** « d'août 2026 » ou « de juin 2026 » — l'élision devant voyelle. */
function duMois(mois: string): string {
  return /^[aeiouâéèêîôû]/i.test(mois) ? `d'${mois}` : `de ${mois}`;
}

/**
 * Libellé d'une ligne de relevé.
 *
 * Le type seul ne suffit pas dès qu'il se répète : une colonne alignant
 * « Salaire », « Salaire », « Salaire » ou quatre « Ajustement » n'apprend rien.
 * Chaque opération porte pourtant de quoi se distinguer — période, numéro de
 * bon, échéance, client — dans sa référence, son motif ou son nom de client.
 *
 * En l'absence de cette information, on retombe sur le type seul : mieux vaut
 * un libellé pauvre qu'un détail inventé.
 */
function libelleOperation(op: {
  typeOperation: TypeOperation;
  reference?: string | null;
  motif?: string | null;
  clientNom?: string | null;
}): string {
  const base = TYPE_LABELS[op.typeOperation] ?? op.typeOperation;
  const ref = op.reference ?? '';

  switch (op.typeOperation) {
    case 'SALAIRE': {
      const mois = moisDe(ref);
      if (!mois) return base;
      // Une annulation porte la même période : sans ce test, un remboursement
      // de salaire s'afficherait comme un paiement.
      return /annulation/i.test(ref)
        ? `Annulation du salaire ${duMois(mois)}`
        : `Salaire du mois ${duMois(mois)}`;
    }
    case 'AJUSTEMENT': {
      const mois = moisDe(ref);
      return mois ? `Ajustement — budget ${duMois(mois)}` : base;
    }
    case 'REMBOURSEMENT_CREDIT': {
      const e = /échéance\s*([\d/]+)/i.exec(ref);
      return e ? `Remboursement crédit — échéance ${e[1]}` : base;
    }
    case 'DECAISSEMENT': {
      if (!ref) return base;
      // « MANUEL-BM-00001 » : le préfixe technique n'apporte rien à l'écran.
      const manuel = /^MANUEL-(.+)$/.exec(ref);
      return manuel ? `Décaissement — bon manuel ${manuel[1]}` : `Décaissement — ${ref}`;
    }
    case 'ENCAISSEMENT': {
      const qui = op.clientNom?.trim() || op.motif?.trim();
      return qui ? `Encaissement — ${qui}` : base;
    }
    case 'CREDIT': {
      const mat = /employé\s+(\S+)/i.exec(ref);
      return mat ? `Crédit — ${mat[1]}` : base;
    }
    default: {
      if (!ref) return base;
      // Certaines références répètent déjà le type (« Recharge DR-2026… ») :
      // les préfixer donnerait « Recharge — Recharge DR-2026… ».
      return ref.toLowerCase().startsWith(base.toLowerCase()) ? ref : `${base} — ${ref}`;
    }
  }
}

function sensOf(t: TypeOperation): 'CREDIT' | 'DEBIT' | null {
  if (CREDIT_TYPES.includes(t)) return 'CREDIT';
  if (DEBIT_TYPES.includes(t)) return 'DEBIT';
  return null;
}

const PAGE_SIZE = 20;

const RELEVE_SORT_COLUMNS = ['date', 'type', 'debit', 'credit'] as const;
type ReleveSortCol = (typeof RELEVE_SORT_COLUMNS)[number];

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

  // Tri à l'écran, appliqué AVANT la pagination : trier la page courante ne
  // trierait que les lignes de la page et laisserait croire à un classement d'ensemble.
  // Le solde cumulé de chaque ligne reste juste — il est calculé plus haut,
  // dans l'ordre chronologique, et reste attaché à son opération.
  const sort = useTableSort<ReleveSortCol>('/releve-agent', RELEVE_SORT_COLUMNS);
  const lignesTriees = useClientSort(releve.lignes, sort.state, {
    date: (l) => new Date(l.op.dateOperation),
    // Le type d'abord, puis la période pour les salaires : sans elle, les lignes
    // « Salaire du mois de… » resteraient groupées mais dans un ordre de mois
    // arbitraire, ce qui donne l'impression d'un tri cassé.
    type: (l) => `${l.op.typeOperation} ${/(\d{4})-(\d{2})/.exec(l.op.reference ?? '')?.[0] ?? ''}`,
    debit: (l) => l.debit,
    credit: (l) => l.credit,
  });

  // Pagination (côté client, sur la liste déjà filtrée par période côté serveur).
  const totalPages = Math.max(1, Math.ceil(lignesTriees.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pagedLignes = lignesTriees.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

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
                  <SortableHeader column="date" state={sort.state} onSort={sort.setSort}>Date</SortableHeader>
                  <SortableHeader column="type" state={sort.state} onSort={sort.setSort}>Type</SortableHeader>
                  <SortableHeader column="debit" state={sort.state} onSort={sort.setSort} align="right">Sorties</SortableHeader>
                  <SortableHeader column="credit" state={sort.state} onSort={sort.setSort} align="right">Entrées</SortableHeader>
                  {/* Non triable : c'est le solde CUMULÉ à la date de l'opération,
                      calculé dans l'ordre chronologique. Le trier n'aurait pas de
                      sens — chaque valeur dépend de celles qui la précèdent. */}
                  <th
                    className="px-4 py-2.5 font-semibold text-right"
                    title="Solde cumulé de l'agent juste après cette opération"
                  >
                    Net
                  </th>
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
                    <td className="px-4 py-3">
                      {libelleOperation(op)}
                      {INTERNE_TYPES.includes(op.typeOperation) && (
                        <span
                          className="ml-2 rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[10px] font-medium text-[#64748B]"
                          title="Mouvement interne : l'argent change de poche sans entrer ni sortir. Il ne compte pas dans le solde."
                        >
                          interne
                        </span>
                      )}
                    </td>
                    {INTERNE_TYPES.includes(op.typeOperation) ? (
                      // Le montant existe et doit rester lisible — le cacher
                      // faisait perdre une information réelle. Il enjambe les
                      // deux colonnes en gris : il n'appartient ni aux sorties
                      // ni aux entrées, et n'entre pas dans le NET.
                      <td colSpan={2} className="px-4 py-3 text-center text-[#94A3B8] tabular-nums">
                        {formatMontant(op.montant)}
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-right font-medium text-[#B91C1C]">
                          {debit ? formatMontant(debit) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-[#15803D]">
                          {credit ? formatMontant(credit) : '—'}
                        </td>
                      </>
                    )}
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
