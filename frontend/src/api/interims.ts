import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CreateInterimPayload, Interim, InterimStatut } from '@/types/api';

export async function listInterims(statut?: InterimStatut): Promise<Interim[]> {
  const { data } = await api.get<Interim[]>('/interims', {
    params: statut ? { statut } : undefined,
  });
  return data;
}

/** Intérims où je suis initiateur (mes délégations). Ne demande aucune permission. */
export async function listMesInterimsInities(): Promise<Interim[]> {
  const { data } = await api.get<Interim[]>('/interims/by-initiator');
  return data;
}

/** Intérims où je suis remplaçant (je remplace quelqu'un). Ne demande aucune permission. */
export async function listMesInterimsRemplaces(): Promise<Interim[]> {
  const { data } = await api.get<Interim[]>('/interims/by-remplacant');
  return data;
}

export async function createInterim(payload: CreateInterimPayload): Promise<Interim> {
  const { data } = await api.post<Interim>('/interims', payload);
  return data;
}

export async function revokeInterim(id: string): Promise<Interim> {
  const { data } = await api.post<Interim>(`/interims/${id}/revoke`, {});
  return data;
}

export function useInterims(statut?: InterimStatut, enabled = true) {
  return useQuery({
    queryKey: ['interims', statut ?? 'all'],
    queryFn: () => listInterims(statut),
    enabled,
  });
}

/**
 * Vue personnelle : mes délégations + celles où je remplace quelqu'un.
 * Utilisée quand l'utilisateur n'a pas INTERIM_VOIR (pas de vision transverse).
 */
export function useMesInterims(enabled = true) {
  const inities = useQuery({
    queryKey: ['interims', 'mine', 'inities'],
    queryFn: listMesInterimsInities,
    enabled,
  });
  const remplaces = useQuery({
    queryKey: ['interims', 'mine', 'remplaces'],
    queryFn: listMesInterimsRemplaces,
    enabled,
  });
  // Un même intérim ne peut pas apparaître dans les deux listes (on ne se remplace
  // pas soi-même), mais on déduplique par sécurité.
  const data = enabled
    ? [...new Map([...(inities.data ?? []), ...(remplaces.data ?? [])].map((i) => [i.id, i])).values()]
    : undefined;
  return { data, isLoading: inities.isLoading || remplaces.isLoading };
}

export function useCreateInterim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createInterim,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['interims'] }),
  });
}

export function useRevokeInterim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: revokeInterim,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['interims'] }),
  });
}
