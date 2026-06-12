import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Banknote,
  Building2,
  Clock,
  FileCheck2,
  Files,
  Network,
  ShieldCheck,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { useBons, useBonsByDirection, useBonsSummary, useBonsTimeline } from '@/api/bons';
import { useCaisses } from '@/api/caisses';
import { useUsers } from '@/api/users';
import { ageLabel, cn, formatMontant } from '@/lib/utils';
import type { Bon, User } from '@/types/api';
import { Hero, Kpi } from './_shared';

interface Props {
  user: User;
  isSuper?: boolean;
  /** Masque l'en-tête Hero (utile quand le dashboard est intégré dans une vue combinée, ex. DAF). */
  showHero?: boolean;
}

/**
 * Vue Administrateur : KPIs globaux + bar chart par direction + anomalies.
 * Réutilisée par SuperAdmin (qui hérite + ajoute la santé système).
 */
export function AdminDashboard({ user, isSuper = false, showHero = true }: Props) {
  const { data: bons } = useBons();
  const { data: caisses } = useCaisses();
  const { data: users } = useUsers();
  const { data: timelineCreated } = useBonsTimeline({ days: 14 });
  const { data: timelineDecaisse } = useBonsTimeline({ days: 14, statut: 'DECAISSE' });
  const { data: timelineValide } = useBonsTimeline({ days: 14, statut: 'VALIDE' });
  const { data: summary } = useBonsSummary({});

  const allBons = bons ?? [];

  // Période courante (mois en cours)
  const thisMonthStart = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const monthBons = useMemo(
    () => allBons.filter((b) => new Date(b.createdAt).getTime() >= thisMonthStart),
    [allBons, thisMonthStart],
  );
  const monthDecaisseSum = useMemo(
    () =>
      monthBons
        .filter((b) => b.statut === 'DECAISSE' || b.statut === 'COMPTABILISE')
        .reduce((acc, b) => acc + Number(b.montantTotal || 0), 0),
    [monthBons],
  );

  // Taux d'approbation : VALIDE+DECAISSE / (CREE traités = VALIDE+DECAISSE+REFUSE)
  const tauxApprobation = useMemo(() => {
    const valides = (summary?.byStatut?.VALIDE?.count ?? 0) + (summary?.byStatut?.DECAISSE?.count ?? 0);
    const refuses = summary?.byStatut?.REFUSE?.count ?? 0;
    const total = valides + refuses;
    if (total === 0) return null;
    return Math.round((valides / total) * 100);
  }, [summary]);

  // Bar chart : montant décaissé du mois par direction.
  // L'agrégation est faite en BD via /bons/stats/by-direction (jointure
  // sous_bon → cost_center → direction). C'est la direction du cost-center
  // qui détermine l'imputation budgétaire, pas celle du demandeur.
  const { data: byDirectionRaw } = useBonsByDirection({ period: 'month' });
  const byDirection = useMemo(() => {
    return (byDirectionRaw ?? []).map((r) => ({
      directionId: r.directionId ?? 'NONE',
      libelle: r.directionLibelle || 'Non imputé',
      montant: r.montant,
      bons: r.nbBons,
    }));
  }, [byDirectionRaw]);

  const maxDirectionMontant = Math.max(1, ...byDirection.map((d) => d.montant));

  // Anomalies
  const stuckBons: Bon[] = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return allBons.filter(
      (b) => (b.statut === 'CREE' || b.statut === 'VALIDE') && new Date(b.createdAt).getTime() < sevenDaysAgo,
    );
  }, [allBons]);

  const extensionsEnAttente = summary?.extensionEnAttente ?? 0;
  const totalCaisses = caisses?.length ?? 0;
  const openCaisses = caisses?.filter((c) => c.statut === 'OUVERTE').length ?? 0;
  const refuses = summary?.byStatut?.REFUSE?.count ?? 0;

  // Délai moyen Créé → Décaissé
  const avgCycleDays = useMemo(() => {
    const done = allBons.filter((b) => b.statut === 'DECAISSE' || b.statut === 'COMPTABILISE');
    if (done.length === 0) return null;
    // Approximation : on n'a pas la date de décaissement sur l'entité Bon (présente sur sous-bon),
    // donc on prend l'âge moyen entre createdAt et "maintenant" pour les bons traités.
    const sum = done.reduce(
      (acc, b) => acc + (Date.now() - new Date(b.createdAt).getTime()) / (1000 * 60 * 60 * 24),
      0,
    );
    return sum / done.length;
  }, [allBons]);

  return (
    <div className="flex flex-col gap-5">
      {showHero && (
        <Hero
          icon={ShieldCheck}
          eyebrow={isSuper ? 'Vue super administrateur' : 'Vue administrateur'}
          title={`${user.prenom} ${user.nom}`}
          subtitle={
            isSuper
              ? 'Santé du système, intégrité et pilotage organisationnel'
              : "Pilotage global de l'activité bons et caisses"
          }
          gradient={
            isSuper
              ? 'from-[#3B0764] via-[#5B21B6] to-[#0F4C81]'
              : 'from-[#0A1628] via-[#0F4C81] to-[#1A6DB5]'
          }
        />
      )}

      {/* KPIs globaux */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={Banknote}
          label="Décaissé ce mois"
          value={formatMontant(monthDecaisseSum)}
          sub={`${monthBons.length} bons sur le mois`}
          tone="green"
          sparkValues={timelineDecaisse?.map((p) => Number(p.montant || 0))}
          to="/bons"
          searchObj={{ statut: 'DECAISSE' }}
        />
        <Kpi
          icon={BadgeCheck}
          label="Taux d'approbation"
          value={tauxApprobation != null ? `${tauxApprobation}%` : '—'}
          sub={refuses > 0 ? `${refuses} refus` : 'Aucun refus'}
          tone="blue"
          sparkValues={timelineValide?.map((p) => p.count)}
        />
        <Kpi
          icon={Clock}
          label="Délai moyen"
          value={avgCycleDays != null ? `${avgCycleDays.toFixed(1)} j` : '—'}
          sub="Validé → décaissé"
          tone="amber"
          sparkValues={timelineCreated?.map((p) => p.count)}
        />
        <Kpi
          icon={XCircle}
          label="Bons rejetés"
          value={refuses}
          sub="Période complète"
          tone="red"
          to="/bons"
          searchObj={{ statut: 'REFUSE' }}
        />
      </div>

      {/* Bar chart par direction + anomalies */}
      <div className="grid gap-3.5 lg:grid-cols-[1fr_340px]">
        {/* Bar chart par direction */}
        <div className="overflow-hidden rounded-[14px] border border-[rgba(15,76,129,0.1)] bg-white">
          <div className="flex items-center gap-2.5 border-b border-[rgba(15,76,129,0.1)] px-5 py-4">
            <Network className="h-4 w-4 text-[#1A6DB5]" />
            <div className="font-display text-[13px] font-semibold">Décaissements par direction</div>
            <span className="rounded-full bg-[#E8F2FF] px-2 py-0.5 text-[10px] font-semibold text-[#1A6DB5]">
              ce mois
            </span>
            <Link
              to="/directions"
              className="ml-auto flex items-center gap-1 text-xs font-medium text-[#1A6DB5] hover:underline"
            >
              Directions <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2.5 p-5">
            {byDirection.length === 0 && (
              <div className="py-6 text-center text-xs text-[#64748B]">
                Aucun décaissement ce mois
              </div>
            )}
            {byDirection.map((d) => {
              const pct = Math.round((d.montant / maxDirectionMontant) * 100);
              return (
                <div key={d.directionId} className="rounded-[10px] px-3 py-2 hover:bg-[#F8FAFC]">
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <span className="text-xs font-medium text-[#0F172A]">{d.libelle}</span>
                    <span className="text-[11px] tabular-nums text-[#475569]">
                      {d.bons} bon{d.bons > 1 ? 's' : ''} •{' '}
                      <span className="font-semibold text-[#0F172A]">{formatMontant(d.montant)}</span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded bg-[#F1F5F9]">
                    <div
                      className="h-full rounded bg-gradient-to-r from-[#0F4C81] to-[#1A6DB5]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Anomalies */}
        <div className="space-y-3.5">
          <div className="overflow-hidden rounded-[14px] border border-[rgba(15,76,129,0.1)] bg-white">
            <div className="flex items-center gap-2 border-b border-[rgba(15,76,129,0.1)] px-5 py-4">
              <AlertCircle className="h-4 w-4 text-[#F59E0B]" />
              <div className="font-display text-[13px] font-semibold">Anomalies</div>
            </div>
            <div className="divide-y divide-[rgba(15,76,129,0.05)]">
              {extensionsEnAttente > 0 && (
                <Link
                  to="/bons"
                  search={{ extension: '1' } as any}
                  className="flex items-start gap-2.5 px-5 py-3 hover:bg-[#FAFBFF]"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#FEF3F2] text-[#B42318]">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-[#0F172A]">
                      {extensionsEnAttente} demande{extensionsEnAttente > 1 ? 's' : ''} d'extension
                    </div>
                    <div className="text-[10px] text-[#64748B]">À arbitrer</div>
                  </div>
                </Link>
              )}
              {stuckBons.length > 0 && (
                <div className="px-5 py-3">
                  <div className="mb-1 flex items-center gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#FFFBEB] text-[#92400E]">
                      <Clock className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-[#0F172A]">
                        {stuckBons.length} bon{stuckBons.length > 1 ? 's' : ''} bloqué{stuckBons.length > 1 ? 's' : ''} &gt; 7 j
                      </div>
                      <div className="text-[10px] text-[#64748B]">Sans avancement</div>
                    </div>
                  </div>
                  <div className="mt-2 space-y-1">
                    {stuckBons.slice(0, 3).map((b) => (
                      <Link
                        key={b.id}
                        to="/bons/$bonId"
                        params={{ bonId: b.id }}
                        className="flex items-center justify-between rounded-[8px] bg-[#FFFBEB] px-2 py-1 text-[10px] text-[#92400E] hover:bg-[#FDE68A]"
                      >
                        <span className="font-medium">{b.numero}</span>
                        <span>{ageLabel(b.createdAt)}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {totalCaisses > 0 && openCaisses === 0 && (
                <Link
                  to="/caisses"
                  className="flex items-start gap-2.5 px-5 py-3 hover:bg-[#FAFBFF]"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#FFFBEB] text-[#92400E]">
                    <AlertCircle className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-[#0F172A]">
                      Aucune caisse ouverte
                    </div>
                    <div className="text-[10px] text-[#64748B]">Action requise</div>
                  </div>
                </Link>
              )}
              {extensionsEnAttente === 0 && stuckBons.length === 0 && openCaisses > 0 && (
                <div className="px-5 py-6 text-center text-xs text-[#64748B]">
                  <div className="mb-1 text-2xl opacity-30">✅</div>
                  Aucune anomalie détectée
                </div>
              )}
            </div>
          </div>

          {/* Mini cartouches : état réseau */}
          <div className="grid grid-cols-2 gap-2">
            <Link
              to="/caisses"
              className="rounded-[12px] border border-[rgba(15,76,129,0.1)] bg-white p-3 hover:bg-[#FAFBFF]"
            >
              <div className="mb-1 flex items-center gap-1.5">
                <Files className="h-3.5 w-3.5 text-[#1A6DB5]" />
                <span className="text-[10px] uppercase tracking-[0.6px] text-[#64748B]">Caisses</span>
              </div>
              <div className="font-display text-[16px] font-semibold tabular-nums text-[#0F172A]">
                {openCaisses}
                <span className="text-[11px] font-normal text-[#64748B]"> / {totalCaisses}</span>
              </div>
              <div className="text-[10px] text-[#94A3B8]">ouvertes</div>
            </Link>
            <Link
              to="/users"
              className="rounded-[12px] border border-[rgba(15,76,129,0.1)] bg-white p-3 hover:bg-[#FAFBFF]"
            >
              <div className="mb-1 flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-[#10B981]" />
                <span className="text-[10px] uppercase tracking-[0.6px] text-[#64748B]">Utilisateurs</span>
              </div>
              <div className="font-display text-[16px] font-semibold tabular-nums text-[#0F172A]">
                {(users ?? []).filter((u) => u.estActif).length}
                <span className="text-[11px] font-normal text-[#64748B]"> / {(users ?? []).length}</span>
              </div>
              <div className="text-[10px] text-[#94A3B8]">actifs</div>
            </Link>
          </div>
        </div>
      </div>

      {/* Distribution par statut (utile pour admin) */}
      <div className="overflow-hidden rounded-[14px] border border-[rgba(15,76,129,0.1)] bg-white">
        <div className="flex items-center gap-2 border-b border-[rgba(15,76,129,0.1)] px-5 py-4">
          <FileCheck2 className="h-4 w-4 text-[#1A6DB5]" />
          <div className="font-display text-[13px] font-semibold">Pipeline des bons</div>
          <span className="rounded-full bg-[#E8F2FF] px-2 py-0.5 text-[10px] font-semibold text-[#1A6DB5]">
            Tous statuts confondus
          </span>
        </div>
        <div className="grid grid-cols-2 gap-px bg-[rgba(15,76,129,0.08)] p-px sm:grid-cols-6">
          {(['CREE', 'VALIDE', 'DECAISSE', 'COMPTABILISE', 'REFUSE', 'ANNULE'] as const).map((statut) => {
            const row = summary?.byStatut?.[statut];
            return (
              <Link
                key={statut}
                to="/bons"
                search={{ statut } as any}
                className={cn(
                  'flex flex-col gap-1 bg-white p-4 transition-colors hover:bg-[#FAFBFF]',
                )}
              >
                <span className="text-[10px] uppercase tracking-[0.6px] text-[#64748B]">{statut}</span>
                <span className="font-display text-xl font-semibold tabular-nums text-[#0F172A]">
                  {row?.count ?? 0}
                </span>
                <span className="text-[10px] tabular-nums text-[#94A3B8]">
                  {row ? formatMontant(row.montant) : '—'}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
