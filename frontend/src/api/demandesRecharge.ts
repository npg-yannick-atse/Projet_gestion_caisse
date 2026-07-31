import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { DemandeRecharge, DemandeRechargeStatut, Portefeuille } from '@/types/api';

export interface CreateDemandeRechargePayload {
  montant: string;
  motif?: string;
  portefeuilleId?: string;
}

export interface DemandesRechargeFilters {
  statut?: DemandeRechargeStatut;
  search?: string;
  /** Date de création minimale (YYYY-MM-DD, incluse) — filtrée en base. */
  dateFrom?: string;
  /** Date de création maximale (YYYY-MM-DD, incluse) — filtrée en base. */
  dateTo?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export async function listDemandesRecharge(
  filters: DemandesRechargeFilters | DemandeRechargeStatut = {},
): Promise<DemandeRecharge[]> {
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
  const { data } = await api.get<DemandeRecharge[]>('/demandes-recharge', { params });
  return data;
}

export async function createDemandeRecharge(payload: CreateDemandeRechargePayload): Promise<DemandeRecharge> {
  const { data } = await api.post<DemandeRecharge>('/demandes-recharge', payload);
  return data;
}

export async function traiterDemandeRecharge(id: string, montant?: string): Promise<DemandeRecharge> {
  const { data } = await api.post<DemandeRecharge>(`/demandes-recharge/${id}/traiter`, montant ? { montant } : {});
  return data;
}

export async function rejeterDemandeRecharge(id: string, commentaire?: string): Promise<DemandeRecharge> {
  const { data } = await api.post<DemandeRecharge>(`/demandes-recharge/${id}/rejeter`, commentaire ? { commentaire } : {});
  return data;
}

export async function annulerDemandeRecharge(id: string): Promise<DemandeRecharge> {
  const { data } = await api.post<DemandeRecharge>(`/demandes-recharge/${id}/annuler`, {});
  return data;
}

export async function listMesPortefeuillesRechargeables(): Promise<Portefeuille[]> {
  const { data } = await api.get<Portefeuille[]>('/demandes-recharge/mes-portefeuilles');
  return data;
}

export function useMesPortefeuillesRechargeables(enabled = true) {
  return useQuery({
    queryKey: ['demandes-recharge', 'mes-portefeuilles'],
    queryFn: listMesPortefeuillesRechargeables,
    enabled,
  });
}

export function useDemandesRecharge(
  filters: DemandesRechargeFilters | DemandeRechargeStatut = {},
) {
  const key =
    typeof filters === 'string'
      ? { statut: filters }
      : filters && Object.keys(filters).length > 0
        ? filters
        : 'all';
  return useQuery({
    queryKey: ['demandes-recharge', key],
    queryFn: () => listDemandesRecharge(filters),
  });
}

function useDemandeRechargeMutation<TVars>(fn: (vars: TVars) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['demandes-recharge'] });
      // La recharge modifie aussi opérations et soldes.
      qc.invalidateQueries({ queryKey: ['operations'] });
      qc.invalidateQueries({ queryKey: ['portefeuille'] });
    },
  });
}

export function useCreateDemandeRecharge() {
  return useDemandeRechargeMutation((payload: CreateDemandeRechargePayload) => createDemandeRecharge(payload));
}

export function useTraiterDemandeRecharge() {
  return useDemandeRechargeMutation(({ id, montant }: { id: string; montant?: string }) =>
    traiterDemandeRecharge(id, montant),
  );
}

export function useRejeterDemandeRecharge() {
  return useDemandeRechargeMutation(({ id, commentaire }: { id: string; commentaire?: string }) =>
    rejeterDemandeRecharge(id, commentaire),
  );
}

export function useAnnulerDemandeRecharge() {
  return useDemandeRechargeMutation((id: string) => annulerDemandeRecharge(id));
}
