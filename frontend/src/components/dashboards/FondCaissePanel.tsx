import { useEffect, useMemo, useState } from 'react';
import { Landmark } from 'lucide-react';
import { useCaisses, useCaisseSoldeTimeline, type SoldePoint } from '@/api/caisses';
import { formatMontant } from '@/lib/utils';
import { Panel, PanelHeader } from '@/components/ui/panel';

const RANGES = [
  { days: 7, label: '7 j' },
  { days: 30, label: '30 j' },
  { days: 90, label: '90 j' },
];

/** Graphe d'aire (SVG) de l'évolution d'un solde. viewBox fixe, rendu responsive. */
function SoldeChart({ points }: { points: SoldePoint[] }) {
  const W = 640;
  const H = 180;
  const padX = 8;
  const padTop = 14;
  const padBottom = 22;

  const geo = useMemo(() => {
    if (points.length === 0) return null;
    const vals = points.map((p) => p.solde);
    const max = Math.max(...vals);
    const min = Math.min(...vals, 0);
    const range = Math.max(1, max - min);
    const innerW = W - padX * 2;
    const innerH = H - padTop - padBottom;
    const stepX = points.length > 1 ? innerW / (points.length - 1) : innerW;
    const pts = points.map((p, i) => ({
      x: padX + i * stepX,
      y: padTop + innerH - ((p.solde - min) / range) * innerH,
      p,
    }));
    const line = pts.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ');
    const area = `${line} L ${pts[pts.length - 1].x.toFixed(1)} ${H - padBottom} L ${padX} ${H - padBottom} Z`;
    const zeroY = padTop + innerH - ((0 - min) / range) * innerH;
    return { pts, line, area, max, min, zeroY };
  }, [points]);

  if (!geo) {
    return <div className="flex h-[180px] items-center justify-center text-sm text-[#94A3B8]">Aucune donnée.</div>;
  }

  const last = geo.pts[geo.pts.length - 1];
  const first = points[0];
  const lastP = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img">
      {/* Ligne du zéro si le solde passe en négatif */}
      {geo.min < 0 && (
        <line x1={padX} x2={W - padX} y1={geo.zeroY} y2={geo.zeroY} stroke="#E2E8F0" strokeWidth="1" strokeDasharray="3 3" />
      )}
      <path d={geo.area} fill="rgba(26,109,181,0.10)" />
      <path d={geo.line} fill="none" stroke="#1A6DB5" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last.x} cy={last.y} r="3.5" fill="#0F4C81" />
      {/* Repères min / max */}
      <text x={padX} y={padTop - 3} fontSize="10" fill="#94A3B8">
        max {formatMontant(geo.max)}
      </text>
      <text x={padX} y={H - 6} fontSize="10" fill="#94A3B8">
        {first?.date}
      </text>
      <text x={W - padX} y={H - 6} fontSize="10" fill="#94A3B8" textAnchor="end">
        {lastP?.date}
      </text>
    </svg>
  );
}

/**
 * Panneau « Fond de caisse » : liste des caisses (clic = filtre) + graphe
 * d'évolution du solde dans le temps de la caisse sélectionnée.
 *
 * `caisseIds` restreint l'affichage à ces caisses (ex. gestionnaire = caisses
 * qui alimentent ses portefeuilles). Absent = toutes les caisses (DAF, admin).
 */
export function FondCaissePanel({ caisseIds }: { caisseIds?: string[] }) {
  const { data: caisses } = useCaisses();
  const [caisseId, setCaisseId] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  const liste = useMemo(() => {
    let l = (caisses ?? []).filter((c) => c.estActif !== false);
    if (caisseIds) {
      const set = new Set(caisseIds.map(String));
      l = l.filter((c) => set.has(String(c.id)));
    }
    return l;
  }, [caisses, caisseIds]);

  // Sélection par défaut : la première caisse disponible.
  useEffect(() => {
    if (!caisseId && liste.length > 0) setCaisseId(liste[0].id);
  }, [liste, caisseId]);

  const { data: timeline, isLoading } = useCaisseSoldeTimeline(caisseId, days);
  const selected = liste.find((c) => c.id === caisseId);
  const soldeCourant = timeline && timeline.length > 0 ? timeline[timeline.length - 1].solde : null;

  return (
    <Panel>
      <PanelHeader title="Fond de caisse">
        <div className="ml-auto flex items-center gap-1 rounded-[9px] border border-[rgba(15,76,129,0.12)] p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => setDays(r.days)}
              className={`rounded-[7px] px-2.5 py-1 text-[11px] font-medium transition ${
                days === r.days ? 'bg-[#0F4C81] text-white' : 'text-[#475569] hover:bg-[#F1F5F9]'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </PanelHeader>

      {liste.length === 0 ? (
        <div className="px-[18px] py-10 text-center text-sm text-[#64748B]">
          Aucune caisse accessible.
        </div>
      ) : (
        <div className="p-[18px]">
          {/* Caisses : clic = filtre */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {liste.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCaisseId(c.id)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
                  c.id === caisseId
                    ? 'border-[#0F4C81] bg-[#0F4C81] text-white'
                    : 'border-[rgba(15,76,129,0.15)] text-[#475569] hover:bg-[#F1F5F9]'
                }`}
              >
                <Landmark className="h-3.5 w-3.5" />
                {c.code}
              </button>
            ))}
          </div>

          {/* Solde courant */}
          <div className="mb-2 flex items-baseline gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.6px] text-[#64748B]">
              {selected ? `${selected.code} — ${selected.libelle}` : ''}
            </span>
            {soldeCourant !== null && (
              <span className="font-display text-lg font-bold text-[#0F172A]">{formatMontant(soldeCourant)}</span>
            )}
          </div>

          {/* Graphe */}
          {isLoading ? (
            <div className="flex h-[180px] items-center justify-center text-sm text-[#64748B]">Chargement…</div>
          ) : (
            <SoldeChart points={timeline ?? []} />
          )}
        </div>
      )}
    </Panel>
  );
}
