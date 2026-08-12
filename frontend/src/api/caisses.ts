import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  Caisse,
  CreateCaissePayload,
  SessionCaisse,
  SoldeConsolideResponse,
  SoldeResponse,
  UpdateCaissePayload,
} from '@/types/api';

export async function listCaisses(): Promise<Caisse[]> {
  const { data } = await api.get<Caisse[]>('/caisses');
  return data;
}

export async function createCaisse(payload: CreateCaissePayload): Promise<Caisse> {
  const { data } = await api.post<Caisse>('/caisses', payload);
  return data;
}

export async function updateCaisse(id: string, payload: UpdateCaissePayload): Promise<Caisse> {
  const { data } = await api.patch<Caisse>(`/caisses/${id}`, payload);
  return data;
}

export async function deleteCaisse(id: string): Promise<void> {
  await api.delete(`/caisses/${id}`);
}

export async function getCaisseSolde(id: string): Promise<SoldeResponse> {
  const { data } = await api.get<SoldeResponse>(`/caisses/${id}/solde`);
  return data;
}

export async function getCaisseSoldeConsolide(id: string): Promise<SoldeConsolideResponse> {
  const { data } = await api.get<SoldeConsolideResponse>(`/caisses/${id}/solde-consolide`);
  return data;
}

export async function getCaisseSessions(id: string): Promise<SessionCaisse[]> {
  const { data } = await api.get<SessionCaisse[]>(`/caisses/${id}/sessions`);
  return data;
}

export async function openCaisse(id: string, soldeOuverture?: string): Promise<SessionCaisse> {
  const { data } = await api.post<SessionCaisse>(`/caisses/${id}/ouvrir`, { soldeOuverture });
  return data;
}

export async function closeCaisse(id: string, soldeCloture?: string): Promise<SessionCaisse> {
  const { data } = await api.post<SessionCaisse>(`/caisses/${id}/cloturer`, { soldeCloture });
  return data;
}

export function useCaisses() {
  return useQuery({ queryKey: ['caisses'], queryFn: listCaisses });
}

export function useCreateCaisse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createCaisse,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['caisses'] }),
  });
}

export function useUpdateCaisse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateCaissePayload }) => updateCaisse(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['caisses'] }),
  });
}

export function useDeleteCaisse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteCaisse,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['caisses'] }),
  });
}

export async function toggleCaisseActive(id: string, estActif: boolean): Promise<Caisse> {
  const { data } = await api.patch<Caisse>(`/caisses/${id}/toggle-active`, { estActif });
  return data;
}

export function useToggleCaisseActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, estActif }: { id: string; estActif: boolean }) =>
      toggleCaisseActive(id, estActif),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['caisses'] }),
  });
}

export function useCaisseSolde(id: string) {
  return useQuery({ queryKey: ['caisse', id, 'solde'], queryFn: () => getCaisseSolde(id) });
}

/**
 * Total converti dans la devise de référence. Sous la clé ['caisse', id, …]
 * comme les autres soldes : le rafraîchissement périodique de CaissesPage
 * invalide déjà ce préfixe, donc le total ne se fige pas derrière les soldes.
 */
export function useCaisseSoldeConsolide(id: string, enabled = true) {
  return useQuery({
    queryKey: ['caisse', id, 'solde-consolide'],
    queryFn: () => getCaisseSoldeConsolide(id),
    enabled,
  });
}

export interface SoldePoint {
  date: string;
  solde: number;
}

export async function getCaisseSoldeTimeline(id: string, days = 30): Promise<SoldePoint[]> {
  const { data } = await api.get<SoldePoint[]>(`/caisses/${id}/solde-timeline`, { params: { days } });
  return data;
}

export function useCaisseSoldeTimeline(id: string | null, days = 30) {
  return useQuery({
    queryKey: ['caisse', id, 'solde-timeline', days],
    queryFn: () => getCaisseSoldeTimeline(id as string, days),
    enabled: !!id,
  });
}

export interface FluxPoint {
  date: string;
  entrees: number;
  sorties: number;
}

export async function getCaisseFluxTimeline(id: string, days = 30): Promise<FluxPoint[]> {
  const { data } = await api.get<FluxPoint[]>(`/caisses/${id}/flux-timeline`, { params: { days } });
  return data;
}

export function useCaisseFluxTimeline(id: string | null, days = 30) {
  return useQuery({
    queryKey: ['caisse', id, 'flux-timeline', days],
    queryFn: () => getCaisseFluxTimeline(id as string, days),
    enabled: !!id,
  });
}

export function useOpenCaisse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, soldeOuverture }: { id: string; soldeOuverture?: string }) =>
      openCaisse(id, soldeOuverture),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['caisses'] }),
  });
}

export function useCloseCaisse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, soldeCloture }: { id: string; soldeCloture?: string }) =>
      closeCaisse(id, soldeCloture),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['caisses'] }),
  });
}
