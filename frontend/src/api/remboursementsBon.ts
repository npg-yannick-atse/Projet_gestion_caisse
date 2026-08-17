import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface RemboursementBon {
  id: string;
  bonId: string;
  sousBonId: string;
  caisseId: string;
  deviseId: string;
  montant: string;
  motif?: string | null;
  createdAt: string;
  createdById?: string | null;
}

export interface CreateRemboursementPayload {
  sousBonId: string;
  montant: string;
  motif?: string;
}

export async function listRemboursementsBon(bonId: string): Promise<RemboursementBon[]> {
  const { data } = await api.get<RemboursementBon[]>(`/remboursements-bon/bon/${bonId}`);
  return data;
}

export async function createRemboursementBon(payload: CreateRemboursementPayload): Promise<RemboursementBon> {
  const { data } = await api.post<RemboursementBon>('/remboursements-bon', payload);
  return data;
}

export function useRemboursementsBon(bonId: string | null) {
  return useQuery({
    queryKey: ['remboursements-bon', bonId],
    queryFn: () => listRemboursementsBon(bonId!),
    enabled: !!bonId,
  });
}

export function useCreateRemboursementBon(bonId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createRemboursementBon,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['remboursements-bon', bonId] });
      // Le solde de la caisse a bougé : l'argent y est revenu.
      qc.invalidateQueries({ queryKey: ['caisses'] });
      qc.invalidateQueries({ queryKey: ['ledger'] });
    },
  });
}
