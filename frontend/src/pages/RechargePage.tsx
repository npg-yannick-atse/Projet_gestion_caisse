import { useMemo, useState } from 'react';
import { ArrowRight, Calendar, Landmark, Repeat, TrendingUp, Wallet } from 'lucide-react';
import { usePortefeuilles, useDevises } from '@/api/financierRef';
import { useOperations } from '@/api/ledger';
import { useMyBonPerimeter } from '@/api/bons';
import { useRecharge } from '@/api/recharge';
import { apiErrorMessage, cn, formatMontant } from '@/lib/utils';
import type { RechargeSens } from '@/types/api';
import { StatCard } from '@/components/ui/stat-card';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { CharCounter } from '@/components/ui/char-counter';
import { AucuneCaisseMessage } from '@/components/AucuneCaisseMessage';

const selectClass =
  'h-10 w-full rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-white px-3 text-sm text-[#0F172A] outline-none transition focus:border-[#1A6DB5] disabled:opacity-50';
const inputClass =
  'h-10 w-full rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-white px-3 text-sm text-[#0F172A] outline-none transition focus:border-[#1A6DB5]';
const labelClass = 'text-[11px] font-semibold uppercase tracking-[0.6px] text-[#64748B]';

export function RechargePage() {
  // Caisses limitées au périmètre de l'utilisateur (accès ECRITURE/ADMIN).
  const { data: perimeter } = useMyBonPerimeter();
  const caisses = perimeter?.caisses;
  const { data: rechargeOps } = useOperations('RECHARGE');
  const [caisseId, setCaisseId] = useState('');
  const [portefeuilleId, setPortefeuilleId] = useState('');
  const [montant, setMontant] = useState('');
  const [reference, setReference] = useState('');
  const [done, setDone] = useState(false);
  const [sens, setSens] = useState<RechargeSens>('CAISSE_VERS_PORTEFEUILLE');
  const inverse = sens === 'PORTEFEUILLE_VERS_CAISSE';

  // Tous les portefeuilles du périmètre (chacun porte sa caisse source).
  const { data: allPortefeuilles } = usePortefeuilles();
  // caisse → portefeuille : on liste tous les portefeuilles (la caisse est déduite du choix).
  // portefeuille → caisse : on garde le filtrage par la caisse destination sélectionnée.
  const portefeuilles = inverse
    ? (allPortefeuilles ?? []).filter((p) => !caisseId || String(p.caisseSourceId) === String(caisseId))
    : (allPortefeuilles ?? []);
  const { data: devises } = useDevises();
  const recharge = useRecharge();

  const openCaisses = (caisses ?? []).filter((c) => c.statut === 'OUVERTE');
  const valid = caisseId && portefeuilleId && Number(montant) > 0;

  const codeOf = (deviseId?: string | null) =>
    (devises ?? []).find((d) => d.id === deviseId)?.code ?? '';

  const stats = useMemo(() => {
    const ops = rechargeOps ?? [];
    // Total par devise : on ne mélange jamais des montants de devises différentes.
    const byDevise = new Map<string, number>();
    for (const o of ops) {
      const k = String(o.deviseId);
      byDevise.set(k, (byDevise.get(k) ?? 0) + Number(o.montant || 0));
    }
    const totals = [...byDevise.entries()]
      .map(([deviseId, total]) => ({ deviseId, total }))
      .sort((a, b) => b.total - a.total);
    return { totals, last: ops[0], count: ops.length };
  }, [rechargeOps]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setDone(false);
    recharge.mutate(
      { caisseId, portefeuilleId, montant, reference: reference || undefined, sens },
      {
        onSuccess: () => {
          setDone(true);
          setMontant('');
          setReference('');
        },
      },
    );
  };

  const caisseField = (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="caisse" className={labelClass}>
        {inverse ? 'Caisse destination (ouverte)' : 'Caisse source (ouverte)'}
      </label>
      <select
        id="caisse"
        className={selectClass}
        value={caisseId}
        onChange={(e) => {
          setCaisseId(e.target.value);
          setPortefeuilleId('');
        }}
      >
        <option value="">— Choisir —</option>
        {openCaisses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.code} — {c.libelle}
          </option>
        ))}
      </select>
      <AucuneCaisseMessage caisses={caisses} openCaisses={openCaisses} />
    </div>
  );

  const portefeuilleField = (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="portefeuille" className={labelClass}>
        {inverse ? 'Portefeuille source' : 'Portefeuille cible'}
      </label>
      <select
        id="portefeuille"
        className={selectClass}
        value={portefeuilleId}
        disabled={inverse && !caisseId}
        onChange={(e) => {
          const pid = e.target.value;
          setPortefeuilleId(pid);
          // caisse → portefeuille : la caisse source est déduite du portefeuille choisi.
          if (!inverse) {
            const p = (allPortefeuilles ?? []).find((x) => String(x.id) === String(pid));
            setCaisseId(p ? String(p.caisseSourceId) : '');
          }
        }}
      >
        <option value="">— Choisir —</option>
        {portefeuilles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.code} — {p.libelle}
          </option>
        ))}
      </select>
      {!inverse && caisseId && (
        <p className="text-[11px] text-[#64748B]">
          Caisse source : {(caisses ?? []).find((c) => String(c.id) === String(caisseId))?.code ?? '—'}
        </p>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          tone="green"
          icon={TrendingUp}
          label="Total rechargé"
          value={
            stats.totals.length === 0 ? (
              '—'
            ) : (
              <div className="flex flex-col gap-0.5">
                {stats.totals.map((t) => (
                  <div key={t.deviseId} className="leading-tight">
                    {formatMontant(t.total)}{' '}
                    <span className="text-[14px] font-semibold text-[#64748B]">{codeOf(t.deviseId)}</span>
                  </div>
                ))}
              </div>
            )
          }
          sub="Cumulé par devise"
        />
        <StatCard
          tone="blue"
          icon={Calendar}
          label="Dernière recharge"
          value={stats.last ? new Date(stats.last.dateOperation).toLocaleDateString('fr-FR') : '—'}
          sub={stats.last ? `${formatMontant(stats.last.montant)} ${codeOf(stats.last.deviseId)}` : 'Aucune'}
        />
        <StatCard tone="amber" icon={Repeat} label="Recharges" value={`${stats.count}`} sub="Au total" />
      </div>

      <Panel>
        <PanelHeader title="Nouvelle recharge" />
        <form onSubmit={submit} className="grid gap-4 p-[18px] sm:grid-cols-2">
          {/* Sens du mouvement : caisse → portefeuille (recharge) ou portefeuille → caisse */}
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <span className={labelClass}>Sens du mouvement</span>
            <div className="inline-flex w-full max-w-md rounded-[9px] border border-[rgba(15,76,129,0.12)] p-0.5">
              <button
                type="button"
                onClick={() => {
                  setSens('CAISSE_VERS_PORTEFEUILLE');
                  setCaisseId('');
                  setPortefeuilleId('');
                }}
                className={cn(
                  'inline-flex flex-1 items-center justify-center gap-1.5 rounded-[7px] px-3 py-1.5 text-xs font-medium transition',
                  !inverse ? 'bg-[#0F4C81] text-white' : 'text-[#475569] hover:bg-[#F1F5F9]',
                )}
              >
                <Landmark className="h-3.5 w-3.5" /> Caisse <ArrowRight className="h-3.5 w-3.5" />
                <Wallet className="h-3.5 w-3.5" /> Portefeuille
              </button>
              <button
                type="button"
                onClick={() => {
                  setSens('PORTEFEUILLE_VERS_CAISSE');
                  setCaisseId('');
                  setPortefeuilleId('');
                }}
                className={cn(
                  'inline-flex flex-1 items-center justify-center gap-1.5 rounded-[7px] px-3 py-1.5 text-xs font-medium transition',
                  inverse ? 'bg-[#0F4C81] text-white' : 'text-[#475569] hover:bg-[#F1F5F9]',
                )}
              >
                <Wallet className="h-3.5 w-3.5" /> Portefeuille <ArrowRight className="h-3.5 w-3.5" />
                <Landmark className="h-3.5 w-3.5" /> Caisse
              </button>
            </div>
            <p className="text-[11px] text-[#64748B]">
              {inverse
                ? 'Renvoi : l’argent repart du portefeuille vers sa caisse source (limité au solde du portefeuille).'
                : 'Recharge : l’argent va de la caisse vers le portefeuille.'}
            </p>
          </div>

          {/* portefeuille → caisse : source (portefeuille) puis destination (caisse).
              caisse → portefeuille : on ne demande que le portefeuille, la caisse est déduite. */}
          {inverse ? (
            <>
              {portefeuilleField}
              {caisseField}
            </>
          ) : (
            portefeuilleField
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="montant" className={labelClass}>
              Montant (FCFA)
            </label>
            <input
              id="montant"
              inputMode="decimal"
              className={inputClass}
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              placeholder="Ex : 50 000"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="reference" className={labelClass}>
              Motif (optionnel)
            </label>
            <input
              id="reference"
              className={inputClass}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Motif de la recharge…"
              maxLength={500}
            />
            <CharCounter value={reference} max={500} />
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[rgba(15,76,129,0.07)] pt-4 sm:col-span-2">
            {done && <p className="mr-auto text-sm text-[#059669]">Recharge effectuée.</p>}
            {recharge.isError && (
              <p className="mr-auto text-sm text-[#EF4444]">{apiErrorMessage(recharge.error, 'Recharge impossible')}</p>
            )}
            <button
              type="submit"
              disabled={!valid || recharge.isPending}
              className="flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-4 py-2 text-xs font-medium text-white transition hover:bg-[#1A6DB5] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {recharge.isPending ? 'Recharge…' : 'Valider la recharge'}
            </button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
