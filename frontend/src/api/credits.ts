import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  Credit,
  CreateCreditPayload,
  UpdateCreditPayload,
  CreditRemboursement,
  CreateRemboursementPayload,
  SituationCredit,
} from '@/types/api';

export interface CreditsFilters {
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  /** Restreint aux crédits des employés de cette direction. */
  directionId?: string;
}

export async function listCredits(filters: CreditsFilters = {}): Promise<Credit[]> {
  const params: Record<string, string> = {};
  if (filters.dateFrom) params.dateFrom = filters.dateFrom;
  if (filters.dateTo) params.dateTo = filters.dateTo;
  if (filters.sortBy) params.sortBy = filters.sortBy;
  if (filters.sortDir) params.sortDir = filters.sortDir;
  if (filters.directionId) params.directionId = filters.directionId;
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

// --- Remboursements -----------------------------------------------------------
// Les versements sont désormais ENREGISTRÉS : « remboursé » et « reste » sont
// des constats, plus une déduction du calendrier.

export async function listRemboursements(creditId: string): Promise<CreditRemboursement[]> {
  const { data } = await api.get<CreditRemboursement[]>(`/credits/${creditId}/remboursements`);
  return data;
}

export async function getSituationCredit(creditId: string): Promise<SituationCredit> {
  const { data } = await api.get<SituationCredit>(`/credits/${creditId}/situation`);
  return data;
}

export async function getSituationsCredits(ids?: string[]): Promise<Record<string, SituationCredit>> {
  const { data } = await api.get<Record<string, SituationCredit>>('/credits/situations', {
    params: ids?.length ? { ids: ids.join(',') } : undefined,
  });
  return data;
}

export async function enregistrerRemboursement(
  creditId: string,
  payload: CreateRemboursementPayload,
): Promise<CreditRemboursement> {
  const { data } = await api.post<CreditRemboursement>(`/credits/${creditId}/remboursements`, payload);
  return data;
}

export async function annulerRemboursement(rembId: string, motif?: string): Promise<CreditRemboursement> {
  const { data } = await api.post<CreditRemboursement>(
    `/credits/remboursements/${rembId}/annuler`,
    motif ? { motif } : {},
  );
  return data;
}

/** Invalide aussi les situations : un versement change le remboursé et le reste. */
function invalidateRemb(qc: ReturnType<typeof useQueryClient>) {
  invalidate(qc);
  qc.invalidateQueries({ queryKey: ['credit-situations'] });
  qc.invalidateQueries({ queryKey: ['credit-remboursements'] });
}

export function useCreditSituations(ids?: string[]) {
  return useQuery({
    queryKey: ['credit-situations', ids ?? 'tous'],
    queryFn: () => getSituationsCredits(ids),
  });
}

export function useCreditRemboursements(creditId: string | null) {
  return useQuery({
    queryKey: ['credit-remboursements', creditId],
    queryFn: () => listRemboursements(creditId as string),
    enabled: !!creditId,
  });
}

export function useEnregistrerRemboursement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ creditId, payload }: { creditId: string; payload: CreateRemboursementPayload }) =>
      enregistrerRemboursement(creditId, payload),
    onSuccess: () => invalidateRemb(qc),
  });
}

export function useAnnulerRemboursement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rembId, motif }: { rembId: string; motif?: string }) => annulerRemboursement(rembId, motif),
    onSuccess: () => invalidateRemb(qc),
  });
}

/** Exporte les crédits filtrés vers Excel (mêmes filtres que la liste à l'écran). */
export async function exportCredits(
  filters: CreditsFilters & { statut?: string; enRetard?: boolean } = {},
): Promise<void> {
  const params: Record<string, string> = {};
  if (filters.dateFrom) params.dateFrom = filters.dateFrom;
  if (filters.dateTo) params.dateTo = filters.dateTo;
  if (filters.directionId) params.directionId = filters.directionId;
  if (filters.statut && filters.statut !== 'TOUTES') params.statut = filters.statut;
  if (filters.enRetard) params.enRetard = 'true';
  if (filters.sortBy) params.sortBy = filters.sortBy;
  if (filters.sortDir) params.sortDir = filters.sortDir;
  const { data } = await api.get('/credits/export', { params, responseType: 'blob' });
  const url = URL.createObjectURL(data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `credits_${filters.dateFrom || 'tout'}_au_${filters.dateTo || 'tout'}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Révocation différée : révoquer juste après click() annule le téléchargement
  // dans certains navigateurs.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
