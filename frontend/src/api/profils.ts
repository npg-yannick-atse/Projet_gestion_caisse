import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Permission, Profil } from '@/types/api';

export interface CreateProfilPayload {
  code: string;
  libelle: string;
  description?: string;
  estActif?: boolean;
}

export type UpdateProfilPayload = Partial<CreateProfilPayload>;

export async function listProfils(): Promise<Profil[]> {
  const { data } = await api.get<Profil[]>('/profils');
  return data;
}

export async function createProfil(payload: CreateProfilPayload): Promise<Profil> {
  const { data } = await api.post<Profil>('/profils', payload);
  return data;
}

export async function updateProfil(id: string, payload: UpdateProfilPayload): Promise<Profil> {
  const { data } = await api.patch<Profil>(`/profils/${id}`, payload);
  return data;
}

export async function deleteProfil(id: string): Promise<void> {
  await api.delete(`/profils/${id}`);
}

export async function getProfilPermissions(profilId: string): Promise<Permission[]> {
  const { data } = await api.get<Permission[]>(`/profils/${profilId}/permissions`);
  return data;
}

export async function assignProfilPermission(profilId: string, permissionId: string): Promise<void> {
  await api.post(`/profils/${profilId}/permissions/${permissionId}`);
}

export async function removeProfilPermission(profilId: string, permissionId: string): Promise<void> {
  await api.delete(`/profils/${profilId}/permissions/${permissionId}`);
}

export function useProfils() {
  return useQuery({ queryKey: ['profils'], queryFn: listProfils });
}

export function useCreateProfil() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createProfil,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profils'] }),
  });
}

/**
 * Crée un profil portant les permissions d'un rôle. C'est un POINT DE DÉPART,
 * pas un lien : le profil ne suivra pas les évolutions du rôle.
 */
export function useGenererProfilDepuisRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, code, libelle }: { roleId: string; code: string; libelle: string }) =>
      api.post(`/profils/generer-depuis-role/${roleId}`, { code, libelle }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profils'] }),
  });
}

/**
 * Rassemble en un profil TOUTES les permissions effectives d'un utilisateur
 * — rôles, profils, permissions individuelles, intérims en cours — pour les
 * attribuer ensuite à quelqu'un d'autre.
 */
export function useGenererProfilDepuisUtilisateur() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, code, libelle }: { userId: string; code: string; libelle: string }) =>
      api.post(`/profils/generer-depuis-utilisateur/${userId}`, { code, libelle }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profils'] }),
  });
}

export function useUpdateProfil() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateProfilPayload }) =>
      updateProfil(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profils'] }),
  });
}

export function useDeleteProfil() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteProfil,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profils'] }),
  });
}

export function useProfilPermissions(profilId: string | null) {
  return useQuery({
    queryKey: ['profil', profilId, 'permissions'],
    queryFn: () => getProfilPermissions(profilId!),
    enabled: !!profilId,
  });
}

export function useToggleProfilPermission(profilId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ permissionId, assigned }: { permissionId: string; assigned: boolean }) =>
      assigned
        ? removeProfilPermission(profilId, permissionId)
        : assignProfilPermission(profilId, permissionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profil', profilId, 'permissions'] }),
  });
}
