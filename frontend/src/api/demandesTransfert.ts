import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  CreateDemandeTransfertPayload,
  DecisionDemandeTransfertPayload,
  DemandeTransfert,
  DemandeTransfertStatut,
} from '@/types/api';

export interface DemandesTransfertFilters {
  statut?: DemandeTransfertStatut;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export async function listDemandesTransfert(
  filters: DemandesTransfertFilters | DemandeTransfertStatut = {},
): Promise<DemandeTransfert[]> {
  const params: Record<string, string> = {};
  if (typeof filters === 'string') {
    params.statut = filters;
  } else {
    if (filters.statut) params.statut = filters.statut;
    if (filters.sortBy) params.sortBy = filters.sortBy;
    if (filters.sortDir) params.sortDir = filters.sortDir;
  }
  const { data } = await api.get<DemandeTransfert[]>('/demandes-transfert', { params });
  return data;
}

export async function getDemandeTransfert(id: string): Promise<DemandeTransfert> {
  const { data } = await api.get<DemandeTransfert>(`/demandes-transfert/${id}`);
  return data;
}

export async function createDemandeTransfert(
  payload: CreateDemandeTransfertPayload,
): Promise<DemandeTransfert> {
  const { data } = await api.post<DemandeTransfert>('/demandes-transfert', payload);
  return data;
}

export async function decisionDemandeTransfert(
  id: string,
  payload: DecisionDemandeTransfertPayload,
): Promise<DemandeTransfert> {
  const { data } = await api.post<DemandeTransfert>(`/demandes-transfert/${id}/decision`, payload);
  return data;
}

export async function cancelDemandeTransfert(id: string): Promise<DemandeTransfert> {
  const { data } = await api.post<DemandeTransfert>(`/demandes-transfert/${id}/cancel`);
  return data;
}

export async function executeDemandeTransfert(id: string): Promise<DemandeTransfert> {
  const { data } = await api.post<DemandeTransfert>(`/demandes-transfert/${id}/execute`);
  return data;
}

export function useDemandesTransfert(
  filters: DemandesTransfertFilters | DemandeTransfertStatut = {},
) {
  const key =
    typeof filters === 'string'
      ? { statut: filters }
      : filters && Object.keys(filters).length > 0
        ? filters
        : 'all';
  return useQuery({
    queryKey: ['demandes-transfert', key],
    queryFn: () => listDemandesTransfert(filters),
  });
}

export function useCreateDemandeTransfert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createDemandeTransfert,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['demandes-transfert'] }),
  });
}

export function useDecisionDemandeTransfert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: DecisionDemandeTransfertPayload }) =>
      decisionDemandeTransfert(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['demandes-transfert'] }),
  });
}

export function useCancelDemandeTransfert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: cancelDemandeTransfert,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['demandes-transfert'] }),
  });
}

export function useExecuteDemandeTransfert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: executeDemandeTransfert,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['demandes-transfert'] });
      qc.invalidateQueries({ queryKey: ['operations'] });
      qc.invalidateQueries({ queryKey: ['caisses'] });
      qc.invalidateQueries({ queryKey: ['portefeuilles'] });
    },
  });
}
