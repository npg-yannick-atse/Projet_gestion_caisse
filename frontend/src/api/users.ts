import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CreateUserPayload, ProfilAttribue, Role, User } from '@/types/api';

export interface UsersFilters {
  /** Recherche en base sur nom, prénom, matricule et email. */
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  /** 'ACTIF' | 'INACTIF' — absent = les deux. */
  statut?: StatutUtilisateur;
}

export type StatutUtilisateur = 'ACTIF' | 'INACTIF';

export async function listUsers(filters: UsersFilters = {}): Promise<User[]> {
  const params: Record<string, string> = {};
  if (filters.search) params.search = filters.search;
  if (filters.sortBy) params.sortBy = filters.sortBy;
  if (filters.sortDir) params.sortDir = filters.sortDir;
  if (filters.statut) params.statut = filters.statut;
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

export async function getUserProfils(userId: string): Promise<ProfilAttribue[]> {
  const { data } = await api.get<ProfilAttribue[]>(`/users/${userId}/profils`);
  return data;
}

/** Période optionnelle : sans elle, le profil est permanent (comportement d'origine). */
export async function assignUserProfil(
  userId: string,
  profilId: string,
  validite?: { dateDebut?: string | null; dateFin?: string | null },
): Promise<void> {
  await api.post(`/users/${userId}/profils/${profilId}`, validite ?? {});
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

/* Affectation par ENSEMBLE : « tout sélectionner » sur 182 natures ferait
   sinon 182 requêtes, dont l'échec de la centième laisserait un état à moitié
   appliqué. Une seule requête porte la sélection complète. */

async function setPerimetre(userId: string, chemin: string, ids: string[]): Promise<string[]> {
  const { data } = await api.put<string[]>(`/users/${userId}/${chemin}`, { ids });
  return data;
}

export function useSetUserDivisions(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => setPerimetre(userId, 'divisions', ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user', userId, 'divisions'] }),
  });
}

export function useSetUserNaturesOperation(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => setPerimetre(userId, 'natures-operation', ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user', userId, 'natures-operation'] }),
  });
}

export function useSetUserCostCenters(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => setPerimetre(userId, 'cost-centers', ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user', userId, 'cost-centers'] }),
  });
}

export function useToggleUserProfil(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      profilId,
      assigned,
      dateFin,
    }: {
      profilId: string;
      assigned: boolean;
      dateFin?: string | null;
    }) =>
      assigned ? removeUserProfil(userId, profilId) : assignUserProfil(userId, profilId, { dateFin }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user', userId, 'profils'] }),
  });
}

/** Change la seule échéance d'un profil déjà attribué, sans le retirer. */
export function useSetProfilEcheance(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ profilId, dateFin }: { profilId: string; dateFin: string | null }) =>
      assignUserProfil(userId, profilId, { dateFin }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user', userId, 'profils'] }),
  });
}

// ---------- Accès division (restitutions) ----------

export async function listUserDivisions(userId: string): Promise<string[]> {
  const { data } = await api.get<string[]>(`/users/${userId}/divisions`);
  return data;
}

export function useUserDivisions(userId: string | null) {
  return useQuery({
    queryKey: ['user', userId, 'divisions'],
    queryFn: () => listUserDivisions(userId!),
    enabled: !!userId,
  });
}

export function useToggleUserDivision(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ divisionId, has }: { divisionId: string; has: boolean }) =>
      has
        ? api.delete(`/users/${userId}/divisions/${divisionId}`)
        : api.post(`/users/${userId}/divisions/${divisionId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user', userId, 'divisions'] }),
  });
}

// ---------- Centres de coût autorisés (imputation des bons) ----------

/**
 * Centres accordés EN PROPRE. Le périmètre réel y ajoute ceux de la direction
 * de l'utilisateur et son centre principal : cette liste dit ce qu'on lui a
 * donné en plus, pas tout ce qu'il peut imputer.
 */
export async function listUserCostCenters(userId: string): Promise<string[]> {
  const { data } = await api.get<string[]>(`/users/${userId}/cost-centers`);
  return data;
}

export function useUserCostCenters(userId: string | null) {
  return useQuery({
    queryKey: ['user', userId, 'cost-centers'],
    queryFn: () => listUserCostCenters(userId!),
    enabled: !!userId,
  });
}

export function useToggleUserCostCenter(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ costCenterId, has }: { costCenterId: string; has: boolean }) =>
      has
        ? api.delete(`/users/${userId}/cost-centers/${costCenterId}`)
        : api.post(`/users/${userId}/cost-centers/${costCenterId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user', userId, 'cost-centers'] }),
  });
}

// ---------- Natures d'opération autorisées (création de bons) ----------

export async function listUserNaturesOperation(userId: string): Promise<string[]> {
  const { data } = await api.get<string[]>(`/users/${userId}/natures-operation`);
  return data;
}

export function useUserNaturesOperation(userId: string | null) {
  return useQuery({
    queryKey: ['user', userId, 'natures-operation'],
    queryFn: () => listUserNaturesOperation(userId!),
    enabled: !!userId,
  });
}

export function useToggleUserNatureOperation(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ natureId, has }: { natureId: string; has: boolean }) =>
      has
        ? api.delete(`/users/${userId}/natures-operation/${natureId}`)
        : api.post(`/users/${userId}/natures-operation/${natureId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user', userId, 'natures-operation'] }),
  });
}
