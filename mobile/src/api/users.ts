import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Role } from '../types';

/** Rôles effectifs de l'utilisateur (assignés + délégués par un intérim actif). */
export async function getEffectiveRoles(userId: string): Promise<Role[]> {
  const { data } = await api.get<Role[]>(`/users/${userId}/effective-roles`);
  return data;
}

/**
 * Rôles réellement ATTRIBUÉS, sans dépliage.
 *
 * À préférer pour montrer à quelqu'un sa propre fonction : les rôles effectifs
 * sont dépliés côté serveur — un DAF y apparaît aussi Administrateur et
 * Caissier, ce qu'il ne se reconnaîtrait pas. Pour décider d'un affichage ou
 * d'un droit, c'est l'inverse : ce sont les rôles effectifs qui font foi.
 */
export async function getAssignedRoles(userId: string): Promise<Role[]> {
  const { data } = await api.get<Role[]>(`/users/${userId}/roles`);
  return data;
}

export function useAssignedRoles(userId: string | null | undefined) {
  return useQuery<Role[]>({
    queryKey: ['user', userId, 'roles'],
    queryFn: () => getAssignedRoles(userId as string),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useEffectiveRoles(userId: string | null | undefined) {
  return useQuery<Role[]>({
    queryKey: ['user', userId, 'effective-roles'],
    queryFn: () => getEffectiveRoles(userId as string),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}
