import { useMemo } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Clock,
  Flame,
  type LucideIcon,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useBons, useBonsSummary, useBonsTimeline } from '@/api/bons';
import { useUsers } from '@/api/users';
import { usePortefeuilles } from '@/api/financierRef';
import { Sparkline } from '@/components/Sparkline';
import { StatutBadge } from '@/components/StatutBadge';
import { ageLabel, cn, formatMontant } from '@/lib/utils';
import type { Bon, User } from '@/types/api';
import { BudgetCard, usePortefeuillesBudget } from './_shared';

interface KpiProps {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone: 'amber' | 'blue' | 'green' | 'red';
  sparkValues?: number[];
  to?: string;
}

const TONE = {
  amber: { chip: 'bg-[#FFFBEB] text-[#92400E]', stroke: '#F59E0B', fill: 'rgba(245,158,11,0.12)' },
  blue: { chip: 'bg-[#EFF6FF] text-[#1A6DB5]', stroke: '#1A6DB5', fill: 'rgba(26,109,181,0.12)' },
  green: { chip: 'bg-[#ECFDF5] text-[#047857]', stroke: '#10B981', fill: 'rgba(16,185,129,0.12)' },
  red: { chip: 'bg-[#FEF3F2] text-[#B42318]', stroke: '#EF4444', fill: 'rgba(239,68,68,0.12)' },
};

function Kpi({ icon: Icon, label, value, sub, tone, sparkValues, to }: KpiProps) {
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
      <div className="font-display text-[26px] font-semibold leading-none text-[#0F172A] tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-[#64748B]">{sub}</div>}
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

interface Props {
  user: User;
}

export function ValidateurDashboard({ user }: Props) {
  const navigate = useNavigate();
  const { data: bons } = useBons();
  const { data: timeline } = useBonsTimeline({ days: 14 });
  const { data: createdTimeline } = useBonsTimeline({ days: 14, statut: 'CREE' });
  const { data: validatedTimeline } = useBonsTimeline({ days: 14, statut: 'VALIDE' });
  const { data: summary } = useBonsSummary({ validateurId: user.id });
  const { data: users } = useUsers();
  const { data: portefeuilles } = usePortefeuilles();

  // Budget de SA direction = portefeuilles de type DIRECTION rattachés à sa direction.
  const directionPortefeuilles = useMemo(
    () =>
      (portefeuilles ?? []).filter(
        (p) => p.proprietaireType === 'DIRECTION' && p.proprietaireId === user.directionId,
      ),
    [portefeuilles, user.directionId],
  );
  const budget = usePortefeuillesBudget(directionPortefeuilles.map((p) => p.id));

  const queue: Bon[] = useMemo(
    () =>
      (bons ?? [])
        .filter((b) => b.statut === 'CREE')
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [bons],
  );

  const queueExtension = useMemo(() => queue.filter((b) => b.demandeExtension), [queue]);
  const queueOver24h = useMemo(
    () => queue.filter((b) => Date.now() - new Date(b.createdAt).getTime() > 24 * 60 * 60 * 1000),
    [queue],
  );

  const validatedToday = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return (bons ?? []).filter(
      (b) => b.statut === 'VALIDE' && new Date(b.createdAt).getTime() >= today.getTime(),
    ).length;
  }, [bons]);

  const userById = new Map((users ?? []).map((u) => [u.id, u]));

  const ageing = summary?.pendingAgeing ?? { lt24h: 0, lt48h: 0, gt48h: 0 };
  const ageingTotal = ageing.lt24h + ageing.lt48h + ageing.gt48h || 1;

  return (
    <div className="flex flex-col gap-5">
      {/* Hero validateur */}
      <div className="relative overflow-hidden rounded-[16px] bg-gradient-to-br from-[#0A1628] via-[#0F4C81] to-[#1A6DB5] p-5 text-white">
        <div className="pointer-events-none absolute -right-16 -top-16 h-[200px] w-[200px] rounded-full bg-[radial-gradient(circle,rgba(0,200,150,0.25)_0%,transparent_70%)]" />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-white/10 backdrop-blur">
            <BadgeCheck className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="text-[11px] uppercase tracking-[1.5px] text-white/60">Centre de validation</div>
            <div className="font-display text-lg font-semibold">
              {user.prenom} {user.nom}
            </div>
            <div className="mt-0.5 text-xs text-white/70">
              Triez la file et arbitrez les demandes d'extension
            </div>
          </div>
          <Link
            to="/bons"
            search={{ statut: 'CREE' } as any}
            className="rounded-[9px] bg-[#00C896] px-4 py-2 text-xs font-semibold text-[#0A1628] hover:bg-white"
          >
            Voir la file →
          </Link>
        </div>
      </div>

      {/* KPIs avec sparklines */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={Clock}
          label="À valider"
          value={queue.length}
          sub={queueOver24h.length > 0 ? `${queueOver24h.length} > 24 h` : 'File à jour'}
          tone="amber"
          sparkValues={createdTimeline?.map((p) => p.count)}
          to="/bons?statut=CREE"
        />
        <Kpi
          icon={Flame}
          label="Demandes d'extension"
          value={queueExtension.length}
          sub={queueExtension.length > 0 ? 'Arbitrage prioritaire' : 'Aucune'}
          tone="red"
          to="/bons?extension=1"
        />
        <Kpi
          icon={BadgeCheck}
          label="Validés aujourd'hui"
          value={validatedToday}
          sub="Cycle court"
          tone="green"
          sparkValues={validatedTimeline?.map((p) => p.count)}
          to="/bons?statut=VALIDE&period=today"
        />
        <Kpi
          icon={TrendingUp}
          label="Délai moyen"
          value={
            summary?.avgValidationHours != null
              ? `${summary.avgValidationHours.toFixed(1)} h`
              : '—'
          }
          sub="Sur vos validations"
          tone="blue"
          sparkValues={timeline?.map((p) => p.count)}
        />
      </div>

      {/* Utilisation du budget de ma direction */}
      {user.directionId && (
        <div className="sm:max-w-md">
          <BudgetCard
            title="Budget de ma direction"
            summary={budget}
            hint={`${directionPortefeuilles.length} portefeuille${directionPortefeuilles.length > 1 ? 's' : ''} de direction`}
            to="/caisses"
          />
        </div>
      )}

      {/* Grille : file d'attente (gauche) + ageing & top demandeurs (droite) */}
      <div className="grid gap-3.5 lg:grid-cols-[1fr_340px]">
        {/* File d'attente */}
        <div className="overflow-hidden rounded-[14px] border border-[rgba(15,76,129,0.1)] bg-white">
          <div className="flex items-center gap-2.5 border-b border-[rgba(15,76,129,0.1)] px-5 py-4">
            <Clock className="h-4 w-4 text-[#F59E0B]" />
            <div className="font-display text-[13px] font-semibold">File d'attente (FIFO)</div>
            <span className="rounded-full bg-[#FFFBEB] px-2 py-0.5 text-[10px] font-semibold text-[#92400E]">
              {queue.length} bon{queue.length > 1 ? 's' : ''}
            </span>
            <Link
              to="/bons"
              search={{ statut: 'CREE' } as any}
              className="ml-auto flex items-center gap-1 text-xs font-medium text-[#1A6DB5] hover:underline"
            >
              Voir tout <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <table className="w-full text-xs">
            <thead className="bg-[#F8FAFC]">
              <tr className="text-left text-[10px] uppercase tracking-[0.8px] text-[#64748B]">
                <th className="px-5 py-2.5 font-semibold">Âge</th>
                <th className="px-5 py-2.5 font-semibold">Numéro</th>
                <th className="px-5 py-2.5 font-semibold">Demandeur</th>
                <th className="px-5 py-2.5 text-right font-semibold">Montant</th>
                <th className="px-5 py-2.5 font-semibold">Flags</th>
              </tr>
            </thead>
            <tbody>
              {queue.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-[#64748B]">
                    <div className="mb-2 text-2xl opacity-30">✅</div>
                    File à jour, rien à valider !
                  </td>
                </tr>
              )}
              {queue.slice(0, 10).map((bon) => {
                const ageMs = Date.now() - new Date(bon.createdAt).getTime();
                const isUrgent = ageMs > 24 * 60 * 60 * 1000;
                const u = userById.get(bon.demandeurId);
                return (
                  <tr
                    key={bon.id}
                    onClick={() => navigate({ to: '/bons/$bonId', params: { bonId: bon.id } })}
                    className={cn(
                      'cursor-pointer border-t border-[rgba(15,76,129,0.05)] transition-colors hover:bg-[#FAFBFF]',
                      isUrgent && 'bg-[#FEF3F2]/40',
                    )}
                  >
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums',
                          isUrgent ? 'bg-[#FEF3F2] text-[#B42318]' : 'bg-[#F1F5F9] text-[#475569]',
                        )}
                      >
                        {isUrgent && <Flame className="h-3 w-3" />}
                        {ageLabel(bon.createdAt)}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-medium text-[#1A6DB5]">{bon.numero}</td>
                    <td className="px-5 py-3 text-[#475569]">
                      {u ? `${u.prenom} ${u.nom}` : '—'}
                      {u && <div className="text-[10px] text-[#94A3B8]">#{u.matricule}</div>}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold">
                      {formatMontant(bon.montantTotal)}
                    </td>
                    <td className="px-5 py-3">
                      {bon.demandeExtension && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF3F2] px-2 py-0.5 text-[10px] font-medium text-[#B42318]">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          Extension
                        </span>
                      )}
                      {!bon.demandeExtension && <StatutBadge statut={bon.statut} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Panneau droit : âge + top demandeurs */}
        <div className="space-y-3.5">
          {/* Âge de la file */}
          <div className="overflow-hidden rounded-[14px] border border-[rgba(15,76,129,0.1)] bg-white">
            <div className="border-b border-[rgba(15,76,129,0.1)] px-5 py-4">
              <div className="font-display text-[13px] font-semibold">Âge de la file</div>
              <div className="mt-0.5 text-[10px] text-[#64748B]">Bons en attente, par tranche</div>
            </div>
            <div className="space-y-2.5 p-5">
              {[
                { label: '< 24 h', value: ageing.lt24h, color: '#10B981' },
                { label: '24 – 48 h', value: ageing.lt48h, color: '#F59E0B' },
                { label: '> 48 h', value: ageing.gt48h, color: '#EF4444' },
              ].map((r) => {
                const pct = Math.round((r.value / ageingTotal) * 100);
                return (
                  <div key={r.label}>
                    <div className="mb-1 flex items-baseline justify-between text-[11px]">
                      <span className="text-[#475569]">{r.label}</span>
                      <span className="tabular-nums font-semibold text-[#0F172A]">
                        {r.value} <span className="text-[#64748B]">({pct}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded bg-[#F1F5F9]">
                      <div
                        className="h-full rounded transition-all"
                        style={{ width: `${pct}%`, backgroundColor: r.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top demandeurs */}
          <div className="overflow-hidden rounded-[14px] border border-[rgba(15,76,129,0.1)] bg-white">
            <div className="flex items-center gap-2 border-b border-[rgba(15,76,129,0.1)] px-5 py-4">
              <Users className="h-4 w-4 text-[#1A6DB5]" />
              <div className="font-display text-[13px] font-semibold">Top demandeurs</div>
            </div>
            <div className="divide-y divide-[rgba(15,76,129,0.05)]">
              {(summary?.topDemandeurs ?? []).length === 0 && (
                <div className="px-5 py-6 text-center text-xs text-[#64748B]">
                  Pas encore de données
                </div>
              )}
              {(summary?.topDemandeurs ?? []).slice(0, 5).map((d) => {
                const u = userById.get(d.demandeurId);
                return (
                  <div key={d.demandeurId} className="flex items-center gap-2.5 px-5 py-2.5 text-xs">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#0F4C81] to-[#00C896] text-[10px] font-semibold text-white">
                      {u
                        ? `${u.prenom?.[0] ?? ''}${u.nom?.[0] ?? ''}`.toUpperCase()
                        : '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-[#0F172A]">
                        {u ? `${u.prenom} ${u.nom}` : `User #${d.demandeurId}`}
                      </div>
                      <div className="text-[10px] text-[#64748B]">{d.count} bons</div>
                    </div>
                    <div className="font-display text-[11px] font-semibold tabular-nums text-[#0F172A]">
                      {formatMontant(d.montant)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
