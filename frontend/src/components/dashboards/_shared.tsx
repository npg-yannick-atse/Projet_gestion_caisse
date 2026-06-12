import { Link } from '@tanstack/react-router';
import { useQueries } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import { Sparkline } from '@/components/Sparkline';
import { getPortefeuilleSolde } from '@/api/financierRef';
import { cn, formatMontant } from '@/lib/utils';

type Tone = 'amber' | 'blue' | 'green' | 'red' | 'gray' | 'purple' | 'teal';

export const TONE: Record<
  Tone,
  { chip: string; stroke: string; fill: string }
> = {
  amber: { chip: 'bg-[#FFFBEB] text-[#92400E]', stroke: '#F59E0B', fill: 'rgba(245,158,11,0.12)' },
  blue: { chip: 'bg-[#EFF6FF] text-[#1A6DB5]', stroke: '#1A6DB5', fill: 'rgba(26,109,181,0.12)' },
  green: { chip: 'bg-[#ECFDF5] text-[#047857]', stroke: '#10B981', fill: 'rgba(16,185,129,0.12)' },
  red: { chip: 'bg-[#FEF3F2] text-[#B42318]', stroke: '#EF4444', fill: 'rgba(239,68,68,0.12)' },
  gray: { chip: 'bg-[#F1F5F9] text-[#475569]', stroke: '#64748B', fill: 'rgba(100,116,139,0.10)' },
  purple: { chip: 'bg-[#F5F3FF] text-[#6D28D9]', stroke: '#7C3AED', fill: 'rgba(124,58,237,0.12)' },
  teal: { chip: 'bg-[#ECFEFF] text-[#0E7490]', stroke: '#0891B2', fill: 'rgba(8,145,178,0.12)' },
};

interface KpiProps {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone: Tone;
  sparkValues?: number[];
  to?: string;
  searchObj?: Record<string, string>;
}

/** Carte KPI compacte avec sparkline optionnelle et navigation. */
export function Kpi({ icon: Icon, label, value, sub, tone, sparkValues, to, searchObj }: KpiProps) {
  const t = TONE[tone];
  const body = (
    <div className="relative h-full overflow-hidden rounded-[14px] border border-[rgba(15,76,129,0.1)] bg-white p-[18px] transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(15,76,129,0.1)]">
      <div className="mb-3 flex items-center justify-between">
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-[10px]', t.chip)}>
          <Icon className="h-[18px] w-[18px]" />
        </div>
        {sparkValues && sparkValues.length > 0 && (
          <Sparkline values={sparkValues} stroke={t.stroke} fill={t.fill} width={80} height={26} />
        )}
      </div>
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.8px] text-[#64748B]">{label}</div>
      <div className="font-display text-[24px] font-semibold leading-none text-[#0F172A] tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-[#64748B]">{sub}</div>}
    </div>
  );
  return to ? (
    <Link to={to} search={searchObj as any} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

interface HeroProps {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  subtitle?: string;
  gradient?: string;
  action?: React.ReactNode;
}

/** Bandeau d'accueil dégradé personnalisable. */
export function Hero({
  icon: Icon,
  eyebrow,
  title,
  subtitle,
  gradient = 'from-[#0A1628] via-[#0F4C81] to-[#1A6DB5]',
  action,
}: HeroProps) {
  return (
    <div className={cn('relative overflow-hidden rounded-[16px] bg-gradient-to-br p-5 text-white', gradient)}>
      <div className="pointer-events-none absolute -right-16 -top-16 h-[200px] w-[200px] rounded-full bg-[radial-gradient(circle,rgba(0,200,150,0.25)_0%,transparent_70%)]" />
      <div className="relative flex flex-wrap items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-white/10 backdrop-blur">
          <Icon className="h-6 w-6 text-white" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <div className="text-[11px] uppercase tracking-[1.5px] text-white/60">{eyebrow}</div>
          <div className="font-display text-lg font-semibold">{title}</div>
          {subtitle && <div className="mt-0.5 text-xs text-white/70">{subtitle}</div>}
        </div>
        {action}
      </div>
    </div>
  );
}

// ============================================================
// UTILISATION DU BUDGET (portefeuilles : alloué vs consommé)
// ============================================================

export interface BudgetSummary {
  /** Budget alloué = somme des soldes initiaux. */
  alloue: number;
  /** Disponible = somme des soldes courants. */
  disponible: number;
  /** Consommé = alloué − disponible (borné à 0). */
  consomme: number;
  /** Taux de consommation en %. */
  pct: number;
  count: number;
  isLoading: boolean;
}

/**
 * Agrège l'utilisation budgétaire d'une liste de portefeuilles.
 * Réutilise la même clé de cache que usePortefeuilleSolde (pas de requête en double).
 */
export function usePortefeuillesBudget(ids: string[]): BudgetSummary {
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['portefeuille', id, 'solde'],
      queryFn: () => getPortefeuilleSolde(id),
    })),
  });
  const isLoading = ids.length > 0 && results.some((r) => r.isLoading);
  let alloue = 0;
  let disponible = 0;
  for (const r of results) {
    if (r.data) {
      alloue += Number(r.data.soldeInitial ?? 0);
      disponible += Number(r.data.solde ?? 0);
    }
  }
  const consomme = Math.max(0, alloue - disponible);
  const pct = alloue > 0 ? Math.min(100, (consomme / alloue) * 100) : 0;
  return { alloue, disponible, consomme, pct, count: ids.length, isLoading };
}

/** Palette de la jauge selon le taux de consommation (vert → ambre → rouge). */
function budgetTone(pct: number) {
  if (pct >= 90) return { bar: 'from-[#EF4444] to-[#B42318]', text: 'text-[#B42318]', chip: 'bg-[#FEF3F2] text-[#B42318]' };
  if (pct >= 70) return { bar: 'from-[#F59E0B] to-[#D97706]', text: 'text-[#B45309]', chip: 'bg-[#FFFBEB] text-[#B45309]' };
  return { bar: 'from-[#10B981] to-[#047857]', text: 'text-[#047857]', chip: 'bg-[#ECFDF5] text-[#047857]' };
}

interface BudgetCardProps {
  title: string;
  summary: BudgetSummary;
  /** Légende secondaire (ex. nombre de portefeuilles, périmètre). */
  hint?: string;
  to?: string;
}

/** Carte « Utilisation du budget » : alloué / consommé / disponible + barre de %. */
export function BudgetCard({ title, summary, hint, to }: BudgetCardProps) {
  const { alloue, disponible, consomme, pct, isLoading } = summary;
  const tone = budgetTone(pct);
  const noBudget = !isLoading && alloue <= 0;

  const body = (
    <div className="h-full rounded-[14px] border border-[rgba(15,76,129,0.1)] bg-white p-[18px] transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(15,76,129,0.1)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.7px] text-[#64748B]">{title}</div>
          {hint && <div className="mt-0.5 text-[10px] text-[#94A3B8]">{hint}</div>}
        </div>
        {!noBudget && (
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums', tone.chip)}>
            {Math.round(pct)} %
          </span>
        )}
      </div>

      {noBudget ? (
        <div className="py-2 text-xs text-[#94A3B8]">Aucun budget alloué.</div>
      ) : (
        <>
          <div className="mb-1 flex items-baseline justify-between">
            <span className={cn('font-display text-[20px] font-bold tabular-nums', tone.text)}>
              {formatMontant(consomme)}
            </span>
            <span className="text-[11px] text-[#64748B]">/ {formatMontant(alloue)}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-[#F1F5F9]">
            <div
              className={cn('h-full rounded-full bg-gradient-to-r transition-all', tone.bar)}
              style={{ width: `${Math.max(isLoading ? 0 : 3, pct)}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-[#94A3B8]">
            <span>Consommé</span>
            <span>Disponible {formatMontant(disponible)}</span>
          </div>
        </>
      )}
    </div>
  );

  return to ? (
    <Link to={to} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}
