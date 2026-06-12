import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Bon, CreateBonPayload, SousBon, ValidateBonPayload } from '../types';

export interface MyBonsFilter {
  dateFrom?: string;
  dateTo?: string;
}

/** Bons dont l'utilisateur est le demandeur (filtré côté serveur : demandeur + plage de dates). */
export async function getMyBons(demandeurId: string, filter: MyBonsFilter = {}): Promise<Bon[]> {
  const params: Record<string, string> = { demandeurId };
  if (filter.dateFrom) params.dateFrom = filter.dateFrom;
  if (filter.dateTo) params.dateTo = filter.dateTo;
  const { data } = await api.get<Bon[]>('/bons', { params });
  return data;
}

export function useMyBons(demandeurId: string | null | undefined, filter: MyBonsFilter = {}) {
  return useQuery<Bon[]>({
    queryKey: ['my-bons', demandeurId, filter.dateFrom ?? '', filter.dateTo ?? ''],
    queryFn: () => getMyBons(demandeurId as string, filter),
    enabled: !!demandeurId,
  });
}

export async function createBon(payload: CreateBonPayload): Promise<Bon> {
  const { data } = await api.post<Bon>('/bons', payload);
  return data;
}

export function useCreateBon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createBon,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-bons'] }),
  });
}

// ---- Détail + validation ----

/** Bons en attente de validation visibles par l'utilisateur (restriction serveur par rôle). */
export async function getBonsAValider(): Promise<Bon[]> {
  const { data } = await api.get<Bon[]>('/bons', { params: { statut: 'CREE' } });
  return data;
}

export function useBonsAValider(enabled = true) {
  return useQuery<Bon[]>({
    queryKey: ['bons-a-valider'],
    queryFn: getBonsAValider,
    enabled,
    // Polling « cloche » : rafraîchit la file toutes les 30 s.
    refetchInterval: 30000,
  });
}

export async function getBon(id: string): Promise<Bon> {
  const { data } = await api.get<Bon>(`/bons/${id}`);
  return data;
}

export function useBon(id: string) {
  return useQuery<Bon>({ queryKey: ['bon', id], queryFn: () => getBon(id), enabled: !!id });
}

export async function getSousBons(id: string): Promise<SousBon[]> {
  const { data } = await api.get<SousBon[]>(`/bons/${id}/soubons`);
  return data;
}

export function useSousBons(id: string) {
  return useQuery<SousBon[]>({ queryKey: ['bon', id, 'soubons'], queryFn: () => getSousBons(id), enabled: !!id });
}

export async function validateBon(id: string, payload: ValidateBonPayload): Promise<Bon> {
  const { data } = await api.post<Bon>(`/bons/${id}/validate`, payload);
  return data;
}

export function useValidateBon(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ValidateBonPayload) => validateBon(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bon', id] });
      qc.invalidateQueries({ queryKey: ['my-bons'] });
      qc.invalidateQueries({ queryKey: ['bons-a-valider'] });
    },
  });
}
