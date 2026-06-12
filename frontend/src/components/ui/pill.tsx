import { cn } from '@/lib/utils';

export type PillTone = 'green' | 'amber' | 'blue' | 'red' | 'gray' | 'purple';

const TONES: Record<PillTone, { cls: string; dot: string }> = {
  green: { cls: 'bg-[#ECFDF5] text-[#059669]', dot: 'bg-[#059669]' },
  amber: { cls: 'bg-[#FFFBEB] text-[#D97706]', dot: 'bg-[#D97706]' },
  blue: { cls: 'bg-[#EFF6FF] text-[#1A6DB5]', dot: 'bg-[#1A6DB5]' },
  red: { cls: 'bg-[#FEF2F2] text-[#EF4444]', dot: 'bg-[#EF4444]' },
  gray: { cls: 'bg-[#F8FAFC] text-[#64748B]', dot: 'bg-[#64748B]' },
  purple: { cls: 'bg-[#F5F3FF] text-[#7C3AED]', dot: 'bg-[#7C3AED]' },
};

export function Pill({
  tone = 'gray',
  dot = true,
  children,
}: {
  tone?: PillTone;
  dot?: boolean;
  children: React.ReactNode;
}) {
  const t = TONES[tone];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold', t.cls)}>
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', t.dot)} />}
      {children}
    </span>
  );
}
