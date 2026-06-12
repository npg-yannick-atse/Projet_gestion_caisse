import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CreateInterimPayload, Interim, InterimStatut } from '@/types/api';

export async function listInterims(statut?: InterimStatut): Promise<Interim[]> {
  const { data } = await api.get<Interim[]>('/interims', {
    params: statut ? { statut } : undefined,
  });
  return data;
}

export async function createInterim(payload: CreateInterimPayload): Promise<Interim> {
  const { data } = await api.post<Interim>('/interims', payload);
  return data;
}

export async function revokeInterim(id: string): Promise<Interim> {
  const { data } = await api.post<Interim>(`/interims/${id}/revoke`, {});
  return data;
}

export function useInterims(statut?: InterimStatut) {
  return useQuery({ queryKey: ['interims', statut ?? 'all'], queryFn: () => listInterims(statut) });
}

export function useCreateInterim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createInterim,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['interims'] }),
  });
}

export function useRevokeInterim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: revokeInterim,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['interims'] }),
  });
}
