import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { EncaissementPayload } from '@/types/api';

export async function encaisser(payload: EncaissementPayload): Promise<unknown> {
  const { data } = await api.post('/encaissements', payload);
  return data;
}

export function useEncaissement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: encaisser,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['caisses'] });
      qc.invalidateQueries({ queryKey: ['caisse', vars.caisseId, 'solde'] });
      qc.invalidateQueries({ queryKey: ['operations'] });
    },
  });
}
