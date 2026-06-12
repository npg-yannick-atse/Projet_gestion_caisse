import { cn } from '@/lib/utils';

export function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('overflow-hidden rounded-[13px] border border-[rgba(15,76,129,0.1)] bg-white', className)}>
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  badge,
  children,
}: {
  title: React.ReactNode;
  badge?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-b border-[rgba(15,76,129,0.07)] px-[18px] py-3.5">
      <div className="font-display text-xs font-semibold text-[#0F172A]">{title}</div>
      {badge !== undefined && (
        <span className="rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[10px] font-semibold text-[#1A6DB5]">{badge}</span>
      )}
      {children}
    </div>
  );
}
