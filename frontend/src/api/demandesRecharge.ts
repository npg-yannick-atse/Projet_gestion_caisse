import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { DemandeRecharge, DemandeRechargeStatut, Portefeuille } from '@/types/api';

export interface CreateDemandeRechargePayload {
  montant: string;
  motif?: string;
  portefeuilleId?: string;
}

export async function listDemandesRecharge(statut?: DemandeRechargeStatut): Promise<DemandeRecharge[]> {
  const { data } = await api.get<DemandeRecharge[]>('/demandes-recharge', {
    params: statut ? { statut } : undefined,
  });
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

export function useDemandesRecharge(statut?: DemandeRechargeStatut) {
  return useQuery({
    queryKey: ['demandes-recharge', statut ?? 'all'],
    queryFn: () => listDemandesRecharge(statut),
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
      qc.invalidateQueries({ queryKey: ['portefeuille-solde'] });
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
