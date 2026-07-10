import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CreateDirectionPayload, Direction } from '@/types/api';

export async function listDirections(): Promise<Direction[]> {
  const { data } = await api.get<Direction[]>('/directions');
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

export function useDirections() {
  return useQuery({ queryKey: ['directions'], queryFn: listDirections });
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
