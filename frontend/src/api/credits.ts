import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Credit, CreateCreditPayload, UpdateCreditPayload } from '@/types/api';

export interface CreditsFilters {
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export async function listCredits(filters: CreditsFilters = {}): Promise<Credit[]> {
  const params: Record<string, string> = {};
  if (filters.dateFrom) params.dateFrom = filters.dateFrom;
  if (filters.dateTo) params.dateTo = filters.dateTo;
  if (filters.sortBy) params.sortBy = filters.sortBy;
  if (filters.sortDir) params.sortDir = filters.sortDir;
  const { data } = await api.get<Credit[]>('/credits', { params });
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

export async function approuverCredit(id: string): Promise<Credit> {
  const { data } = await api.post<Credit>(`/credits/${id}/approuver`, {});
  return data;
}

export async function rejeterCredit(id: string, commentaire?: string): Promise<Credit> {
  const { data } = await api.post<Credit>(`/credits/${id}/rejeter`, commentaire ? { commentaire } : {});
  return data;
}

export async function annulerCredit(id: string): Promise<Credit> {
  const { data } = await api.post<Credit>(`/credits/${id}/annuler`, {});
  return data;
}

export async function traiterCredit(id: string): Promise<Credit> {
  const { data } = await api.post<Credit>(`/credits/${id}/traiter`, {});
  return data;
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['credits'] });
  qc.invalidateQueries({ queryKey: ['caisses'] });
  qc.invalidateQueries({ queryKey: ['portefeuilles'] });
  qc.invalidateQueries({ queryKey: ['operations'] });
}

export function useCredits(filters: CreditsFilters = {}) {
  return useQuery({ queryKey: ['credits', filters], queryFn: () => listCredits(filters) });
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

export function useApprouverCredit() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: approuverCredit, onSuccess: () => invalidate(qc) });
}

export function useRejeterCredit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, commentaire }: { id: string; commentaire?: string }) => rejeterCredit(id, commentaire),
    onSuccess: () => invalidate(qc),
  });
}

export function useAnnulerCredit() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: annulerCredit, onSuccess: () => invalidate(qc) });
}

export function useTraiterCredit() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: traiterCredit, onSuccess: () => invalidate(qc) });
}
