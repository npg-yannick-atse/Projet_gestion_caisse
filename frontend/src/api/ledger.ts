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
}

export async function listOperations(
  filters: OperationsFilters | TypeOperation = {},
): Promise<Operation[]> {
  // Compat : autorise un TypeOperation nu (ancien appel) ou un objet de filtres.
  const params: Record<string, string> = {};
  if (typeof filters === 'string') {
    params.type = filters;
  } else {
    if (filters.type) params.type = filters.type;
    if (filters.search) params.search = filters.search;
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
    if (filters.sortBy) params.sortBy = filters.sortBy;
    if (filters.sortDir) params.sortDir = filters.sortDir;
  }
  const { data } = await api.get<Operation[]>('/ledger/operations', { params });
  return data;
}

/** Télécharge l'export Excel (.xlsx) des opérations filtrées (généré côté serveur). */
export async function exportOperationsXlsx(filters: OperationsFilters = {}): Promise<Blob> {
  const params: Record<string, string> = {};
  if (filters.type) params.type = filters.type;
  if (filters.search) params.search = filters.search;
  if (filters.dateFrom) params.dateFrom = filters.dateFrom;
  if (filters.dateTo) params.dateTo = filters.dateTo;
  const { data } = await api.get('/ledger/operations/export', { params, responseType: 'blob' });
  return data as Blob;
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
