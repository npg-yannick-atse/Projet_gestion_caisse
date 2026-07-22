import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CreateDirectionPayload, Direction } from '@/types/api';

export interface DirectionsFilters {
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export async function listDirections(filters: DirectionsFilters = {}): Promise<Direction[]> {
  const params: Record<string, string> = {};
  if (filters.search) params.search = filters.search;
  if (filters.sortBy) params.sortBy = filters.sortBy;
  if (filters.sortDir) params.sortDir = filters.sortDir;
  const { data } = await api.get<Direction[]>('/directions', { params });
  return data;
}

export async function createDirection(payload: CreateDirectionPayload): Promise<Direction> {
  const { data } = await api.post<Direction>('/directions', payload);
  return data;
}

export async function updateDirection(
  id: string,
  payload: Partial<CreateDirectionPayload>,
): Promise<Direction> {
  const { data } = await api.patch<Direction>(`/directions/${id}`, payload);
  return data;
}

export async function deleteDirection(id: string): Promise<void> {
  await api.delete(`/directions/${id}`);
}

export function useDirections(filters: DirectionsFilters = {}) {
  return useQuery({ queryKey: ['directions', filters], queryFn: () => listDirections(filters) });
}

export function useCreateDirection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createDirection,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['directions'] }),
  });
}

export function useUpdateDirection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateDirectionPayload> }) =>
      updateDirection(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['directions'] }),
  });
}

export function useDeleteDirection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteDirection,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['directions'] }),
  });
}
