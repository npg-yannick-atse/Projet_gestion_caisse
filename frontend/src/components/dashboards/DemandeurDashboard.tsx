import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  CheckCircle2,
  Clock,
  Files,
  Plus,
  User as UserIcon,
  Wallet,
  XCircle,
} from 'lucide-react';
import { useBons, useBonsTimeline } from '@/api/bons';
import { usePortefeuilles, usePortefeuilleSolde } from '@/api/financierRef';
import { cn, formatMontant, timeAgo } from '@/lib/utils';
import type { Bon, BonStatut, User } from '@/types/api';
import { Hero, Kpi, BudgetCard, usePortefeuillesBudget } from './_shared';

interface Props {
  user: User;
}

const LIFE_STEPS: { key: BonStatut; label: string }[] = [
  { key: 'CREE', label: 'Créé' },
  { key: 'VALIDE', label: 'Validé' },
  { key: 'DECAISSE', label: 'Décaissé' },
];

function stepIndex(statut: BonStatut): number {
  if (statut === 'CREE') return 0;
  if (statut === 'VALIDE') return 1;
  if (statut === 'DECAISSE' || statut === 'COMPTABILISE') return 2;
  return -1; // REFUSE/ANNULE
}

function BonLifecycleRow({ bon }: { bon: Bon }) {
  const idx = stepIndex(bon.statut);
  const rejected = bon.statut === 'REFUSE' || bon.statut === 'ANNULE';

  return (
    <Link
      to="/bons/$bonId"
      params={{ bonId: bon.id }}
      className="block rounded-[12px] border border-[rgba(15,76,129,0.08)] bg-white p-4 transition hover:border-[#1A6DB5] hover:shadow-[0_4px_12px_rgba(15,76,129,0.08)]"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12px] font-semibold text-[#1A6DB5]">{bon.numero}</span>
          {bon.demandeExtension && (
            <span className="rounded-full bg-[#FEF3F2] px-2 py-0.5 text-[9px] font-semibold text-[#B42318]">
              Extension demandée
            </span>
          )}
        </div>
        <div className="text-right">
          <div className="font-display text-[14px] font-semibold tabular-nums text-[#0F172A]">
            {formatMontant(bon.montantTotal)}
          </div>
          <div className="text-[10px] text-[#64748B]">{timeAgo(bon.createdAt)}</div>
        </div>
      </div>

      {rejected ? (
        <div className="rounded-[8px] bg-[#FEF3F2] px-3 py-2 text-[11px] font-medium text-[#B42318]">
          {bon.statut === 'REFUSE' ? '✗ Refusé par le validateur' : '✗ Annulé'}
        </div>
      ) : (
        <div className="flex items-center gap-1">
          {LIFE_STEPS.map((step, i) => {
            const reached = i <= idx;
            const isCurrent = i === idx;
            return (
              <div key={step.key} className="flex flex-1 items-center gap-1">
                <div className="flex flex-1 flex-col items-center gap-1.5">
                  <div
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold transition-colors',
                      reached
                        ? isCurrent
                          ? 'bg-[#0F4C81] text-white ring-4 ring-[#0F4C81]/15'
                          : 'bg-[#10B981] text-white'
                        : 'bg-[#F1F5F9] text-[#94A3B8]',
                    )}
                  >
                    {reached && !isCurrent ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  <span
                    className={cn(
                      'text-[10px] font-medium',
                      reached ? 'text-[#0F172A]' : 'text-[#94A3B8]',
                    )}
                  >
                    {step.label}
                  </span>
                </div>
                {i < LIFE_STEPS.length - 1 && (
                  <div
                    className={cn(
                      'h-0.5 flex-1 rounded',
                      i < idx ? 'bg-[#10B981]' : 'bg-[#F1F5F9]',
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </Link>
  );
}

function BudgetGauge({ portefeuilleId, label }: { portefeuilleId: string; label: string }) {
  const { data } = usePortefeuilleSolde(portefeuilleId);
  const dispo = Number(data?.solde ?? 0);
  const alloue = Number(data?.soldeInitial ?? 0);
  const consomme = Math.max(0, alloue - dispo);
  const pct = alloue > 0 ? Math.min(100, (consomme / alloue) * 100) : 0;
  const hasBudget = alloue > 0;

  // Couleur selon le taux de consommation (vert → ambre → rouge).
  const bar =
    pct >= 90
      ? { from: '#EF4444', to: '#B42318' }
      : pct >= 70
        ? { from: '#F59E0B', to: '#D97706' }
        : { from: '#10B981', to: '#047857' };

  return (
    <div className="rounded-[12px] border border-[rgba(15,76,129,0.08)] bg-white p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[11px] uppercase tracking-[0.8px] text-[#64748B]">{label}</span>
        {hasBudget ? (
          <span className="font-display text-[14px] font-semibold tabular-nums text-[#0F172A]">
            {Math.round(pct)} %
          </span>
        ) : (
          <span className="font-display text-[14px] font-semibold tabular-nums text-[#0F172A]">
            {formatMontant(dispo)}
          </span>
        )}
      </div>
      {hasBudget ? (
        <>
          <div className="h-2 overflow-hidden rounded-full bg-[#F1F5F9]">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(3, pct)}%`, background: `linear-gradient(to right, ${bar.from}, ${bar.to})` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-[#94A3B8]">
            <span>Consommé {formatMontant(consomme)}</span>
            <span>Dispo. {formatMontant(dispo)}</span>
          </div>
        </>
      ) : (
        <div className="text-[10px] text-[#94A3B8]">Aucun budget alloué · solde disponible</div>
      )}
    </div>
  );
}

export function DemandeurDashboard({ user }: Props) {
  const { data: bons } = useBons();
  const { data: portefeuilles } = usePortefeuilles();
  const { data: myTimeline } = useBonsTimeline({ days: 14, demandeurId: user.id });

  const myBons = useMemo(() => (bons ?? []).filter((b) => b.demandeurId === user.id), [bons, user.id]);

  const countBy = (s: BonStatut) => myBons.filter((b) => b.statut === s).length;
  const countByList = (list: BonStatut[]) => myBons.filter((b) => list.includes(b.statut)).length;

  const myRecent = useMemo(
    () => [...myBons].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5),
    [myBons],
  );

  const myPortefeuilles = useMemo(() => {
    if (!portefeuilles) return [];
    return portefeuilles.filter(
      (p) =>
        (p.proprietaireType === 'USER' && p.proprietaireId === user.id) ||
        (p.proprietaireType === 'DIRECTION' && p.proprietaireId === user.directionId),
    );
  }, [portefeuilles, user]);

  const recurrents = useMemo(() => myBons.filter((b) => b.estRecurrent).slice(0, 3), [myBons]);

  const budget = usePortefeuillesBudget(myPortefeuilles.map((p) => p.id));

  return (
    <div className="flex flex-col gap-5">
      <Hero
        icon={UserIcon}
        eyebrow="Mes demandes"
        title={`${user.prenom} ${user.nom}`}
        subtitle="Suivi du cycle de vie de mes bons et de mon budget"
        gradient="from-[#0A1628] via-[#475569] to-[#1A6DB5]"
        action={
          <Link
            to="/bons/nouveau"
            className="inline-flex items-center gap-1.5 rounded-[9px] bg-[#00C896] px-4 py-2 text-xs font-semibold text-[#0A1628] hover:bg-white"
          >
            <Plus className="h-3.5 w-3.5" /> Nouveau bon
          </Link>
        }
      />

      {/* KPIs */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi
          icon={Files}
          label="Mes bons"
          value={myBons.length}
          sub="Total émis"
          tone="blue"
          sparkValues={myTimeline?.map((p) => p.count)}
          to="/bons"
        />
        <Kpi
          icon={Clock}
          label="En attente"
          value={countBy('CREE')}
          sub="À valider"
          tone="amber"
          to="/bons"
          searchObj={{ statut: 'CREE' }}
        />
        <Kpi
          icon={BadgeCheck}
          label="Validés"
          value={countBy('VALIDE')}
          sub="Prêts à décaisser"
          tone="green"
          to="/bons"
          searchObj={{ statut: 'VALIDE' }}
        />
        <Kpi
          icon={Banknote}
          label="Décaissés"
          value={countByList(['DECAISSE', 'COMPTABILISE'])}
          sub="Paiements effectués"
          tone="gray"
          to="/bons"
          searchObj={{ statut: 'DECAISSE' }}
        />
        <Kpi
          icon={XCircle}
          label="Bons rejetés"
          value={countBy('REFUSE')}
          sub="Refusés au total"
          tone="red"
          to="/bons"
          searchObj={{ statut: 'REFUSE' }}
        />
      </div>

      {/* Cycle de vie + budget */}
      <div className="grid gap-3.5 lg:grid-cols-[1fr_320px]">
        {/* Lifecycle */}
        <div className="overflow-hidden rounded-[14px] border border-[rgba(15,76,129,0.1)] bg-white">
          <div className="flex items-center gap-2.5 border-b border-[rgba(15,76,129,0.1)] px-5 py-4">
            <div className="font-display text-[13px] font-semibold">Cycle de vie de mes derniers bons</div>
            <span className="rounded-full bg-[#E8F2FF] px-2 py-0.5 text-[10px] font-semibold text-[#1A6DB5]">
              {myRecent.length}
            </span>
            <Link
              to="/bons"
              className="ml-auto flex items-center gap-1 text-xs font-medium text-[#1A6DB5] hover:underline"
            >
              Voir tout <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2.5 p-5">
            {myRecent.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-8 text-center text-xs text-[#64748B]">
                <div className="text-2xl opacity-30">📋</div>
                Vous n'avez pas encore de bon.
                <Link
                  to="/bons/nouveau"
                  className="mt-2 rounded-[8px] bg-[#0F4C81] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[#1A6DB5]"
                >
                  Créer mon premier bon
                </Link>
              </div>
            )}
            {myRecent.map((bon) => (
              <BonLifecycleRow key={bon.id} bon={bon} />
            ))}
          </div>
        </div>

        {/* Panneau droit : budget + récurrents */}
        <div className="space-y-3.5">
          {/* Utilisation globale du budget */}
          <BudgetCard
            title="Utilisation de mon budget"
            summary={budget}
            hint={`${myPortefeuilles.length} portefeuille${myPortefeuilles.length > 1 ? 's' : ''}`}
          />

          {/* Budget gauges */}
          <div className="overflow-hidden rounded-[14px] border border-[rgba(15,76,129,0.1)] bg-white">
            <div className="flex items-center gap-2 border-b border-[rgba(15,76,129,0.1)] px-5 py-4">
              <Wallet className="h-4 w-4 text-[#1A6DB5]" />
              <div className="font-display text-[13px] font-semibold">Mes portefeuilles</div>
            </div>
            <div className="space-y-2.5 p-4">
              {myPortefeuilles.length === 0 && (
                <div className="py-4 text-center text-[11px] text-[#64748B]">
                  Aucun portefeuille rattaché
                </div>
              )}
              {myPortefeuilles.map((p) => (
                <BudgetGauge key={p.id} portefeuilleId={p.id} label={`${p.code} — ${p.libelle}`} />
              ))}
            </div>
          </div>

          {/* Bons récurrents */}
          {recurrents.length > 0 && (
            <div className="overflow-hidden rounded-[14px] border border-[rgba(15,76,129,0.1)] bg-white">
              <div className="border-b border-[rgba(15,76,129,0.1)] px-5 py-4">
                <div className="font-display text-[13px] font-semibold">Mes bons récurrents</div>
                <div className="mt-0.5 text-[10px] text-[#64748B]">
                  À régénérer à chaque période
                </div>
              </div>
              <div className="divide-y divide-[rgba(15,76,129,0.05)]">
                {recurrents.map((bon) => (
                  <Link
                    key={bon.id}
                    to="/bons/$bonId"
                    params={{ bonId: bon.id }}
                    className="flex items-center justify-between px-5 py-2.5 text-xs hover:bg-[#FAFBFF]"
                  >
                    <div>
                      <div className="font-medium text-[#1A6DB5]">{bon.numero}</div>
                      <div className="text-[10px] text-[#64748B]">
                        {bon.frequenceRecurrence ?? '—'}
                      </div>
                    </div>
                    <div className="font-display tabular-nums text-[#0F172A]">
                      {formatMontant(bon.montantTotal)}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
