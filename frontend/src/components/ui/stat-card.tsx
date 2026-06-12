import { Link } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StatTone = 'blue' | 'green' | 'amber' | 'gray' | 'purple';

const TONES: Record<StatTone, { chip: string; icon: string }> = {
  blue: { chip: 'bg-[#EFF6FF]', icon: 'text-[#1A6DB5]' },
  green: { chip: 'bg-[#ECFDF5]', icon: 'text-[#00C896]' },
  amber: { chip: 'bg-[#FFFBEB]', icon: 'text-[#F59E0B]' },
  gray: { chip: 'bg-[#F8FAFC]', icon: 'text-[#64748B]' },
  purple: { chip: 'bg-[#F5F3FF]', icon: 'text-[#7C3AED]' },
};

export function StatCard({
  tone = 'gray',
  icon: Icon,
  label,
  value,
  sub,
  to,
  children,
}: {
  tone?: StatTone;
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  sub?: string;
  to?: string;
  children?: React.ReactNode;
}) {
  const t = TONES[tone];
  const body = (
    <div className="h-full rounded-[13px] border border-[rgba(15,76,129,0.1)] bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(15,76,129,0.1)]">
      <div className={cn('mb-2.5 flex h-[34px] w-[34px] items-center justify-center rounded-[9px]', t.chip)}>
        <Icon className={cn('h-4 w-4', t.icon)} />
      </div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.7px] text-[#64748B]">{label}</div>
      <div className="font-display text-[26px] font-bold leading-none text-[#0F172A]">{value}</div>
      {sub && <div className="mt-[3px] text-[10px] text-[#64748B]">{sub}</div>}
      {children}
    </div>
  );
  return to ? (
    <Link to={to} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}
