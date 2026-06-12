import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AuditEntry } from '@/types/api';

export interface AuditFilters {
  userId?: string;
  action?: string;
  entite?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function listAudit(filters: AuditFilters = {}): Promise<AuditEntry[]> {
  const params: Record<string, string> = {};
  if (filters.userId) params.userId = filters.userId;
  if (filters.action) params.action = filters.action;
  if (filters.entite) params.entite = filters.entite;
  if (filters.dateFrom) params.dateFrom = filters.dateFrom;
  if (filters.dateTo) params.dateTo = filters.dateTo;
  const { data } = await api.get<AuditEntry[]>('/audit', { params });
  return data;
}

export function useAudit(filters: AuditFilters = {}) {
  return useQuery({ queryKey: ['audit', filters], queryFn: () => listAudit(filters) });
}
