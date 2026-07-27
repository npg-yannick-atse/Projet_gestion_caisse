import { useEffect, useMemo, useRef, useState } from 'react';
import { Landmark } from 'lucide-react';
import { useCaisses, useCaisseFluxTimeline, type FluxPoint } from '@/api/caisses';
import { useDevises } from '@/api/financierRef';
import { formatMontant } from '@/lib/utils';
import { Panel, PanelHeader } from '@/components/ui/panel';

const RANGES = [
  { days: 7, label: '7 j' },
  { days: 30, label: '30 j' },
  { days: 90, label: '90 j' },
];

// Paire validée (guide dataviz) : entrées teal / sorties orange (CVD ΔE 13.8).
const C_ENTREE = '#0D9488';
const C_SORTIE = '#EA580C';

/** Format compact pour l'axe (1 240 500 → 1.2M). */
function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'Md';
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (a >= 1e3) return Math.round(n / 1e3) + 'k';
  return String(Math.round(n));
}

/** Graphe entrées/sorties d'une caisse en DEUX COURBES (même axe monétaire). */
function FluxChart({ points, deviseCode }: { points: FluxPoint[]; deviseCode: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw) setW(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 210;
  const padL = 42;
  const padR = 8;
  const padTop = 14;
  const padBottom = 22;
  const plotH = H - padTop - padBottom;
  const innerW = Math.max(1, w - padL - padR);
  const n = points.length;

  const geo = useMemo(() => {
    const maxV = Math.max(1, ...points.map((p) => Math.max(p.entrees, p.sorties)));
    const x = (i: number) => (n <= 1 ? padL + innerW / 2 : padL + (i / (n - 1)) * innerW);
    const y = (v: number) => padTop + plotH - (v / maxV) * plotH;
    const lineOf = (key: 'entrees' | 'sorties') =>
      points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
    const areaOf = (key: 'entrees' | 'sorties') =>
      n === 0 ? '' : `${lineOf(key)} L${x(n - 1).toFixed(1)},${padTop + plotH} L${x(0).toFixed(1)},${padTop + plotH} Z`;
    return { maxV, x, y, lineE: lineOf('entrees'), lineS: lineOf('sorties'), areaE: areaOf('entrees'), areaS: areaOf('sorties') };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, w]);

  if (n === 0) {
    return <div className="flex h-[210px] items-center justify-center text-sm text-[#94A3B8]">Aucune donnée.</div>;
  }

  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => ({ y: padTop + plotH - f * plotH, val: f * geo.maxV }));
  const hv = hover != null ? points[hover] : null;
  const hoverX = hover != null ? geo.x(hover) : 0;
  const step = n <= 1 ? innerW : innerW / (n - 1);
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const rx = e.clientX - el.getBoundingClientRect().left;
    setHover(Math.max(0, Math.min(n - 1, Math.round((rx - padL) / step))));
  };

  return (
    <div ref={ref} className="relative" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg width={w} height={H} role="img" aria-label="Entrées et sorties par jour">
        {/* Grille + axe Y */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={w - padR} y1={t.y} y2={t.y} stroke={i === ticks.length - 1 ? '#CBD5E1' : '#EEF2F6'} strokeWidth={1} />
            <text x={padL - 6} y={t.y + 3} textAnchor="end" fontSize="9" fill="#94A3B8">
              {compact(t.val)}
            </text>
          </g>
        ))}

        {/* Aires légères sous chaque courbe */}
        <path d={geo.areaE} fill={C_ENTREE} fillOpacity={0.08} />
        <path d={geo.areaS} fill={C_SORTIE} fillOpacity={0.08} />

        {/* Courbes */}
        <path d={geo.lineS} fill="none" stroke={C_SORTIE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <path d={geo.lineE} fill="none" stroke={C_ENTREE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {/* Repère de survol */}
        {hover != null && hv && (
          <g>
            <line x1={hoverX} x2={hoverX} y1={padTop} y2={padTop + plotH} stroke="#94A3B8" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={hoverX} cy={geo.y(hv.sorties)} r={3.5} fill={C_SORTIE} stroke="#fff" strokeWidth={1.5} />
            <circle cx={hoverX} cy={geo.y(hv.entrees)} r={3.5} fill={C_ENTREE} stroke="#fff" strokeWidth={1.5} />
          </g>
        )}

        {/* Dates (premier / dernier) */}
        <text x={padL} y={H - 6} fontSize="9" fill="#94A3B8">
          {fmtDate(points[0].date)}
        </text>
        <text x={w - padR} y={H - 6} fontSize="9" fill="#94A3B8" textAnchor="end">
          {fmtDate(points[n - 1].date)}
        </text>
      </svg>

      {/* Tooltip */}
      {hv && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-[8px] border border-[rgba(15,76,129,0.12)] bg-white px-2.5 py-1.5 text-[11px] shadow-md"
          style={{ left: Math.min(Math.max(hoverX, 62), w - 62), top: 2 }}
        >
          <div className="mb-0.5 font-semibold text-[#0F172A]">{new Date(hv.date).toLocaleDateString('fr-FR')}</div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: C_ENTREE }} />
            Entrées <span className="ml-auto font-medium tabular-nums">{formatMontant(hv.entrees)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: C_SORTIE }} />
            Sorties <span className="ml-auto font-medium tabular-nums">{formatMontant(hv.sorties)}</span>
          </div>
          <div className="mt-0.5 border-t border-[rgba(15,76,129,0.08)] pt-0.5 text-[#475569]">
            Net{' '}
            <span className="ml-auto font-semibold tabular-nums">
              {(hv.entrees - hv.sorties >= 0 ? '+' : '') + formatMontant(hv.entrees - hv.sorties)} {deviseCode}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Panneau « Fond de caisse » : liste des caisses (clic = filtre) + graphe des
 * FLUX (entrées vs sorties) de la caisse sélectionnée, en deux courbes.
 *
 * `caisseIds` restreint l'affichage à ces caisses (ex. gestionnaire = caisses
 * qui alimentent ses portefeuilles). Absent = toutes les caisses (DAF, admin).
 */
export function FondCaissePanel({ caisseIds }: { caisseIds?: string[] }) {
  const { data: caisses } = useCaisses();
  const { data: devises } = useDevises();
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

  useEffect(() => {
    if (!caisseId && liste.length > 0) setCaisseId(liste[0].id);
  }, [liste, caisseId]);

  const { data: flux, isLoading } = useCaisseFluxTimeline(caisseId, days);
  const selected = liste.find((c) => c.id === caisseId);
  const deviseCode = (devises ?? []).find((d) => d.id === selected?.deviseId)?.code ?? '';

  const totals = useMemo(() => {
    const e = (flux ?? []).reduce((s, p) => s + p.entrees, 0);
    const s = (flux ?? []).reduce((a, p) => a + p.sorties, 0);
    return { entrees: e, sorties: s, net: e - s };
  }, [flux]);

  return (
    <Panel>
      <PanelHeader title="Fond de caisse — flux">
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
        <div className="px-[18px] py-10 text-center text-sm text-[#64748B]">Aucune caisse accessible.</div>
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

          {/* Légende + totaux de la période */}
          <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="text-[11px] font-semibold uppercase tracking-[0.6px] text-[#64748B]">
              {selected ? `${selected.code} — ${selected.libelle}` : ''}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3 rounded" style={{ background: C_ENTREE }} />
              Entrées <span className="font-medium tabular-nums text-[#0F172A]">{formatMontant(totals.entrees)}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3 rounded" style={{ background: C_SORTIE }} />
              Sorties <span className="font-medium tabular-nums text-[#0F172A]">{formatMontant(totals.sorties)}</span>
            </span>
            <span className="ml-auto text-[#475569]">
              Net{' '}
              <span className={`font-semibold tabular-nums ${totals.net >= 0 ? 'text-[#047857]' : 'text-[#B42318]'}`}>
                {(totals.net >= 0 ? '+' : '') + formatMontant(totals.net)} {deviseCode}
              </span>
            </span>
          </div>

          {/* Graphe */}
          {isLoading ? (
            <div className="flex h-[210px] items-center justify-center text-sm text-[#64748B]">Chargement…</div>
          ) : (
            <FluxChart points={flux ?? []} deviseCode={deviseCode} />
          )}
        </div>
      )}
    </Panel>
  );
}
