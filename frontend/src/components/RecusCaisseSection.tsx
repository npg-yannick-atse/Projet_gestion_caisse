import { useRecusCaisse, imprimerRecu } from '@/api/recusCaisse';
import { formatMontant } from '@/lib/utils';
import { Panel, PanelHeader } from '@/components/ui/panel';

/**
 * Reçus de réception — posés sur l'écran des MOUVEMENTS.
 *
 * C'est là que le caissier encaisse ; c'est donc là qu'il doit retrouver la
 * pièce qui atteste de ce qu'il vient de recevoir, sans changer d'écran.
 *
 * Aucun bouton pour en créer un : un reçu CONSTATE une entrée d'argent, il ne
 * se saisit pas. Le fabriquer à la main reviendrait à attester d'une remise qui
 * n'a pas eu lieu.
 */
export function RecusCaisseSection({ caisseId }: { caisseId?: string }) {
  const { data: recus, isLoading } = useRecusCaisse(caisseId, 50);

  return (
    <Panel>
      <PanelHeader title="Reçus de réception" badge={recus ? String(recus.length) : undefined}>
        <span className="ml-auto text-[11px] text-[#64748B]">
          {caisseId ? 'Caisse choisie' : 'Toutes caisses'}
        </span>
      </PanelHeader>

      {isLoading && <div className="px-[18px] py-6 text-xs text-[#64748B]">Chargement…</div>}

      {/* L'absence se dit : sans ce texte, on ne distingue pas « rien n'est
          entré » de « les reçus ne s'affichent pas ici ». */}
      {!isLoading && (recus ?? []).length === 0 && (
        <div className="px-[18px] py-5 text-[11px] text-[#64748B]">
          Aucune entrée d'argent enregistrée{caisseId ? ' sur cette caisse' : ''}. Les reçus sont
          émis <strong>automatiquement</strong> — encaissement, recharge, retour d'un bon, reprise
          de budget — et deviennent imprimables ici. Il n'y a rien à saisir.
        </div>
      )}

      {!isLoading && (recus ?? []).length > 0 && (
        <div className="space-y-1 p-[18px]">
          {(recus ?? []).map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[9px] border border-[rgba(15,76,129,0.07)] px-3 py-2"
            >
              <div className="min-w-0">
                <span className="font-mono text-[11px] font-semibold text-[#0F172A]">{r.numero}</span>
                <span className="ml-2 text-[11px] text-[#64748B]">
                  {new Date(r.createdAt).toLocaleString('fr-FR')}
                  {r.caisseLibelle ? ` · ${r.caisseLibelle}` : ''}
                  {r.motif ? ` — ${r.motif}` : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="tabular-nums text-[12px] font-semibold text-[#047857]">
                  +{formatMontant(r.montant)} {r.deviseCode ?? ''}
                </span>
                <button
                  type="button"
                  onClick={() => imprimerRecu(r)}
                  title="Imprimer le reçu"
                  className="rounded-[7px] border border-[rgba(15,76,129,0.15)] px-2.5 py-1 text-[10px] font-medium text-[#0F4C81] transition hover:bg-[#EFF6FF]"
                >
                  Imprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
