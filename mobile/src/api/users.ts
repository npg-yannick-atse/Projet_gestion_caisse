import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Role } from '../types';

/** Rôles effectifs de l'utilisateur (assignés + délégués par un intérim actif). */
export async function getEffectiveRoles(userId: string): Promise<Role[]> {
  const { data } = await api.get<Role[]>(`/users/${userId}/effective-roles`);
  return data;
}

export function useEffectiveRoles(userId: string | null | undefined) {
  return useQuery<Role[]>({
    queryKey: ['user', userId, 'effective-roles'],
    queryFn: () => getEffectiveRoles(userId as string),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}
