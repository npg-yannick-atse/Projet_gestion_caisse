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
  search?: string;
  /** Date de création minimale (YYYY-MM-DD, incluse) — filtrée en base. */
  dateFrom?: string;
  /** Date de création maximale (YYYY-MM-DD, incluse) — filtrée en base. */
  dateTo?: string;
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
    if (filters.search) params.search = filters.search;
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
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

export interface DemandesTransfertStats {
  total: number;
  parStatut: Record<string, number>;
}

export async function getDemandesTransfertStats(
  filters: Pick<DemandesTransfertFilters, 'search' | 'dateFrom' | 'dateTo'> = {},
): Promise<DemandesTransfertStats> {
  const params: Record<string, string> = {};
  if (filters.search) params.search = filters.search;
  if (filters.dateFrom) params.dateFrom = filters.dateFrom;
  if (filters.dateTo) params.dateTo = filters.dateTo;
  const { data } = await api.get<DemandesTransfertStats>('/demandes-transfert/stats', { params });
  return data;
}

/**
 * Compteurs des onglets de statut : calculés en base sur la recherche et les dates
 * courantes, mais SANS le filtre de statut — sinon l'onglet sélectionné écraserait
 * les compteurs des autres à zéro.
 */
export function useDemandesTransfertStats(
  filters: Pick<DemandesTransfertFilters, 'search' | 'dateFrom' | 'dateTo'> = {},
) {
  return useQuery({
    queryKey: ['demandes-transfert-stats', filters],
    queryFn: () => getDemandesTransfertStats(filters),
  });
}

// Liste et compteurs sont deux requêtes distinctes : toute mutation doit invalider
// les deux, sinon les onglets restent sur d'anciens totaux.
function invalidateTransfert(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['demandes-transfert'] });
  qc.invalidateQueries({ queryKey: ['demandes-transfert-stats'] });
}

export function useCreateDemandeTransfert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createDemandeTransfert,
    onSuccess: () => invalidateTransfert(qc),
  });
}

export function useDecisionDemandeTransfert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: DecisionDemandeTransfertPayload }) =>
      decisionDemandeTransfert(id, payload),
    onSuccess: () => invalidateTransfert(qc),
  });
}

export function useCancelDemandeTransfert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: cancelDemandeTransfert,
    onSuccess: () => invalidateTransfert(qc),
  });
}

export function useExecuteDemandeTransfert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: executeDemandeTransfert,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['demandes-transfert'] });
      qc.invalidateQueries({ queryKey: ['demandes-transfert-stats'] });
      qc.invalidateQueries({ queryKey: ['operations'] });
      qc.invalidateQueries({ queryKey: ['caisses'] });
      qc.invalidateQueries({ queryKey: ['portefeuilles'] });
    },
  });
}
