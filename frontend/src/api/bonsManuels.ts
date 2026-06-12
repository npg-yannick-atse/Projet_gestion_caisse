import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  BonManuel,
  Carnet,
  CarnetStatut,
  CreateBonManuelPayload,
  CreateCarnetPayload,
} from '@/types/api';

// ---------- Carnets ----------

export async function listCarnets(statut?: CarnetStatut): Promise<Carnet[]> {
  const { data } = await api.get<Carnet[]>('/carnets', { params: statut ? { statut } : undefined });
  return data;
}

export function useCarnets(statut?: CarnetStatut) {
  return useQuery({ queryKey: ['carnets', statut ?? 'all'], queryFn: () => listCarnets(statut) });
}

export async function createCarnet(payload: CreateCarnetPayload): Promise<Carnet> {
  const { data } = await api.post<Carnet>('/carnets', payload);
  return data;
}

export function useCreateCarnet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createCarnet,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['carnets'] }),
  });
}

export function useCloturerCarnet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch<Carnet>(`/carnets/${id}/cloturer`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['carnets'] }),
  });
}

// ---------- Bons manuels ----------

export async function listBonsManuels(): Promise<BonManuel[]> {
  const { data } = await api.get<BonManuel[]>('/bons-manuels');
  return data;
}

export function useBonsManuels() {
  return useQuery({ queryKey: ['bons-manuels'], queryFn: listBonsManuels });
}

export async function createBonManuel(payload: CreateBonManuelPayload): Promise<BonManuel> {
  const { data } = await api.post<BonManuel>('/bons-manuels', payload);
  return data;
}

export function useCreateBonManuel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createBonManuel,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bons-manuels'] });
      qc.invalidateQueries({ queryKey: ['carnets'] });
      qc.invalidateQueries({ queryKey: ['operations'] });
    },
  });
}
