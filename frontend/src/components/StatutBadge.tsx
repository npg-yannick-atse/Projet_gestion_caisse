import type { BonStatut } from '@/types/api';
import { cn } from '@/lib/utils';

const MAP: Record<BonStatut, { cls: string; dot: string; label: string }> = {
  CREE: { cls: 'bg-[#FFFBEB] text-[#D97706]', dot: 'bg-[#D97706]', label: 'En attente' },
  VALIDE: { cls: 'bg-[#EFF6FF] text-[#1A6DB5]', dot: 'bg-[#1A6DB5]', label: 'Validé' },
  DECAISSE: { cls: 'bg-[#ECFDF5] text-[#059669]', dot: 'bg-[#059669]', label: 'Décaissé' },
  COMPTABILISE: { cls: 'bg-[#F5F3FF] text-[#7C3AED]', dot: 'bg-[#7C3AED]', label: 'Comptabilisé' },
  ANNULE: { cls: 'bg-[#F8FAFC] text-[#64748B]', dot: 'bg-[#64748B]', label: 'Annulé' },
  REFUSE: { cls: 'bg-[#FEF2F2] text-[#EF4444]', dot: 'bg-[#EF4444]', label: 'Refusé' },
};

export function StatutBadge({ statut }: { statut: BonStatut }) {
  const m = MAP[statut];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold', m.cls)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', m.dot)} />
      {m.label}
    </span>
  );
}
