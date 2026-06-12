import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CreateUserPayload, Profil, Role, User } from '@/types/api';

export interface UsersFilters {
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export async function listUsers(filters: UsersFilters = {}): Promise<User[]> {
  const params: Record<string, string> = {};
  if (filters.sortBy) params.sortBy = filters.sortBy;
  if (filters.sortDir) params.sortDir = filters.sortDir;
  const { data } = await api.get<User[]>('/users', { params });
  return data;
}

export async function createUser(payload: CreateUserPayload): Promise<User> {
  const { data } = await api.post<User>('/users', payload);
  return data;
}

export async function deleteUser(id: string): Promise<void> {
  await api.delete(`/users/${id}`);
}

export type UpdateUserPayload = Partial<{
  nom: string;
  prenom: string;
  email: string;
  telephone: string | null;
  directionId: string | null;
  estActif: boolean;
  accesWeb: boolean;
  accesMobile: boolean;
}>;

export async function updateUser(id: string, payload: UpdateUserPayload): Promise<User> {
  const { data } = await api.patch<User>(`/users/${id}`, payload);
  return data;
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateUserPayload }) => updateUser(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export async function getUserRoles(userId: string): Promise<Role[]> {
  const { data } = await api.get<Role[]>(`/users/${userId}/roles`);
  return data;
}

/** Rôles effectifs = assignés + délégués par un intérim actif. */
export async function getUserEffectiveRoles(userId: string): Promise<Role[]> {
  const { data } = await api.get<Role[]>(`/users/${userId}/effective-roles`);
  return data;
}

/** Permissions effectives (codes) de l'utilisateur : rôles + profils + extra + intérim. */
export async function getUserPermissions(userId: string): Promise<string[]> {
  const { data } = await api.get<string[]>(`/users/${userId}/permissions`);
  return data;
}

export async function assignUserRole(userId: string, roleId: string): Promise<void> {
  await api.post(`/users/${userId}/roles/${roleId}`);
}

export async function removeUserRole(userId: string, roleId: string): Promise<void> {
  await api.delete(`/users/${userId}/roles/${roleId}`);
}

export function useUsers(filters: UsersFilters = {}) {
  const key = Object.keys(filters).length > 0 ? filters : 'all';
  return useQuery({ queryKey: ['users', key], queryFn: () => listUsers(filters) });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createUser,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteUser,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

/**
 * Rôles EFFECTIFS de l'utilisateur (assignés + délégués par intérim).
 * À utiliser pour le gating UI (menu, gardes, dashboards) de l'utilisateur connecté.
 */
export function useUserRoles(userId: string | null) {
  return useQuery({
    queryKey: ['user', userId, 'roles', 'effective'],
    queryFn: () => getUserEffectiveRoles(userId!),
    enabled: !!userId,
  });
}

/** Rôles ASSIGNÉS uniquement — pour la gestion (écran Utilisateurs). */
export function useUserAssignedRoles(userId: string | null) {
  return useQuery({
    queryKey: ['user', userId, 'roles', 'assigned'],
    queryFn: () => getUserRoles(userId!),
    enabled: !!userId,
  });
}

/** Permissions effectives de l'utilisateur connecté (pour le gating UI). */
export function useMyPermissions(userId: string | null) {
  return useQuery({
    queryKey: ['user', userId, 'permissions'],
    queryFn: () => getUserPermissions(userId!),
    enabled: !!userId,
  });
}

export function useToggleUserRole(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, assigned }: { roleId: string; assigned: boolean }) =>
      assigned ? removeUserRole(userId, roleId) : assignUserRole(userId, roleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user', userId, 'roles'] }),
  });
}

// ---------- Profils d'un utilisateur ----------

export async function getUserProfils(userId: string): Promise<Profil[]> {
  const { data } = await api.get<Profil[]>(`/users/${userId}/profils`);
  return data;
}

export async function assignUserProfil(userId: string, profilId: string): Promise<void> {
  await api.post(`/users/${userId}/profils/${profilId}`);
}

export async function removeUserProfil(userId: string, profilId: string): Promise<void> {
  await api.delete(`/users/${userId}/profils/${profilId}`);
}

export function useUserProfils(userId: string | null) {
  return useQuery({
    queryKey: ['user', userId, 'profils'],
    queryFn: () => getUserProfils(userId!),
    enabled: !!userId,
  });
}

export function useToggleUserProfil(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ profilId, assigned }: { profilId: string; assigned: boolean }) =>
      assigned ? removeUserProfil(userId, profilId) : assignUserProfil(userId, profilId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user', userId, 'profils'] }),
  });
}
