import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  ArrowDownCircle,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpCircle,
  Banknote,
  Check,
  Clock,
  Filter,
  Flame,
  Search,
  Star,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { useBons, useBonsSummary, useBonsTimeline } from '@/api/bons';
import { useCaisses, useCaisseSolde } from '@/api/caisses';
import { useDevises } from '@/api/financierRef';
import { useOperations } from '@/api/ledger';
import { useUsers } from '@/api/users';
import { useTypeBons } from '@/api/referentiel';
import {
  useDemandesRecharge,
  useTraiterDemandeRecharge,
  useRejeterDemandeRecharge,
} from '@/api/demandesRecharge';
import { ageLabel, apiErrorMessage, cn, formatMontant } from '@/lib/utils';
import type { Bon, Caisse, Operation, User } from '@/types/api';
import { Hero, Kpi } from './_shared';

interface Props {
  user: User;
  /** Masque l'en-tête Hero (utile quand le dashboard est intégré dans une vue combinée, ex. DAF). */
  showHero?: boolean;
}

/* ============================================================
 * CARTE CAISSE DÉTAILLÉE
 * ============================================================ */

/** Couleur (dégradé) propre à chaque devise. La couleur identifie la monnaie de la caisse. */
const DEVISE_COLORS: Record<string, string> = {
  XOF: 'bg-gradient-to-br from-[#0A1628] to-[#0F4C81]', // bleu marine
  EUR: 'bg-gradient-to-br from-[#312E81] via-[#4338CA] to-[#1E1B4B]', // indigo / violet
  USD: 'bg-gradient-to-br from-[#0F766E] via-[#0D9488] to-[#134E4A]', // teal
};
const DEVISE_COLOR_DEFAULT = 'bg-gradient-to-br from-[#334155] to-[#1E293B]'; // ardoise

function CaisseDetailCard({
  caisse,
  monthOps,
  isSelected,
  onSelect,
  deviseCode,
}: {
  caisse: Caisse;
  monthOps: Operation[];
  isSelected: boolean;
  onSelect: () => void;
  deviseCode: string;
}) {
  const { data: solde } = useCaisseSolde(caisse.id);
  const soldeNum = Number(solde?.solde ?? 0);
  const isClosed = caisse.statut === 'FERMEE';

  // Couleur de la carte = couleur de la devise (la monnaie de la caisse).
  const deviseGrad = DEVISE_COLORS[deviseCode] ?? DEVISE_COLOR_DEFAULT;

  // Agrégats mensuels pour CETTE caisse
  const opsThisCaisse = monthOps.filter((op) => op.caisseId === caisse.id);
  const entrees = opsThisCaisse
    .filter((op) => op.typeOperation === 'RECHARGE')
    .reduce((a, op) => a + Number(op.montant || 0), 0);
  const sorties = opsThisCaisse
    .filter((op) => op.typeOperation === 'DECAISSEMENT')
    .reduce((a, op) => a + Number(op.montant || 0), 0);
  const nbMouvements = opsThisCaisse.length;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group relative overflow-hidden rounded-[14px] border p-4 text-left text-white transition-all',
        isClosed
          ? 'border-transparent bg-gradient-to-br from-[#475569] to-[#1E293B] opacity-60 grayscale'
          : `border-transparent ${deviseGrad}`,
        !isClosed && 'hover:scale-[1.02]',
        isSelected && 'ring-2 ring-[#00C896] ring-offset-2 ring-offset-[#F1F5F9]',
      )}
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[radial-gradient(circle,rgba(0,200,150,0.25)_0%,transparent_70%)]" />
      <div className="relative">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {caisse.estPrincipale && (
                <Star className="h-3 w-3 fill-[#FCD34D] text-[#FCD34D]" />
              )}
              <span className="text-[10px] uppercase tracking-[1px] text-white/60">
                {caisse.code}
              </span>
            </div>
            <div className="truncate font-display text-sm font-semibold">{caisse.libelle}</div>
          </div>
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.5px]',
              isClosed ? 'bg-[#64748B] text-white' : 'bg-[#00C896] text-[#0A1628]',
            )}
          >
            {caisse.statut}
          </span>
        </div>

        {/* Solde courant */}
        <div className="mt-2 border-y border-white/10 py-2">
          <div className="text-[10px] uppercase tracking-[0.6px] text-white/50">Solde courant</div>
          <div className="font-display text-2xl font-semibold tabular-nums">
            {formatMontant(soldeNum)}{' '}
            <span className="text-sm font-medium text-white/60">{deviseCode}</span>
          </div>
        </div>

        {/* Entrées / sorties du mois */}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <div className="flex items-center gap-1 text-[9px] uppercase tracking-[0.6px] text-white/50">
              <ArrowUpCircle className="h-2.5 w-2.5 text-[#10B981]" />
              Entrées
            </div>
            <div className="font-display text-[13px] font-semibold tabular-nums text-[#10B981]">
              {formatMontant(entrees)}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1 text-[9px] uppercase tracking-[0.6px] text-white/50">
              <ArrowDownCircle className="h-2.5 w-2.5 text-[#F87171]" />
              Sorties
            </div>
            <div className="font-display text-[13px] font-semibold tabular-nums text-[#F87171]">
              {formatMontant(sorties)}
            </div>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between text-[10px] text-white/50">
          <span>
            {nbMouvements} mouvement{nbMouvements > 1 ? 's' : ''} ce mois
          </span>
          {isSelected && (
            <span className="font-semibold text-[#00C896]">Filtré ✓</span>
          )}
        </div>
      </div>
    </button>
  );
}

/* ============================================================
 * DASHBOARD CAISSIER orienté "mouvements de caisse"
 * ============================================================ */

type UrgenceFilter = 'ALL' | 'URGENT' | 'NORMAL';

const URGENCE_OPTS: { key: UrgenceFilter; label: string; icon: LucideIcon }[] = [
  { key: 'ALL', label: 'Tous', icon: Filter },
  { key: 'URGENT', label: '> 24 h', icon: Flame },
  { key: 'NORMAL', label: '< 24 h', icon: Clock },
];

export function CaissierDashboard({ user, showHero = true }: Props) {
  const { data: bons } = useBons();
  const { data: bonsSummary } = useBonsSummary({});
  const { data: caisses } = useCaisses();
  const { data: devises } = useDevises();
  const { data: users } = useUsers();
  const { data: typeBons } = useTypeBons();
  const { data: allOperations } = useOperations();
  const { data: decaissedTimeline } = useBonsTimeline({ days: 14, statut: 'DECAISSE' });
  const { data: validatedTimeline } = useBonsTimeline({ days: 14, statut: 'VALIDE' });
  const { data: demandesRecharge } = useDemandesRecharge('EN_ATTENTE');
  const traiterRecharge = useTraiterDemandeRecharge();
  const rejeterRecharge = useRejeterDemandeRecharge();

  const [search, setSearch] = useState('');
  const [selectedCaisseId, setSelectedCaisseId] = useState<string | null>(null);
  const [urgenceFilter, setUrgenceFilter] = useState<UrgenceFilter>('ALL');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const allBons = bons ?? [];
  const userById = new Map((users ?? []).map((u) => [u.id, u]));
  const typesById = new Map((typeBons ?? []).map((t) => [t.id, t]));
  const caissesById = new Map((caisses ?? []).map((c) => [c.id, c]));
  const deviseCodeById = new Map((devises ?? []).map((d) => [d.id, d.code]));

  // ----- Période courante (mois en cours) -----
  const startOfMonth = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);
  const startOfToday = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  // ----- Opérations du mois -----
  const monthOps = useMemo(
    () =>
      (allOperations ?? []).filter((op) => new Date(op.dateOperation).getTime() >= startOfMonth),
    [allOperations, startOfMonth],
  );

  // Mouvements à afficher dans le tableau.
  // - Aucune caisse sélectionnée → uniquement les sorties (DECAISSEMENT), toutes caisses confondues.
  // - Une caisse sélectionnée → entrées (RECHARGE) ET sorties (DECAISSEMENT) de cette caisse.
  const mouvements = useMemo(() => {
    const allOps = allOperations ?? [];
    let list: Operation[];
    if (selectedCaisseId) {
      list = allOps.filter(
        (op) =>
          op.caisseId === selectedCaisseId &&
          (op.typeOperation === 'RECHARGE' || op.typeOperation === 'DECAISSEMENT'),
      );
    } else {
      list = allOps.filter((op) => op.typeOperation === 'DECAISSEMENT');
    }
    return list
      .sort((a, b) => new Date(b.dateOperation).getTime() - new Date(a.dateOperation).getTime())
      .slice(0, 20);
  }, [allOperations, selectedCaisseId]);

  // Totaux entrées/sorties pour la caisse sélectionnée (sur la liste affichée)
  const movementsTotals = useMemo(() => {
    const entrees = mouvements
      .filter((op) => op.typeOperation === 'RECHARGE')
      .reduce((acc, op) => acc + Number(op.montant || 0), 0);
    const sorties = mouvements
      .filter((op) => op.typeOperation === 'DECAISSEMENT')
      .reduce((acc, op) => acc + Number(op.montant || 0), 0);
    return { entrees, sorties };
  }, [mouvements]);

  // ----- File à décaisser -----
  const queue = useMemo<Bon[]>(() => {
    let list = allBons.filter((b) => b.statut === 'VALIDE');
    if (urgenceFilter === 'URGENT') {
      list = list.filter((b) => Date.now() - new Date(b.createdAt).getTime() > 24 * 60 * 60 * 1000);
    } else if (urgenceFilter === 'NORMAL') {
      list = list.filter((b) => Date.now() - new Date(b.createdAt).getTime() <= 24 * 60 * 60 * 1000);
    }
    if (typeFilter) list = list.filter((b) => b.typeBonId === typeFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((b) => b.numero.toLowerCase().includes(q));
    }
    return list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [allBons, urgenceFilter, typeFilter, search]);

  // ----- KPIs -----
  const decaissementsToday = (allOperations ?? []).filter(
    (op) =>
      op.typeOperation === 'DECAISSEMENT' &&
      new Date(op.dateOperation).getTime() >= startOfToday,
  );
  const decaissementsTodaySum = decaissementsToday.reduce(
    (acc, op) => acc + Number(op.montant || 0),
    0,
  );

  const decaissementsMois = monthOps.filter((op) => op.typeOperation === 'DECAISSEMENT');
  const decaissementsMoisSum = decaissementsMois.reduce(
    (acc, op) => acc + Number(op.montant || 0),
    0,
  );

  // Trésorerie totale
  const myCaisses = useMemo(
    () =>
      (caisses ?? []).sort(
        (a, b) =>
          Number(b.estPrincipale) - Number(a.estPrincipale) || a.libelle.localeCompare(b.libelle),
      ),
    [caisses],
  );
  const openCaisses = myCaisses.filter((c) => c.statut === 'OUVERTE').length;

  // Map bons par référence pour résoudre le n° de bon depuis l'opération
  // Heuristique : la référence de l'opération de décaissement contient le numéro du bon
  const bonByNumero = useMemo(() => new Map(allBons.map((b) => [b.numero, b])), [allBons]);

  return (
    <div className="flex flex-col gap-5">
      {showHero && (
        <Hero
          icon={Banknote}
          eyebrow="Poste caissier"
          title={`${user.prenom} ${user.nom}`}
          subtitle={`${queue.length} bon(s) à décaisser • ${openCaisses}/${myCaisses.length} caisses ouvertes`}
          gradient="from-[#064E3B] via-[#047857] to-[#0F4C81]"
          action={
            <Link
              to="/bons"
              search={{ statut: 'VALIDE' } as any}
              className="rounded-[9px] bg-white px-4 py-2 text-xs font-semibold text-[#0A1628] hover:bg-white/90"
            >
              Liste complète →
            </Link>
          }
        />
      )}

      {/* KPIs */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={Clock}
          label="À décaisser maintenant"
          value={queue.length}
          sub={
            queue.length > 0
              ? `${formatMontant(queue.reduce((a, b) => a + Number(b.montantTotal || 0), 0))} en attente`
              : 'File vide'
          }
          tone="amber"
          sparkValues={validatedTimeline?.map((p) => p.count)}
        />
        <Kpi
          icon={ArrowDownCircle}
          label="Décaissé aujourd'hui"
          value={decaissementsToday.length}
          sub={formatMontant(decaissementsTodaySum)}
          tone="red"
          sparkValues={decaissedTimeline?.map((p) => p.count)}
          to="/operations"
        />
        <Kpi
          icon={Banknote}
          label="Décaissé ce mois"
          value={decaissementsMois.length}
          sub={formatMontant(decaissementsMoisSum)}
          tone="green"
          sparkValues={decaissedTimeline?.map((p) => Number(p.montant || 0))}
        />
        <Kpi
          icon={XCircle}
          label="Bons rejetés"
          value={bonsSummary?.byStatut?.REFUSE?.count ?? 0}
          sub="Période complète"
          tone="red"
          to="/bons"
          searchObj={{ statut: 'REFUSE' }}
        />
      </div>

      {/* Zone de travail : file de décaissement (principal) + colonne contexte (recharges, caisses) */}
      <div className="grid gap-3.5 xl:grid-cols-[1.7fr_1fr] xl:items-start">
      {/* Colonne principale : file de décaissement + journal des mouvements */}
      <div className="flex min-w-0 flex-col gap-3.5">
      {/* QUEUE À DÉCAISSER (action) */}
      <div className="min-w-0 overflow-hidden rounded-[14px] border border-[rgba(15,76,129,0.1)] bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-[rgba(15,76,129,0.08)] px-5 py-3">
          <Banknote className="h-4 w-4 text-[#F59E0B]" />
          <div className="font-display text-[13px] font-semibold">
            Bons en attente de décaissement
          </div>
          <span className="rounded-full bg-[#FFFBEB] px-2 py-0.5 text-[10px] font-semibold text-[#92400E]">
            {queue.length}
          </span>
          <Link
            to="/bons"
            search={{ statut: 'VALIDE' } as any}
            className="ml-auto flex items-center gap-1 text-xs font-medium text-[#1A6DB5] hover:underline"
          >
            Voir tout <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {/* Filtres */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[rgba(15,76,129,0.08)] bg-[#F8FAFC] px-5 py-2.5">
          <div className="flex items-center gap-1.5">
            {URGENCE_OPTS.map((opt) => {
              const Icon = opt.icon;
              const active = urgenceFilter === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setUrgenceFilter(opt.key)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-[7px] px-2 py-1 text-[10px] font-medium transition-colors',
                    active
                      ? 'bg-[#0F4C81] text-white'
                      : 'bg-white text-[#475569] hover:bg-[#E2E8F0]',
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {opt.label}
                </button>
              );
            })}
          </div>
          <div className="h-4 w-px bg-[rgba(15,76,129,0.1)]" />
          <select
            value={typeFilter ?? ''}
            onChange={(e) => setTypeFilter(e.target.value || null)}
            aria-label="Filtrer par type"
            title="Filtrer par type"
            className="rounded-[7px] border border-[rgba(15,76,129,0.1)] bg-white px-2 py-1 text-[10px] text-[#475569]"
          >
            <option value="">Tous types</option>
            {(typeBons ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.libelle}
              </option>
            ))}
          </select>
          <div className="relative ml-auto">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[#94A3B8]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="N° bon…"
              className="w-40 rounded-[7px] border border-[rgba(15,76,129,0.1)] bg-white py-1 pl-7 pr-2 text-[10px] outline-none focus:border-[#1A6DB5]"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#FAFBFC]">
              <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
                <th className="px-5 py-2.5 font-semibold">Bon</th>
                <th className="px-5 py-2.5 font-semibold">Type</th>
                <th className="px-5 py-2.5 font-semibold">Demandeur</th>
                <th className="px-5 py-2.5 text-right font-semibold">Montant</th>
                <th className="px-5 py-2.5 font-semibold">Durée</th>
                <th className="px-5 py-2.5 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {queue.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-[#64748B]">
                    <div className="mb-2 text-2xl opacity-30">✅</div>
                    {search || typeFilter || urgenceFilter !== 'ALL'
                      ? 'Aucun bon ne correspond aux filtres'
                      : 'File vide — rien à décaisser'}
                  </td>
                </tr>
              )}
              {queue.slice(0, 10).map((bon) => {
                const u = userById.get(bon.demandeurId);
                const ageMs = Date.now() - new Date(bon.createdAt).getTime();
                const isUrgent = ageMs > 24 * 60 * 60 * 1000;
                const typeLib = typesById.get(bon.typeBonId)?.libelle ?? '—';
                return (
                  <tr
                    key={bon.id}
                    className={cn(
                      'border-t border-[rgba(15,76,129,0.05)] hover:bg-[#FAFBFF]',
                      isUrgent && 'bg-[#FEF3F2]/30',
                    )}
                  >
                    <td className="px-5 py-3">
                      <div className="font-medium text-[#1A6DB5]">{bon.numero}</div>
                      {bon.demandeExtension && (
                        <div className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-[#FEF3F2] px-1.5 py-0.5 text-[9px] font-medium text-[#B42318]">
                          Ext.
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-[#475569]">{typeLib}</td>
                    <td className="px-5 py-3 text-[#475569]">
                      {u ? (
                        <div>
                          <div className="text-[#0F172A]">
                            {u.prenom} {u.nom}
                          </div>
                          <div className="text-[10px] text-[#94A3B8]">#{u.matricule}</div>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold">
                      {formatMontant(bon.montantTotal)}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums',
                          isUrgent
                            ? 'bg-[#FEF3F2] text-[#B42318]'
                            : 'bg-[#F1F5F9] text-[#475569]',
                        )}
                      >
                        {isUrgent && <Flame className="h-3 w-3" />}
                        {ageLabel(bon.createdAt)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        to="/bons/$bonId"
                        params={{ bonId: bon.id }}
                        className="inline-flex items-center gap-1 rounded-[7px] bg-[#00C896] px-3 py-1 text-[10px] font-semibold text-white transition hover:bg-[#047857]"
                      >
                        Décaisser
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MOUVEMENTS DE CAISSE — Sorties par défaut, entrées + sorties quand une caisse est sélectionnée */}
      <div className="overflow-hidden rounded-[14px] border border-[rgba(15,76,129,0.1)] bg-white">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-[rgba(15,76,129,0.08)] px-5 py-3">
          {selectedCaisseId ? (
            <ArrowLeftRight className="h-4 w-4 text-[#1A6DB5]" />
          ) : (
            <ArrowDownCircle className="h-4 w-4 text-[#F87171]" />
          )}
          <div className="font-display text-[13px] font-semibold">
            {selectedCaisseId ? 'Mouvements de caisse' : 'Sorties de caisse'}
          </div>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-semibold',
              selectedCaisseId
                ? 'bg-[#E8F2FF] text-[#1A6DB5]'
                : 'bg-[#FEF3F2] text-[#B42318]',
            )}
          >
            {mouvements.length}
          </span>
          {selectedCaisseId && (
            <>
              <span className="rounded-full bg-[#0F4C81] px-2 py-0.5 text-[10px] font-semibold text-white">
                {caissesById.get(selectedCaisseId)?.libelle ?? selectedCaisseId}
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] text-[#047857]">
                <ArrowUpCircle className="h-3 w-3" />+ {formatMontant(movementsTotals.entrees)}
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] text-[#B42318]">
                <ArrowDownCircle className="h-3 w-3" />− {formatMontant(movementsTotals.sorties)}
              </span>
            </>
          )}
          <Link
            to="/operations"
            className="ml-auto flex items-center gap-1 text-xs font-medium text-[#1A6DB5] hover:underline"
          >
            Journal complet <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {!selectedCaisseId && (
          <div className="border-b border-[rgba(15,76,129,0.05)] bg-[#FAFBFC] px-5 py-2 text-[11px] text-[#64748B]">
            💡 Sélectionnez une caisse ci-dessus pour voir <strong>les entrées et les sorties</strong> de cette caisse.
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#FAFBFC]">
              <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
                <th className="px-5 py-2.5 font-semibold">Date</th>
                {selectedCaisseId && <th className="px-5 py-2.5 font-semibold">Type</th>}
                <th className="px-5 py-2.5 font-semibold">Caisse</th>
                <th className="px-5 py-2.5 font-semibold">Bon associé</th>
                <th className="px-5 py-2.5 font-semibold">Référence</th>
                <th className="px-5 py-2.5 text-right font-semibold">Montant</th>
              </tr>
            </thead>
            <tbody>
              {mouvements.length === 0 && (
                <tr>
                  <td colSpan={selectedCaisseId ? 6 : 5} className="px-5 py-10 text-center text-[#64748B]">
                    <div className="mb-2 text-2xl opacity-30">💸</div>
                    {selectedCaisseId
                      ? 'Aucun mouvement pour cette caisse'
                      : 'Aucune sortie enregistrée'}
                  </td>
                </tr>
              )}
              {mouvements.map((op) => {
                const dt = new Date(op.dateOperation);
                const caisse = op.caisseId ? caissesById.get(op.caisseId) : undefined;
                const bonMatch = op.reference ? bonByNumero.get(op.reference) : undefined;
                const isEntree = op.typeOperation === 'RECHARGE';
                return (
                  <tr
                    key={op.id}
                    className="border-t border-[rgba(15,76,129,0.05)] hover:bg-[#FAFBFF]"
                  >
                    <td className="px-5 py-3">
                      <div className="font-medium text-[#0F172A]">
                        {dt.toLocaleDateString('fr-FR')}
                      </div>
                      <div className="text-[10px] text-[#64748B]">
                        {dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    {selectedCaisseId && (
                      <td className="px-5 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
                            isEntree
                              ? 'bg-[#ECFDF5] text-[#047857]'
                              : 'bg-[#FEF3F2] text-[#B42318]',
                          )}
                        >
                          {isEntree ? (
                            <ArrowUpCircle className="h-2.5 w-2.5" />
                          ) : (
                            <ArrowDownCircle className="h-2.5 w-2.5" />
                          )}
                          {isEntree ? 'Entrée' : 'Sortie'}
                        </span>
                      </td>
                    )}
                    <td className="px-5 py-3">
                      {caisse ? (
                        <div>
                          <div className="font-medium text-[#0F172A]">{caisse.libelle}</div>
                          <div className="text-[10px] text-[#64748B]">{caisse.code}</div>
                        </div>
                      ) : (
                        <span className="text-[#94A3B8]">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {bonMatch ? (
                        <Link
                          to="/bons/$bonId"
                          params={{ bonId: bonMatch.id }}
                          className="font-medium text-[#1A6DB5] hover:underline"
                        >
                          {bonMatch.numero}
                        </Link>
                      ) : op.reference ? (
                        <span className="font-mono text-[#475569]">{op.reference}</span>
                      ) : (
                        <span className="text-[#94A3B8]">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 font-mono text-[10px] text-[#94A3B8]">
                      {op.transactionUuid.slice(0, 8)}…
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span
                        className={cn(
                          'font-display text-[13px] font-semibold tabular-nums',
                          isEntree ? 'text-[#047857]' : 'text-[#B42318]',
                        )}
                      >
                        {isEntree ? '+ ' : '− '}
                        {formatMontant(op.montant)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      </div>{/* fin colonne principale */}

      {/* Colonne contexte : recharges à traiter + soldes des caisses */}
      <div className="flex min-w-0 flex-col gap-3.5">
      {/* Demandes de recharge à traiter */}
      <div className="overflow-hidden rounded-[14px] border border-[rgba(15,76,129,0.1)] bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-[rgba(15,76,129,0.08)] px-5 py-3">
          <Banknote className="h-4 w-4 text-[#00C896]" />
          <div className="font-display text-[13px] font-semibold">Demandes de recharge à traiter</div>
          <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[10px] font-semibold text-[#047857]">
            {(demandesRecharge ?? []).length}
          </span>
          <Link
            to="/demandes-recharge"
            className="ml-auto flex items-center gap-1 text-xs font-medium text-[#1A6DB5] hover:underline"
          >
            Voir tout <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {(apiErrorMessage(traiterRecharge.error, '') || apiErrorMessage(rejeterRecharge.error, '')) && (
          <div className="px-5 pt-3 text-xs text-[#EF4444]">
            {apiErrorMessage(traiterRecharge.error, '') || apiErrorMessage(rejeterRecharge.error, '')}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#FAFBFC]">
              <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
                <th className="px-5 py-2.5 font-semibold">N°</th>
                <th className="px-5 py-2.5 font-semibold">Demandeur</th>
                <th className="px-5 py-2.5 text-right font-semibold">Montant</th>
                <th className="px-5 py-2.5 font-semibold">Motif</th>
                <th className="px-5 py-2.5 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {(demandesRecharge ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-[#64748B]">
                    <div className="mb-2 text-2xl opacity-30">💸</div>
                    Aucune demande de recharge en attente
                  </td>
                </tr>
              )}
              {(demandesRecharge ?? []).map((d) => {
                const dem = userById.get(d.demandeurId);
                const busy = traiterRecharge.isPending || rejeterRecharge.isPending;
                return (
                  <tr key={d.id} className="border-t border-[rgba(15,76,129,0.05)] hover:bg-[#FAFBFF]">
                    <td className="px-5 py-3 font-mono text-[11px] text-[#1A6DB5]">{d.numero}</td>
                    <td className="px-5 py-3">{dem ? `${dem.prenom} ${dem.nom}` : `#${d.demandeurId}`}</td>
                    <td className="px-5 py-3 text-right font-display font-semibold tabular-nums">
                      {formatMontant(d.montant)}
                    </td>
                    <td className="px-5 py-3 text-[#64748B]">{d.motif || '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => traiterRecharge.mutate({ id: d.id })}
                          title="Effectuer la recharge"
                          className="inline-flex items-center gap-1 rounded-[7px] bg-[#0F4C81] px-2.5 py-1 text-[11px] font-medium text-white hover:bg-[#1A6DB5] disabled:opacity-60"
                        >
                          <Check className="h-3 w-3" /> Recharger
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => rejeterRecharge.mutate({ id: d.id })}
                          title="Rejeter la demande"
                          className="inline-flex items-center gap-1 rounded-[7px] border border-[rgba(15,76,129,0.15)] px-2.5 py-1 text-[11px] font-medium text-[#B42318] hover:bg-[#FEF3F2] disabled:opacity-60"
                        >
                          <X className="h-3 w-3" /> Rejeter
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MES CAISSES — détail solde + entrées/sorties du mois */}
      <div>
        <div className="mb-3 flex items-baseline gap-2">
          <h2 className="font-display text-sm font-semibold text-[#0F172A]">Mes caisses</h2>
          <span className="text-[11px] text-[#64748B]">
            Solde courant • Entrées et sorties du mois
          </span>
          {selectedCaisseId && (
            <button
              type="button"
              onClick={() => setSelectedCaisseId(null)}
              className="ml-auto text-[11px] font-medium text-[#1A6DB5] hover:underline"
            >
              Voir toutes les caisses
            </button>
          )}
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-1">
          {myCaisses.length === 0 && (
            <div className="col-span-full rounded-[14px] border border-dashed border-[rgba(15,76,129,0.2)] bg-white py-10 text-center text-sm text-[#64748B]">
              Aucune caisse rattachée à votre profil.
            </div>
          )}
          {myCaisses.map((c) => (
            <CaisseDetailCard
              key={c.id}
              caisse={c}
              monthOps={monthOps}
              deviseCode={deviseCodeById.get(c.deviseId) ?? ''}
              isSelected={selectedCaisseId === c.id}
              onSelect={() => setSelectedCaisseId(selectedCaisseId === c.id ? null : c.id)}
            />
          ))}
        </div>
      </div>

      </div>{/* fin colonne contexte */}
      </div>{/* fin zone de travail (grille 2 colonnes) */}
    </div>
  );
}
