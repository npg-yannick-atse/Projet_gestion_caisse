import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  CreatePortefeuillePayload,
  Devise,
  Portefeuille,
  SoldeResponse,
  UpdatePortefeuillePayload,
} from '@/types/api';

export async function listDevises(includeInactive = false): Promise<Devise[]> {
  const { data } = await api.get<Devise[]>('/devises', {
    // Filtre appliqué EN BASE : l'écran d'administration a besoin de voir les
    // devises désactivées pour les réactiver, les autres écrans non.
    params: includeInactive ? { includeInactive: 'true' } : undefined,
  });
  return data;
}

export type DevisePayload = {
  code?: string;
  libelle?: string;
  symbole?: string | null;
  nbDecimales?: number;
  estActif?: boolean;
};

export async function createDevise(payload: DevisePayload): Promise<Devise> {
  const { data } = await api.post<Devise>('/devises', payload);
  return data;
}

export async function updateDevise(id: string, payload: DevisePayload): Promise<Devise> {
  const { data } = await api.patch<Devise>(`/devises/${id}`, payload);
  return data;
}

export async function listPortefeuilles(caisseId?: string): Promise<Portefeuille[]> {
  const { data } = await api.get<Portefeuille[]>('/portefeuilles', {
    params: caisseId ? { caisseId } : undefined,
  });
  return data;
}

export async function createPortefeuille(payload: CreatePortefeuillePayload): Promise<Portefeuille> {
  const { data } = await api.post<Portefeuille>('/portefeuilles', payload);
  return data;
}

export async function updatePortefeuille(id: string, payload: UpdatePortefeuillePayload): Promise<Portefeuille> {
  const { data } = await api.patch<Portefeuille>(`/portefeuilles/${id}`, payload);
  return data;
}

export async function deletePortefeuille(id: string): Promise<void> {
  await api.delete(`/portefeuilles/${id}`);
}

export async function getPortefeuilleSolde(id: string): Promise<SoldeResponse> {
  const { data } = await api.get<SoldeResponse>(`/portefeuilles/${id}/solde`);
  return data;
}

export function usePortefeuilleSolde(id: string) {
  return useQuery({ queryKey: ['portefeuille', id, 'solde'], queryFn: () => getPortefeuilleSolde(id) });
}

export function useDevises(includeInactive = false) {
  return useQuery({
    queryKey: ['devises', includeInactive ? 'toutes' : 'actives'],
    queryFn: () => listDevises(includeInactive),
  });
}

export function useCreateDevise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: DevisePayload) => createDevise(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devises'] }),
  });
}

export function useUpdateDevise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: DevisePayload }) => updateDevise(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devises'] }),
  });
}

export function usePortefeuilles(caisseId?: string) {
  return useQuery({
    queryKey: ['portefeuilles', caisseId ?? 'all'],
    queryFn: () => listPortefeuilles(caisseId),
  });
}

export function useCreatePortefeuille() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createPortefeuille,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portefeuilles'] }),
  });
}

export function useUpdatePortefeuille() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdatePortefeuillePayload }) =>
      updatePortefeuille(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portefeuilles'] }),
  });
}

export function useDeletePortefeuille() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deletePortefeuille,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portefeuilles'] }),
  });
}

export async function togglePortefeuilleActive(id: string, estActif: boolean): Promise<Portefeuille> {
  const { data } = await api.patch<Portefeuille>(`/portefeuilles/${id}/toggle-active`, { estActif });
  return data;
}

export function useTogglePortefeuilleActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, estActif }: { id: string; estActif: boolean }) =>
      togglePortefeuilleActive(id, estActif),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portefeuilles'] }),
  });
}
