import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
  stroke?: string;
  fill?: string;
  showDots?: boolean;
}

/**
 * Mini graphique en ligne pour afficher une tendance (compact, inline).
 * Idéal dans une carte KPI : 7 derniers jours, etc.
 */
export function Sparkline({
  values,
  width = 110,
  height = 28,
  className,
  stroke = '#1A6DB5',
  fill = 'rgba(26,109,181,0.12)',
  showDots = false,
}: SparklineProps) {
  const { path, area, points } = useMemo(() => {
    if (values.length === 0) return { path: '', area: '', points: [] as Array<{ x: number; y: number }> };
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = Math.max(1, max - min);
    const stepX = values.length > 1 ? width / (values.length - 1) : width;
    const padY = 2;
    const innerH = height - padY * 2;

    const pts = values.map((v, i) => {
      const x = i * stepX;
      const y = padY + innerH - ((v - min) / range) * innerH;
      return { x, y };
    });

    const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const areaPath =
      pts.length > 0
        ? `${linePath} L ${pts[pts.length - 1].x.toFixed(1)} ${height} L 0 ${height} Z`
        : '';
    return { path: linePath, area: areaPath, points: pts };
  }, [values, width, height]);

  if (values.length === 0) {
    return (
      <div className={cn('flex items-center justify-center text-[10px] text-[#94A3B8]', className)} style={{ width, height }}>
        —
      </div>
    );
  }

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {area && <path d={area} fill={fill} />}
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {showDots &&
        points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={1.5} fill={stroke} />)}
    </svg>
  );
}
