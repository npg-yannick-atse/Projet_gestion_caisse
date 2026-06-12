import { useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  ArrowDownCircle,
  ArrowLeftRight,
  ArrowUpCircle,
  Banknote,
  CalendarRange,
  Download,
  Filter,
  Lock,
  Receipt,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useOperations, exportOperationsXlsx } from '@/api/ledger';
import { SortableHeader } from '@/components/SortableHeader';
import { useTableSort } from '@/hooks/useTableSort';

const OPS_SORT_COLUMNS = ['dateOperation', 'typeOperation', 'montant', 'reference'] as const;
type OpSortCol = (typeof OPS_SORT_COLUMNS)[number];
import { useCaisses } from '@/api/caisses';
import { usePortefeuilles, useDevises } from '@/api/financierRef';
import { useUsers, useUserRoles } from '@/api/users';
import { useAuthStore } from '@/stores/auth.store';
import { cn, formatMontant } from '@/lib/utils';
import type { Operation, RoleCode, TypeOperation } from '@/types/api';

type TabKey = 'TOUTES' | TypeOperation;

interface TabDef {
  key: TabKey;
  label: string;
  icon: LucideIcon;
  type?: TypeOperation;
}

const ALL_TABS: TabDef[] = [
  { key: 'TOUTES', label: 'Toutes', icon: SlidersHorizontal },
  { key: 'RECHARGE', label: 'Recharges', icon: ArrowUpCircle, type: 'RECHARGE' },
  { key: 'DECAISSEMENT', label: 'Décaissements', icon: ArrowDownCircle, type: 'DECAISSEMENT' },
  { key: 'TRANSFERT', label: 'Transferts', icon: ArrowLeftRight, type: 'TRANSFERT' },
  { key: 'AJUSTEMENT', label: 'Ajustements', icon: SlidersHorizontal, type: 'AJUSTEMENT' },
];

const TYPE_BADGE: Record<TypeOperation, { label: string; bg: string; text: string; dot: string; icon: LucideIcon }> = {
  RECHARGE: { label: 'Recharge', bg: '#ECFDF5', text: '#047857', dot: '#10B981', icon: ArrowUpCircle },
  DECAISSEMENT: { label: 'Décaissement', bg: '#FEF3F2', text: '#B42318', dot: '#F04438', icon: ArrowDownCircle },
  TRANSFERT: { label: 'Transfert', bg: '#EFF6FF', text: '#1A6DB5', dot: '#1A6DB5', icon: ArrowLeftRight },
  AJUSTEMENT: { label: 'Ajustement', bg: '#FFFBEB', text: '#92400E', dot: '#F59E0B', icon: SlidersHorizontal },
};

/** Date du jour au format YYYY-MM-DD (heure locale). */
function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const t = new Date();
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  );
}

function sum(list: Operation[]): number {
  return list.reduce((acc, op) => acc + Number(op.montant || 0), 0);
}

function OpTypeBadge({ type }: { type: TypeOperation }) {
  const meta = TYPE_BADGE[type];
  const Icon = meta.icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
      style={{ backgroundColor: meta.bg, color: meta.text }}
    >
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent: 'blue' | 'green' | 'red' | 'gray';
}) {
  const accentMap = {
    blue: { chip: 'bg-[#EFF6FF] text-[#1A6DB5]', corner: 'bg-[#1A6DB5]' },
    green: { chip: 'bg-[#ECFDF5] text-[#047857]', corner: 'bg-[#10B981]' },
    red: { chip: 'bg-[#FEF3F2] text-[#B42318]', corner: 'bg-[#F04438]' },
    gray: { chip: 'bg-[#F8FAFC] text-[#64748B]', corner: 'bg-[#64748B]' },
  }[accent];
  return (
    <div className="relative h-full overflow-hidden rounded-[14px] border border-[rgba(15,76,129,0.1)] bg-white p-[18px]">
      <div className={cn('absolute right-0 top-0 h-[60px] w-[60px] rounded-bl-[60px] opacity-[0.06]', accentMap.corner)} />
      <div className={cn('mb-3 flex h-9 w-9 items-center justify-center rounded-[10px]', accentMap.chip)}>
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.8px] text-[#64748B]">{label}</div>
      <div className="font-display text-[24px] font-semibold leading-none text-[#0F172A] tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-[#64748B]">{sub}</div>}
    </div>
  );
}

export function OperationsPage() {
  const [tab, setTab] = useState<TabKey>('TOUTES');
  const [search, setSearch] = useState('');
  // Par défaut, on n'affiche que les opérations du JOUR (le journal du jour).
  const today = todayLocal();
  const [dateFrom, setDateFrom] = useState(() => todayLocal());
  const [dateTo, setDateTo] = useState(() => todayLocal());
  // Vue par défaut = aujourd'hui, sans recherche.
  const isDefaultView = !search && dateFrom === today && dateTo === today;
  const resetToToday = () => {
    setSearch('');
    setDateFrom(today);
    setDateTo(today);
  };

  // La recherche texte est débouncée pour ne pas requêter la BD à chaque frappe.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(id);
  }, [search]);

  const user = useAuthStore((s) => s.user);
  const { data: userRoles } = useUserRoles(user?.id ?? null);
  const roleCodes = new Set<RoleCode>((userRoles ?? []).map((r) => r.code));
  const isAdmin = roleCodes.has('SUPER_ADMIN') || roleCodes.has('ADMINISTRATEUR');
  const isCaissier = roleCodes.has('CAISSIER');
  const isValidateur = roleCodes.has('VALIDATEUR');
  const isDemandeur = roleCodes.has('DEMANDEUR') && !isAdmin && !isCaissier && !isValidateur;

  const activeType = ALL_TABS.find((t) => t.key === tab)?.type;
  // Tri serveur (URL-synced) — whitelist alignée avec LedgerService.OPERATION_SORT_MAP
  const sort = useTableSort<OpSortCol>('/operations', OPS_SORT_COLUMNS);
  // Type + recherche + dates + tri : tout est exécuté côté serveur (en BD).
  const { data: ops, isLoading } = useOperations({
    type: activeType,
    search: debouncedSearch || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    sortBy: sort.state.by ?? undefined,
    sortDir: sort.state.by ? sort.state.dir : undefined,
  });
  const { data: caisses } = useCaisses();
  const { data: portefeuilles } = usePortefeuilles();
  const { data: devises } = useDevises();
  const { data: users } = useUsers();

  // Restriction d'accès : le DEMANDEUR pur n'a pas accès au journal d'opérations.
  if (isDemandeur) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-[16px] border border-[rgba(15,76,129,0.1)] bg-white p-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FEF3F2] text-[#B42318]">
          <Lock className="h-6 w-6" />
        </div>
        <div className="font-display text-lg font-semibold">Accès restreint</div>
        <p className="text-sm text-[#64748B]">
          Le journal des opérations est réservé aux profils administratif et financier (administrateur,
          caissier, validateur). Consultez vos bons depuis la rubrique « Bons ».
        </p>
        <Link
          to="/bons"
          className="mt-2 rounded-[9px] bg-[#0F4C81] px-4 py-2 text-xs font-medium text-white hover:bg-[#1A6DB5]"
        >
          Aller à mes bons
        </Link>
      </div>
    );
  }

  // Application des restrictions par persona (en plus du filtre serveur via `activeType`).
  const baseOps = useMemo(() => {
    const list = ops ?? [];
    if (isAdmin) return list;
    if (isCaissier) {
      // Le caissier voit les mouvements de trésorerie : recharges + décaissements.
      return list.filter((op) => op.typeOperation === 'RECHARGE' || op.typeOperation === 'DECAISSEMENT');
    }
    if (isValidateur) {
      // Le validateur voit uniquement les décaissements (traçabilité des bons qu'il a validés).
      return list.filter((op) => op.typeOperation === 'DECAISSEMENT');
    }
    return list;
  }, [ops, isAdmin, isCaissier, isValidateur]);

  // Onglets affichés selon le persona.
  const tabs = useMemo(() => {
    if (isAdmin) return ALL_TABS;
    if (isCaissier) {
      return ALL_TABS.filter((t) => t.key === 'TOUTES' || t.key === 'RECHARGE' || t.key === 'DECAISSEMENT');
    }
    if (isValidateur) {
      return ALL_TABS.filter((t) => t.key === 'TOUTES' || t.key === 'DECAISSEMENT');
    }
    return ALL_TABS;
  }, [isAdmin, isCaissier, isValidateur]);

  // Recherche et dates sont désormais appliquées en BD (cf. useOperations) : la liste reçue
  // est déjà filtrée. Seule subsiste la restriction d'accès par rôle (baseOps).
  const filtered = baseOps;

  // KPIs (calculés sur la liste filtrée renvoyée par le serveur).
  const totalOps = baseOps.length;
  const totalRecharge = sum(baseOps.filter((op) => op.typeOperation === 'RECHARGE'));
  const totalDecaisse = sum(baseOps.filter((op) => op.typeOperation === 'DECAISSEMENT'));
  const todayCount = baseOps.filter((op) => isToday(op.dateOperation)).length;

  // Lookups
  const caisseById = new Map((caisses ?? []).map((c) => [c.id, c]));
  const ptfById = new Map((portefeuilles ?? []).map((p) => [p.id, p]));
  const userById = new Map((users ?? []).map((u) => [u.id, u]));
  const deviseById = new Map((devises ?? []).map((d) => [d.id, d]));

  // Export Excel (.xlsx) — généré côté serveur, en respectant les filtres et le rôle.
  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await exportOperationsXlsx({
        type: activeType,
        search: debouncedSearch || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `operations_${dateFrom || 'tout'}_au_${dateTo || 'tout'}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* En-tête */}
      <div className="relative overflow-hidden rounded-[16px] bg-gradient-to-br from-[#0A1628] via-[#0F4C81] to-[#1A6DB5] p-5 text-white">
        <div className="pointer-events-none absolute -right-16 -top-16 h-[200px] w-[200px] rounded-full bg-[radial-gradient(circle,rgba(0,200,150,0.25)_0%,transparent_70%)]" />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-white/10 backdrop-blur">
            <Receipt className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="text-[11px] uppercase tracking-[1.5px] text-white/60">Journal financier</div>
            <div className="font-display text-lg font-semibold">Opérations</div>
            <div className="mt-0.5 text-xs text-white/70">
              Recharges, décaissements, transferts et ajustements de trésorerie
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            {isAdmin && (
              <span className="rounded-full bg-[#0F4C81] px-3 py-1 text-[11px] font-medium text-white">
                Accès complet
              </span>
            )}
            {!isAdmin && isCaissier && (
              <span className="rounded-full bg-[#00C896] px-3 py-1 text-[11px] font-medium text-white">
                Vue caissier
              </span>
            )}
            {!isAdmin && !isCaissier && isValidateur && (
              <span className="rounded-full bg-[#1A6DB5] px-3 py-1 text-[11px] font-medium text-white">
                Vue validateur
              </span>
            )}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={SlidersHorizontal}
          label="Opérations"
          value={totalOps}
          sub="Total visible pour vous"
          accent="blue"
        />
        {(isAdmin || isCaissier) && (
          <KpiCard
            icon={ArrowUpCircle}
            label="Total rechargé"
            value={formatMontant(totalRecharge)}
            sub="Cumul des recharges"
            accent="green"
          />
        )}
        <KpiCard
          icon={ArrowDownCircle}
          label="Total décaissé"
          value={formatMontant(totalDecaisse)}
          sub="Cumul des décaissements"
          accent="red"
        />
        <KpiCard
          icon={CalendarRange}
          label="Aujourd'hui"
          value={todayCount}
          sub={todayCount === 0 ? 'Aucune ce jour' : 'Opérations du jour'}
          accent="gray"
        />
      </div>

      {/* Barre de filtres */}
      <div className="rounded-[14px] border border-[rgba(15,76,129,0.1)] bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-xs font-medium transition-colors',
                  active
                    ? 'bg-[#0F4C81] text-white'
                    : 'bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="mt-3 grid gap-2.5 sm:grid-cols-[1fr_auto_auto_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#64748B]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par référence, UUID, montant…"
              className="w-full rounded-[9px] border border-[rgba(15,76,129,0.15)] bg-white py-2 pl-8 pr-3 text-xs outline-none focus:border-[#1A6DB5] focus:ring-2 focus:ring-[#1A6DB5]/15"
            />
          </div>
          <div className="flex items-center gap-1.5 rounded-[9px] border border-[rgba(15,76,129,0.15)] bg-white px-2.5 py-2 text-xs">
            <CalendarRange className="h-3.5 w-3.5 text-[#64748B]" />
            <input
              type="date"
              aria-label="Date de début"
              title="Date de début"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border-0 bg-transparent text-xs outline-none"
            />
          </div>
          <div className="flex items-center gap-1.5 rounded-[9px] border border-[rgba(15,76,129,0.15)] bg-white px-2.5 py-2 text-xs">
            <span className="text-[#64748B]">au</span>
            <input
              type="date"
              aria-label="Date de fin"
              title="Date de fin"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border-0 bg-transparent text-xs outline-none"
            />
          </div>
          {!isDefaultView && (
            <button
              type="button"
              onClick={resetToToday}
              title="Revenir aux opérations du jour"
              className="rounded-[9px] border border-[rgba(15,76,129,0.15)] bg-white px-3 py-2 text-xs font-medium text-[#475569] hover:bg-[#F1F5F9]"
            >
              Aujourd'hui
            </button>
          )}
        </div>
      </div>

      {/* Tableau */}
      <div className="overflow-hidden rounded-[14px] border border-[rgba(15,76,129,0.1)] bg-white">
        <div className="flex items-center gap-2.5 border-b border-[rgba(15,76,129,0.1)] px-5 py-4">
          <Filter className="h-4 w-4 text-[#64748B]" />
          <div className="font-display text-[13px] font-semibold">Mouvements</div>
          <div className="rounded-full bg-[#E8F2FF] px-2 py-0.5 text-[10px] font-semibold text-[#1A6DB5]">
            {filtered.length} résultat{filtered.length > 1 ? 's' : ''}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {!isAdmin && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#FFFBEB] px-2 py-0.5 text-[10px] font-medium text-[#92400E]">
                <ShieldAlert className="h-3 w-3" />
                Vue restreinte à votre rôle
              </span>
            )}
            <button
              type="button"
              onClick={handleExport}
              disabled={filtered.length === 0 || exporting}
              title="Exporter les opérations filtrées vers Excel (.xlsx)"
              className="inline-flex items-center gap-1.5 rounded-[9px] border border-[rgba(15,76,129,0.15)] bg-white px-3 py-1.5 text-[11px] font-medium text-[#0F4C81] transition hover:bg-[#E8F2FF] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" /> {exporting ? 'Export…' : 'Exporter Excel'}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#F8FAFC]">
              <tr className="text-left text-[10px] uppercase tracking-[0.8px] text-[#64748B]">
                <SortableHeader
                  column="dateOperation"
                  state={sort.state}
                  onSort={sort.setSort}
                  defaultDir="desc"
                >
                  Date
                </SortableHeader>
                <SortableHeader column="typeOperation" state={sort.state} onSort={sort.setSort}>
                  Type
                </SortableHeader>
                <th className="px-5 py-2.5 font-semibold">Caisse / Portefeuille</th>
                <SortableHeader column="reference" state={sort.state} onSort={sort.setSort}>
                  Référence
                </SortableHeader>
                <SortableHeader
                  column="montant"
                  state={sort.state}
                  onSort={sort.setSort}
                  align="right"
                  defaultDir="desc"
                >
                  Montant
                </SortableHeader>
                <th className="px-5 py-2.5 font-semibold">Par</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-[#64748B]">
                    Chargement…
                  </td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-[#64748B]">
                    <div className="mb-2 text-2xl opacity-30">📊</div>
                    Aucune opération
                  </td>
                </tr>
              )}
              {filtered.map((op) => {
                const dt = new Date(op.dateOperation);
                const caisse = op.caisseId ? caisseById.get(op.caisseId) : undefined;
                const ptf = op.portefeuilleId ? ptfById.get(op.portefeuilleId) : undefined;
                const u = userById.get(op.userId);
                const dev = deviseById.get(op.deviseId);
                const isOut = op.typeOperation === 'DECAISSEMENT';
                const isIn = op.typeOperation === 'RECHARGE';
                return (
                  <tr key={op.id} className="border-t border-[rgba(15,76,129,0.05)] hover:bg-[#FAFBFF]">
                    <td className="px-5 py-3">
                      <div className="font-medium text-[#0F172A]">
                        {dt.toLocaleDateString('fr-FR')}
                      </div>
                      <div className="text-[10px] text-[#64748B]">
                        {dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <OpTypeBadge type={op.typeOperation} />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-col gap-0.5">
                        {caisse && (
                          <span className="inline-flex items-center gap-1 text-[#0F172A]">
                            <Wallet className="h-3 w-3 text-[#1A6DB5]" />
                            <span className="font-medium">{caisse.libelle}</span>
                            <span className="text-[10px] text-[#64748B]">({caisse.code})</span>
                          </span>
                        )}
                        {ptf && (
                          <span className="inline-flex items-center gap-1 text-[#0F172A]">
                            <Banknote className="h-3 w-3 text-[#00C896]" />
                            <span className="font-medium">{ptf.libelle}</span>
                            <span className="text-[10px] text-[#64748B]">({ptf.code})</span>
                          </span>
                        )}
                        {!caisse && !ptf && <span className="text-[#64748B]">—</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="font-mono text-[11px] text-[#475569]">
                        {op.reference || '—'}
                      </div>
                      <div className="font-mono text-[9px] text-[#94A3B8]">
                        {op.transactionUuid.slice(0, 8)}…
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span
                        className={cn(
                          'font-display text-[13px] font-semibold tabular-nums',
                          isOut && 'text-[#B42318]',
                          isIn && 'text-[#047857]',
                          !isOut && !isIn && 'text-[#0F172A]',
                        )}
                      >
                        {isOut ? '−' : isIn ? '+' : ''}
                        {formatMontant(op.montant)}
                      </span>
                      {dev && (
                        <div className="text-[10px] text-[#64748B]">{dev.code}</div>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {u ? (
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#0F4C81] to-[#00C896] text-[10px] font-semibold text-white">
                            {`${u.prenom?.[0] ?? ''}${u.nom?.[0] ?? ''}`.toUpperCase() || '?'}
                          </div>
                          <div>
                            <div className="font-medium text-[#0F172A]">
                              {u.prenom} {u.nom}
                            </div>
                            <div className="text-[10px] text-[#64748B]">#{u.matricule}</div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-[#64748B]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
