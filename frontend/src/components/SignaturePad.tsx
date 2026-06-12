import { useEffect, useRef, useState } from 'react';

interface Props {
  onConfirm: (dataUrl: string) => void;
  onCancel: () => void;
  busy?: boolean;
}

/** Canevas de signature manuscrite (souris + tactile). Retourne le PNG en data URL. */
export function SignaturePad({ onConfirm, onCancel, busy }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const point = 'touches' in e ? e.touches[0] : (e as React.MouseEvent);
    return {
      x: (point.clientX - r.left) * (c.width / r.width),
      y: (point.clientY - r.top) * (c.height / r.height),
    };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    drawingRef.current = true;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawingRef.current) return;
    if ('touches' in e) e.preventDefault();
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = getPos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    if (!hasDrawn) setHasDrawn(true);
  };

  const end = () => {
    drawingRef.current = false;
  };

  const clear = () => {
    const c = canvasRef.current!;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    setHasDrawn(false);
  };

  const confirm = () => {
    const c = canvasRef.current!;
    onConfirm(c.toDataURL('image/png'));
  };

  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        width={520}
        height={180}
        className="w-full touch-none rounded-md border border-[rgba(15,76,129,0.15)] bg-white shadow-inner"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={clear}
          className="rounded-[7px] border border-[rgba(15,76,129,0.1)] bg-white px-3 py-1.5 text-[11px] font-medium text-[#475569] hover:bg-[#F8FAFC]"
        >
          Effacer
        </button>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[7px] border border-[rgba(15,76,129,0.1)] bg-white px-3 py-1.5 text-[11px] font-medium text-[#475569] hover:bg-[#F8FAFC]"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={!hasDrawn || busy}
            onClick={confirm}
            className="rounded-[7px] bg-[#0F4C81] px-4 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-[#1A6DB5] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Signature…' : 'Confirmer la signature'}
          </button>
        </div>
      </div>
    </div>
  );
}
