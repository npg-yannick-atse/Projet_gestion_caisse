import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Operation, TypeOperation } from '@/types/api';

export interface OperationsFilters {
  type?: TypeOperation;
  /** Recherche serveur sur référence, UUID de transaction et montant. */
  search?: string;
  /** Date de début (incluse), format YYYY-MM-DD. */
  dateFrom?: string;
  /** Date de fin (incluse), format YYYY-MM-DD. */
  dateTo?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  /** Filtre avancé : un portefeuille précis. */
  portefeuilleId?: string;
  /** Filtre avancé : centre de coût imputé (via les écritures de charge). */
  costCenterId?: string;
  /** Filtre avancé : agent qui a effectué l'opération. */
  userId?: string;
  /** Limite le nombre de lignes renvoyées (TOP en base) — aperçus « récents ». */
  limit?: number;
}

function operationParams(filters: OperationsFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.type) params.type = filters.type;
  if (filters.search) params.search = filters.search;
  if (filters.dateFrom) params.dateFrom = filters.dateFrom;
  if (filters.dateTo) params.dateTo = filters.dateTo;
  if (filters.sortBy) params.sortBy = filters.sortBy;
  if (filters.sortDir) params.sortDir = filters.sortDir;
  if (filters.portefeuilleId) params.portefeuilleId = filters.portefeuilleId;
  if (filters.costCenterId) params.costCenterId = filters.costCenterId;
  if (filters.userId) params.userId = filters.userId;
  if (filters.limit) params.limit = String(filters.limit);
  return params;
}

export async function listOperations(
  filters: OperationsFilters | TypeOperation = {},
): Promise<Operation[]> {
  // Compat : autorise un TypeOperation nu (ancien appel) ou un objet de filtres.
  const params = typeof filters === 'string' ? { type: filters } : operationParams(filters);
  const { data } = await api.get<Operation[]>('/ledger/operations', { params });
  return data;
}

/** Télécharge l'export Excel (.xlsx) des opérations filtrées (généré côté serveur). */
export async function exportOperationsXlsx(filters: OperationsFilters = {}): Promise<Blob> {
  const params = operationParams(filters);
  const { data } = await api.get('/ledger/operations/export', { params, responseType: 'blob' });
  return data as Blob;
}

export async function listOperationsByCaisse(caisseId: string, limit?: number): Promise<Operation[]> {
  const { data } = await api.get<Operation[]>(`/ledger/operations/caisse/${caisseId}`, {
    params: limit ? { limit: String(limit) } : undefined,
  });
  return data;
}

/**
 * Opérations (mouvements) d'une caisse — pour l'historique. Désactivable via `enabled`.
 * `limit` tronque EN BASE (TOP), pour les vues qui n'affichent que les N dernières.
 */
export function useOperationsByCaisse(
  caisseId: string | null | undefined,
  enabled = true,
  limit?: number,
) {
  return useQuery({
    queryKey: ['operations', 'caisse', caisseId, limit ?? 'all'],
    queryFn: () => listOperationsByCaisse(caisseId as string, limit),
    enabled: !!caisseId && enabled,
  });
}

export async function listOperationsByPortefeuille(
  portefeuilleId: string,
  limit?: number,
): Promise<Operation[]> {
  const { data } = await api.get<Operation[]>(`/ledger/operations/portefeuille/${portefeuilleId}`, {
    params: limit ? { limit: String(limit) } : undefined,
  });
  return data;
}

/**
 * Opérations (mouvements) d'un portefeuille — pour l'historique. Désactivable via `enabled`.
 * `limit` tronque EN BASE (TOP), pour les vues qui n'affichent que les N dernières.
 */
export function useOperationsByPortefeuille(
  portefeuilleId: string | null | undefined,
  enabled = true,
  limit?: number,
) {
  return useQuery({
    queryKey: ['operations', 'portefeuille', portefeuilleId, limit ?? 'all'],
    queryFn: () => listOperationsByPortefeuille(portefeuilleId as string, limit),
    enabled: !!portefeuilleId && enabled,
  });
}

export function useOperations(filters: OperationsFilters | TypeOperation = {}) {
  const key =
    typeof filters === 'string'
      ? { type: filters }
      : filters && Object.keys(filters).length > 0
        ? filters
        : 'all';
  return useQuery({ queryKey: ['operations', key], queryFn: () => listOperations(filters) });
}
