import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  CreateEmployeBeneficePayload,
  CreateEmployePayload,
  CreateTypeBeneficePayload,
  Employe,
  EmployeBenefice,
  TypeBenefice,
  UpdateEmployeBeneficePayload,
  UpdateEmployePayload,
} from '@/types/api';

/* ------------------------------------------------------------- Employés -- */

export interface EmployesFilters {
  search?: string;
  directionId?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export async function listEmployes(filters: EmployesFilters = {}): Promise<Employe[]> {
  const params: Record<string, string> = {};
  if (filters.search) params.search = filters.search;
  if (filters.directionId) params.directionId = filters.directionId;
  if (filters.sortBy) params.sortBy = filters.sortBy;
  if (filters.sortDir) params.sortDir = filters.sortDir;
  const { data } = await api.get<Employe[]>('/employes', { params });
  return data;
}

export interface ImportResult {
  crees: number;
  ignores: number;
  erreurs: string[];
}

export type ImportStatut = 'OK' | 'IGNORE' | 'ERREUR';

export interface ApercuLigne {
  ligne: number;
  matricule: string;
  nom: string;
  prenoms: string;
  direction: string;
  salaire: string;
  statut: ImportStatut;
  message?: string;
}

export interface ApercuImport {
  lignes: ApercuLigne[];
  resume: { total: number; aCreer: number; ignores: number; erreurs: number };
}

export async function importEmployes(fileBase64: string): Promise<ImportResult> {
  const { data } = await api.post<ImportResult>('/employes/import', { fileBase64 });
  return data;
}

/** Aperçu (dry-run) : parse le fichier côté serveur sans rien enregistrer. */
export async function apercuImportEmployes(fileBase64: string): Promise<ApercuImport> {
  const { data } = await api.post<ApercuImport>('/employes/import/apercu', { fileBase64 });
  return data;
}

/** Déclenche le téléchargement d'un blob dans le navigateur. */
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Révocation différée : révoquer immédiatement après click() peut annuler le
  // téléchargement dans certains navigateurs.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Télécharge un modèle Excel d'import (en-têtes + exemples). */
export async function telechargerModeleEmployes(): Promise<void> {
  const { data } = await api.get('/employes/import/modele', { responseType: 'blob' });
  triggerDownload(data as Blob, 'modele_import_employes.xlsx');
}

/** Exporte les employés au format Excel (respecte recherche / filtre / tri). */
export async function exportEmployes(filters: EmployesFilters = {}): Promise<void> {
  const params: Record<string, string> = {};
  if (filters.search) params.search = filters.search;
  if (filters.directionId) params.directionId = filters.directionId;
  if (filters.sortBy) params.sortBy = filters.sortBy;
  if (filters.sortDir) params.sortDir = filters.sortDir;
  const { data } = await api.get('/employes/export', { params, responseType: 'blob' });
  triggerDownload(data as Blob, 'employes.xlsx');
}

export function useApercuImportEmployes() {
  return useMutation({ mutationFn: apercuImportEmployes });
}

export async function createEmploye(payload: CreateEmployePayload): Promise<Employe> {
  const { data } = await api.post<Employe>('/employes', payload);
  return data;
}

export async function updateEmploye(id: string, payload: UpdateEmployePayload): Promise<Employe> {
  const { data } = await api.patch<Employe>(`/employes/${id}`, payload);
  return data;
}

export async function deleteEmploye(id: string): Promise<void> {
  await api.delete(`/employes/${id}`);
}

export function useEmployes(filters: EmployesFilters = {}) {
  return useQuery({ queryKey: ['employes', filters], queryFn: () => listEmployes(filters) });
}

export function useImportEmployes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: importEmployes,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employes'] }),
  });
}

export function useCreateEmploye() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createEmploye,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employes'] }),
  });
}

export function useUpdateEmploye() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateEmployePayload }) => updateEmploye(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employes'] }),
  });
}

export function useDeleteEmploye() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteEmploye,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employes'] }),
  });
}

/* --------------------------------------------------- Types de bénéfice -- */

export async function listTypesBenefice(filters: EmployesFilters = {}): Promise<TypeBenefice[]> {
  const params: Record<string, string> = {};
  if (filters.search) params.search = filters.search;
  if (filters.sortBy) params.sortBy = filters.sortBy;
  if (filters.sortDir) params.sortDir = filters.sortDir;
  const { data } = await api.get<TypeBenefice[]>('/types-benefice', { params });
  return data;
}

export async function createTypeBenefice(payload: CreateTypeBeneficePayload): Promise<TypeBenefice> {
  const { data } = await api.post<TypeBenefice>('/types-benefice', payload);
  return data;
}

export async function updateTypeBenefice(
  id: string,
  payload: Partial<CreateTypeBeneficePayload> & { estActif?: boolean },
): Promise<TypeBenefice> {
  const { data } = await api.patch<TypeBenefice>(`/types-benefice/${id}`, payload);
  return data;
}

export async function deleteTypeBenefice(id: string): Promise<void> {
  await api.delete(`/types-benefice/${id}`);
}

export function useTypesBenefice(filters: EmployesFilters = {}) {
  return useQuery({ queryKey: ['types-benefice', filters], queryFn: () => listTypesBenefice(filters) });
}

export function useCreateTypeBenefice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createTypeBenefice,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['types-benefice'] }),
  });
}

export function useUpdateTypeBenefice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateTypeBeneficePayload> & { estActif?: boolean } }) =>
      updateTypeBenefice(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['types-benefice'] }),
  });
}

export function useDeleteTypeBenefice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteTypeBenefice,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['types-benefice'] }),
  });
}

/* ------------------------------------------- Bénéfices d'un employé -- */

export async function listBenefices(employeId: string): Promise<EmployeBenefice[]> {
  const { data } = await api.get<EmployeBenefice[]>(`/employes/${employeId}/benefices`);
  return data;
}

export async function createBenefice(
  employeId: string,
  payload: CreateEmployeBeneficePayload,
): Promise<EmployeBenefice> {
  const { data } = await api.post<EmployeBenefice>(`/employes/${employeId}/benefices`, payload);
  return data;
}

export async function updateBenefice(id: string, payload: UpdateEmployeBeneficePayload): Promise<EmployeBenefice> {
  const { data } = await api.patch<EmployeBenefice>(`/benefices/${id}`, payload);
  return data;
}

export function useBenefices(employeId: string | null) {
  return useQuery({
    queryKey: ['benefices', employeId],
    queryFn: () => listBenefices(employeId as string),
    enabled: !!employeId,
  });
}

export function useCreateBenefice(employeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateEmployeBeneficePayload) => createBenefice(employeId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['benefices', employeId] });
      // Met à jour l'indicateur (compteur) sur la liste des employés.
      qc.invalidateQueries({ queryKey: ['employes'] });
    },
  });
}

export function useUpdateBenefice(employeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateEmployeBeneficePayload }) =>
      updateBenefice(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['benefices', employeId] });
      qc.invalidateQueries({ queryKey: ['employes'] });
    },
  });
}
