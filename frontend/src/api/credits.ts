import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Credit, CreateCreditPayload, UpdateCreditPayload } from '@/types/api';

export async function listCredits(): Promise<Credit[]> {
  const { data } = await api.get<Credit[]>('/credits');
  return data;
}

export async function createCredit(payload: CreateCreditPayload): Promise<Credit> {
  const { data } = await api.post<Credit>('/credits', payload);
  return data;
}

export async function updateCredit(id: string, payload: UpdateCreditPayload): Promise<Credit> {
  const { data } = await api.patch<Credit>(`/credits/${id}`, payload);
  return data;
}

export async function solderCredit(id: string): Promise<Credit> {
  const { data } = await api.post<Credit>(`/credits/${id}/solder`, {});
  return data;
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['credits'] });
  qc.invalidateQueries({ queryKey: ['caisses'] });
  qc.invalidateQueries({ queryKey: ['portefeuilles'] });
  qc.invalidateQueries({ queryKey: ['operations'] });
}

export function useCredits() {
  return useQuery({ queryKey: ['credits'], queryFn: listCredits });
}

export function useCreateCredit() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: createCredit, onSuccess: () => invalidate(qc) });
}

export function useUpdateCredit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateCreditPayload }) => updateCredit(id, payload),
    onSuccess: () => invalidate(qc),
  });
}

export function useSolderCredit() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: solderCredit, onSuccess: () => invalidate(qc) });
}
