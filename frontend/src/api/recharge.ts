import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { RechargePayload } from '@/types/api';

export async function recharge(payload: RechargePayload): Promise<unknown> {
  const { data } = await api.post('/recharges', payload);
  return data;
}

export function useRecharge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: recharge,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['caisses'] });
      qc.invalidateQueries({ queryKey: ['caisse', vars.caisseId, 'solde'] });
      qc.invalidateQueries({ queryKey: ['portefeuilles'] });
    },
  });
}
