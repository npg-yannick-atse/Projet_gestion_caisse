import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Permission, Role } from '@/types/api';

export async function listRoles(): Promise<Role[]> {
  const { data } = await api.get<Role[]>('/roles');
  return data;
}

export async function listPermissions(): Promise<Permission[]> {
  const { data } = await api.get<Permission[]>('/roles/permissions/list');
  return data;
}

export async function getRolePermissions(roleId: string): Promise<Permission[]> {
  const { data } = await api.get<Permission[]>(`/roles/${roleId}/permissions`);
  return data;
}

export async function assignPermission(roleId: string, permissionId: string): Promise<void> {
  await api.post(`/roles/${roleId}/permissions/${permissionId}`);
}

export async function removePermission(roleId: string, permissionId: string): Promise<void> {
  await api.delete(`/roles/${roleId}/permissions/${permissionId}`);
}

export function useRoles() {
  return useQuery({ queryKey: ['roles'], queryFn: listRoles });
}

export function usePermissions() {
  return useQuery({ queryKey: ['permissions'], queryFn: listPermissions });
}

export function useRolePermissions(roleId: string | null) {
  return useQuery({
    queryKey: ['role', roleId, 'permissions'],
    queryFn: () => getRolePermissions(roleId!),
    enabled: !!roleId,
  });
}

export function useTogglePermission(roleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ permissionId, assigned }: { permissionId: string; assigned: boolean }) =>
      assigned ? removePermission(roleId, permissionId) : assignPermission(roleId, permissionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['role', roleId, 'permissions'] }),
  });
}
