import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Caisse, CreateCaissePayload, SessionCaisse, SoldeResponse, UpdateCaissePayload } from '@/types/api';

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
