import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Briefcase,
  Flame,
  TrendingDown,
  Wallet,
} from 'lucide-react';
import { useBons, useBonsTimeline } from '@/api/bons';
import { usePortefeuilles, usePortefeuilleSolde } from '@/api/financierRef';
import { useUsers } from '@/api/users';
import { ageLabel, cn, formatMontant } from '@/lib/utils';
import type { Portefeuille, User } from '@/types/api';
import { Hero, Kpi, BudgetCard, usePortefeuillesBudget } from './_shared';

interface Props {
  user: User;
}

function PortefeuilleBurnCard({ portefeuille }: { portefeuille: Portefeuille }) {
  const { data: solde } = usePortefeuilleSolde(portefeuille.id);
  const soldeNum = Number(solde?.solde ?? 0);
  const initial = Number(portefeuille.soldeInitial ?? 0);
  const consumed = Math.max(0, initial - soldeNum);
  const burnPct = initial > 0 ? Math.min(100, Math.round((consumed / initial) * 100)) : 0;
  const alert = burnPct >= 80;

  return (
    <div
      className={cn(
        'rounded-[12px] border bg-white p-4 transition-colors',
        alert ? 'border-[#FECDCA]' : 'border-[rgba(15,76,129,0.1)]',
      )}
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.8px] text-[#64748B]">
            {portefeuille.code}
          </div>
          <div className="font-display text-[13px] font-semibold text-[#0F172A]">
            {portefeuille.libelle}
          </div>
        </div>
        {alert && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF3F2] px-2 py-0.5 text-[10px] font-semibold text-[#B42318]">
            <Flame className="h-2.5 w-2.5" />
            Burn élevé
          </span>
        )}
      </div>

      <div className="mb-1.5 flex items-baseline justify-between text-[11px]">
        <span className="text-[#64748B]">Solde courant</span>
        <span className="font-display text-[16px] font-semibold tabular-nums text-[#0F172A]">
          {formatMontant(soldeNum)}
        </span>
      </div>
      <div className="mb-2 flex items-baseline justify-between text-[10px]">
        <span className="text-[#94A3B8]">Initial : {formatMontant(initial)}</span>
        <span className="tabular-nums text-[#475569]">
          {burnPct}% consommé
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded bg-[#F1F5F9]">
        <div
          className={cn(
            'h-full rounded transition-all',
            alert
              ? 'bg-gradient-to-r from-[#F59E0B] to-[#EF4444]'
              : 'bg-gradient-to-r from-[#10B981] to-[#0F4C81]',
          )}
          style={{ width: `${burnPct}%` }}
        />
      </div>
    </div>
  );
}

export function GestionnaireDashboard({ user }: Props) {
  const { data: bons } = useBons();
  const { data: portefeuilles } = usePortefeuilles();
  const { data: users } = useUsers();
  const { data: timeline } = useBonsTimeline({ days: 14, statut: 'DECAISSE' });

  // Portefeuilles dont je suis gestionnaire
  const myPortefeuilles = useMemo(
    () => (portefeuilles ?? []).filter((p) => p.gestionnaireId === user.id),
    [portefeuilles, user.id],
  );
  // Demandes d'extension à arbitrer (bons CREE avec extension, dont la chaîne pointe vers mes portefeuilles)
  // On ne peut pas joindre les sous-bons côté front (pas d'endpoint d'agrégation), on filtre tous les bons avec extension.
  const extensionsToArbitrate = useMemo(
    () =>
      (bons ?? [])
        .filter((b) => b.demandeExtension && b.statut === 'CREE')
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [bons],
  );

  const inFlight = useMemo(
    () => (bons ?? []).filter((b) => b.statut === 'CREE' || b.statut === 'VALIDE'),
    [bons],
  );

  const userById = new Map((users ?? []).map((u) => [u.id, u]));

  // Top demandeurs sur les bons en cours
  const topDemandeurs = useMemo(() => {
    const map = new Map<string, { count: number; montant: number }>();
    for (const b of inFlight) {
      const cur = map.get(b.demandeurId) ?? { count: 0, montant: 0 };
      cur.count += 1;
      cur.montant += Number(b.montantTotal || 0);
      map.set(b.demandeurId, cur);
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.montant - a.montant)
      .slice(0, 5);
  }, [inFlight]);

  // Burn moyen (somme des % consommés / nb portefeuilles) — affiché en %
  const initialTotal = myPortefeuilles.reduce((acc, p) => acc + Number(p.soldeInitial ?? 0), 0);
  const budget = usePortefeuillesBudget(myPortefeuilles.map((p) => p.id));

  return (
    <div className="flex flex-col gap-5">
      <Hero
        icon={Briefcase}
        eyebrow="Gestionnaire de portefeuille"
        title={`${user.prenom} ${user.nom}`}
        subtitle={`Pilotage de ${myPortefeuilles.length} portefeuille${myPortefeuilles.length > 1 ? 's' : ''}`}
        gradient="from-[#0E7490] via-[#0891B2] to-[#0F4C81]"
        action={
          <Link
            to="/caisses"
            className="rounded-[9px] bg-white px-4 py-2 text-xs font-semibold text-[#0A1628] hover:bg-white/90"
          >
            Voir mes portefeuilles →
          </Link>
        }
      />

      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={Wallet}
          label="Portefeuilles pilotés"
          value={myPortefeuilles.length}
          sub={initialTotal > 0 ? `Total alloué ${formatMontant(initialTotal)}` : 'Aucun budget initial'}
          tone="teal"
          to="/caisses"
        />
        <Kpi
          icon={AlertTriangle}
          label="Demandes d'extension"
          value={extensionsToArbitrate.length}
          sub={extensionsToArbitrate.length > 0 ? 'Arbitrage requis' : 'Aucune en attente'}
          tone="red"
          to="/bons"
          searchObj={{ extension: '1' }}
        />
        <Kpi
          icon={Banknote}
          label="Bons en cours"
          value={inFlight.length}
          sub="Sur mes enveloppes"
          tone="blue"
          to="/bons"
          searchObj={{ statut: 'CREE' }}
        />
        <Kpi
          icon={TrendingDown}
          label="Décaissements 7 j"
          value={
            timeline
              ? formatMontant(timeline.slice(-7).reduce((a, p) => a + Number(p.montant || 0), 0))
              : '—'
          }
          sub="Total période"
          tone="green"
          sparkValues={timeline?.slice(-7).map((p) => Number(p.montant || 0))}
        />
      </div>

      {/* Portefeuilles avec burn rate */}
      <div>
        <div className="mb-3 flex items-baseline gap-2">
          <h2 className="font-display text-sm font-semibold text-[#0F172A]">Mes portefeuilles</h2>
          <span className="text-[11px] text-[#64748B]">Taux de consommation</span>
        </div>
        {myPortefeuilles.length > 0 && (
          <div className="mb-3.5 sm:max-w-md">
            <BudgetCard
              title="Utilisation totale du budget"
              summary={budget}
              hint={`${myPortefeuilles.length} portefeuille${myPortefeuilles.length > 1 ? 's' : ''} pilotés`}
            />
          </div>
        )}
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {myPortefeuilles.length === 0 && (
            <div className="col-span-full rounded-[14px] border border-dashed border-[rgba(15,76,129,0.2)] bg-white py-10 text-center text-sm text-[#64748B]">
              Aucun portefeuille ne vous est confié comme gestionnaire.
              <div className="mt-2 text-[11px]">
                Demandez à un administrateur de vous assigner via le champ « gestionnaire ».
              </div>
            </div>
          )}
          {myPortefeuilles.map((p) => (
            <PortefeuilleBurnCard key={p.id} portefeuille={p} />
          ))}
        </div>
      </div>

      {/* Extensions à arbitrer + top demandeurs */}
      <div className="grid gap-3.5 lg:grid-cols-[1fr_320px]">
        {/* Extensions */}
        <div className="overflow-hidden rounded-[14px] border border-[rgba(15,76,129,0.1)] bg-white">
          <div className="flex items-center gap-2.5 border-b border-[rgba(15,76,129,0.1)] px-5 py-4">
            <Flame className="h-4 w-4 text-[#B42318]" />
            <div className="font-display text-[13px] font-semibold">Demandes d'extension à arbitrer</div>
            <span className="rounded-full bg-[#FEF3F2] px-2 py-0.5 text-[10px] font-semibold text-[#B42318]">
              {extensionsToArbitrate.length}
            </span>
            <Link
              to="/bons"
              search={{ extension: '1' } as any}
              className="ml-auto flex items-center gap-1 text-xs font-medium text-[#1A6DB5] hover:underline"
            >
              Voir tout <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="divide-y divide-[rgba(15,76,129,0.05)]">
            {extensionsToArbitrate.length === 0 && (
              <div className="px-5 py-10 text-center text-xs text-[#64748B]">
                <div className="mb-2 text-2xl opacity-30">✅</div>
                Aucune demande d'extension en attente
              </div>
            )}
            {extensionsToArbitrate.slice(0, 8).map((bon) => {
              const u = userById.get(bon.demandeurId);
              return (
                <Link
                  key={bon.id}
                  to="/bons/$bonId"
                  params={{ bonId: bon.id }}
                  className="flex items-start gap-3 px-5 py-3 hover:bg-[#FAFBFF]"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#FEF3F2] text-[#B42318]">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-[#1A6DB5]">{bon.numero}</span>
                      <span className="font-display text-[13px] font-semibold tabular-nums text-[#0F172A]">
                        {formatMontant(bon.montantTotal)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-[#475569]">
                        {u ? `${u.prenom} ${u.nom}` : '—'}
                      </span>
                      <span className="text-[#94A3B8]">{ageLabel(bon.createdAt)}</span>
                    </div>
                    {bon.descriptionExtension && (
                      <div className="mt-1 truncate text-[11px] italic text-[#7F1D1D]">
                        « {bon.descriptionExtension} »
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Top demandeurs */}
        <div className="overflow-hidden rounded-[14px] border border-[rgba(15,76,129,0.1)] bg-white">
          <div className="border-b border-[rgba(15,76,129,0.1)] px-5 py-4">
            <div className="font-display text-[13px] font-semibold">Top demandeurs en cours</div>
            <div className="mt-0.5 text-[10px] text-[#64748B]">
              Sur les bons CREE / VALIDE
            </div>
          </div>
          <div className="divide-y divide-[rgba(15,76,129,0.05)]">
            {topDemandeurs.length === 0 && (
              <div className="px-5 py-6 text-center text-xs text-[#64748B]">
                Pas encore de données
              </div>
            )}
            {topDemandeurs.map((d) => {
              const u = userById.get(d.id);
              return (
                <div key={d.id} className="flex items-center gap-2.5 px-5 py-2.5 text-xs">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#0891B2] to-[#0F4C81] text-[10px] font-semibold text-white">
                    {u
                      ? `${u.prenom?.[0] ?? ''}${u.nom?.[0] ?? ''}`.toUpperCase()
                      : '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-[#0F172A]">
                      {u ? `${u.prenom} ${u.nom}` : `User #${d.id}`}
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
  );
}
