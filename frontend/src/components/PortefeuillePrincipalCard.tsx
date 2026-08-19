import { Wallet } from 'lucide-react';
import { usePortefeuilles, usePortefeuilleSolde } from '@/api/financierRef';
import { formatMontant } from '@/lib/utils';
import type { Portefeuille } from '@/types/api';

/**
 * Le portefeuille principal d'une caisse, affiché EN AMONT d'elle.
 *
 * La place à l'écran dit le sens de l'argent : principal → caisse →
 * portefeuilles. Le montrer après la caisse, ou mêlé aux autres portefeuilles,
 * laisserait croire qu'il en reçoit alors qu'il l'alimente.
 */
function Carte({ pf, deviseCode }: { pf: Portefeuille; deviseCode: string }) {
  const { data } = usePortefeuilleSolde(pf.id);
  return (
    <div className="relative overflow-hidden rounded-[13px] bg-gradient-to-br from-[#7C3AED] to-[#4C1D95] p-[18px] text-white">
      <div className="absolute -right-5 -top-5 h-20 w-20 rounded-full bg-white/[0.06]" />
      <Wallet className="absolute bottom-4 right-4 h-7 w-7 text-white/15" />
      <div className="relative">
        <div className="mb-1 inline-flex rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-semibold">
          Réserve
        </div>
        <div className="truncate text-[10px] font-semibold uppercase tracking-[0.7px] text-white/60">
          {pf.libelle}
        </div>
        <div className="font-display text-[22px] font-bold leading-none">
          {data ? formatMontant(data.solde) : '…'}
        </div>
        <div className="mt-1 text-[11px] text-white/50">
          {deviseCode} · {pf.code} · alimente la caisse
        </div>
      </div>
    </div>
  );
}

export function PortefeuillePrincipalCard({
  caisseId,
  deviseCode,
}: {
  caisseId: string;
  deviseCode: string;
}) {
  const { data: portefeuilles } = usePortefeuilles(caisseId);
  // Partage d'une liste DÉJÀ chargée entre deux emplacements de l'écran, non un
  // filtre de données : la même requête sert la carte et la section voisine.
  const principal = (portefeuilles ?? []).find((p) => p.estPrincipal);

  if (!principal) {
    // L'absence se dit : sans ce cadre, on ne distingue pas « pas de réserve »
    // de « la réserve ne s'affiche pas ici ».
    return (
      <div className="flex h-full min-h-[104px] flex-col justify-center rounded-[13px] border border-dashed border-[rgba(15,76,129,0.2)] p-[18px] text-center">
        <div className="text-[11px] font-semibold text-[#64748B]">Aucune réserve</div>
        <div className="mt-1 text-[10px] leading-snug text-[#94A3B8]">
          Cochez « portefeuille principal » en créant un portefeuille pour désigner celui qui
          alimente cette caisse.
        </div>
      </div>
    );
  }

  return <Carte pf={principal} deviseCode={deviseCode} />;
}
