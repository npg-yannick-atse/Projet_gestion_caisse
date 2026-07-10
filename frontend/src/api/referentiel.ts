import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  CostCenter,
  CreateCostCenterPayload,
  CreatePartenairePayload,
  CreatePlanComptablePayload,
  Division,
  NatureComptable,
  NatureOperation,
  Partenaire,
  Pays,
  PlanComptable,
  TypeBon,
} from '@/types/api';

export async function listPartenaires(): Promise<Partenaire[]> {
  const { data } = await api.get<Partenaire[]>('/partenaires');
  return data;
}

export async function createPartenaire(payload: CreatePartenairePayload): Promise<Partenaire> {
  const { data } = await api.post<Partenaire>('/partenaires', payload);
  return data;
}

export async function deletePartenaire(id: string): Promise<void> {
  await api.delete(`/partenaires/${id}`);
}

export async function listCostCenters(): Promise<CostCenter[]> {
  const { data } = await api.get<CostCenter[]>('/cost-centers');
  return data;
}

export async function createCostCenter(payload: CreateCostCenterPayload): Promise<CostCenter> {
  const { data } = await api.post<CostCenter>('/cost-centers', payload);
  return data;
}

export async function updateCostCenter(
  id: string,
  payload: Partial<CreateCostCenterPayload>,
): Promise<CostCenter> {
  const { data } = await api.patch<CostCenter>(`/cost-centers/${id}`, payload);
  return data;
}

export async function deleteCostCenter(id: string): Promise<void> {
  await api.delete(`/cost-centers/${id}`);
}

export async function listTypeBons(): Promise<TypeBon[]> {
  const { data } = await api.get<TypeBon[]>('/type-bons');
  return data;
}

export function usePartenaires() {
  return useQuery({ queryKey: ['partenaires'], queryFn: listPartenaires });
}

export function useCreatePartenaire() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createPartenaire,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partenaires'] }),
  });
}

export function useDeletePartenaire() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deletePartenaire,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partenaires'] }),
  });
}

export function useCostCenters() {
  return useQuery({ queryKey: ['cost-centers'], queryFn: listCostCenters });
}

export function useCreateCostCenter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createCostCenter,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cost-centers'] }),
  });
}

export function useUpdateCostCenter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateCostCenterPayload> }) =>
      updateCostCenter(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cost-centers'] }),
  });
}

export function useDeleteCostCenter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteCostCenter,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cost-centers'] }),
  });
}

export function useTypeBons() {
  return useQuery({ queryKey: ['type-bons'], queryFn: listTypeBons });
}

export async function listNaturesComptable(): Promise<NatureComptable[]> {
  const { data } = await api.get<NatureComptable[]>('/natures-comptable');
  return data;
}

export function useNaturesComptable() {
  return useQuery({ queryKey: ['natures-comptable'], queryFn: listNaturesComptable });
}

// ---------- Pays / Division ----------

export async function listPays(): Promise<Pays[]> {
  const { data } = await api.get<Pays[]>('/pays');
  return data;
}
export async function createPays(payload: { code: string; libelle: string }): Promise<Pays> {
  const { data } = await api.post<Pays>('/pays', payload);
  return data;
}
export async function deletePays(id: string): Promise<void> {
  await api.delete(`/pays/${id}`);
}
export function usePays() {
  return useQuery({ queryKey: ['pays'], queryFn: listPays });
}
export function useCreatePays() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: createPays, onSuccess: () => qc.invalidateQueries({ queryKey: ['pays'] }) });
}
export function useDeletePays() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: deletePays, onSuccess: () => qc.invalidateQueries({ queryKey: ['pays'] }) });
}

export async function listDivisions(paysId?: string): Promise<Division[]> {
  const { data } = await api.get<Division[]>('/divisions', { params: paysId ? { paysId } : undefined });
  return data;
}
export async function createDivision(payload: {
  code?: string;
  libelle: string;
  paysId: string;
}): Promise<Division> {
  const { data } = await api.post<Division>('/divisions', payload);
  return data;
}
export async function deleteDivision(id: string): Promise<void> {
  await api.delete(`/divisions/${id}`);
}
export function useDivisions(paysId?: string) {
  return useQuery({ queryKey: ['divisions', paysId ?? 'all'], queryFn: () => listDivisions(paysId) });
}
export function useCreateDivision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createDivision,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['divisions'] }),
  });
}
export function useDeleteDivision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteDivision,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['divisions'] }),
  });
}

export async function listNaturesOperation(): Promise<NatureOperation[]> {
  const { data } = await api.get<NatureOperation[]>('/natures-operation');
  return data;
}

export interface CreateNatureOperationPayload {
  code: string;
  libelle: string;
  costCenterId?: string;
  planComptableId?: string;
}

export async function createNatureOperation(payload: CreateNatureOperationPayload): Promise<NatureOperation> {
  const { data } = await api.post<NatureOperation>('/natures-operation', payload);
  return data;
}

export async function updateNatureOperation(
  id: string,
  payload: Partial<CreateNatureOperationPayload>,
): Promise<NatureOperation> {
  const { data } = await api.patch<NatureOperation>(`/natures-operation/${id}`, payload);
  return data;
}

export async function deleteNatureOperation(id: string): Promise<void> {
  await api.delete(`/natures-operation/${id}`);
}

export function useNaturesOperation() {
  return useQuery({ queryKey: ['natures-operation'], queryFn: listNaturesOperation });
}

export function useCreateNatureOperation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createNatureOperation,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['natures-operation'] }),
  });
}

export function useUpdateNatureOperation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateNatureOperationPayload> }) =>
      updateNatureOperation(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['natures-operation'] }),
  });
}

export function useDeleteNatureOperation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteNatureOperation,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['natures-operation'] }),
  });
}

// Plan comptable

export async function listPlanComptable(): Promise<PlanComptable[]> {
  const { data } = await api.get<PlanComptable[]>('/plan-comptable');
  return data;
}

export async function createPlanComptable(payload: CreatePlanComptablePayload): Promise<PlanComptable> {
  const { data } = await api.post<PlanComptable>('/plan-comptable', payload);
  return data;
}

export async function deletePlanComptable(id: string): Promise<void> {
  await api.delete(`/plan-comptable/${id}`);
}

export function usePlanComptable() {
  return useQuery({ queryKey: ['plan-comptable'], queryFn: listPlanComptable });
}

export function useCreatePlanComptable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createPlanComptable,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan-comptable'] }),
  });
}

export function useDeletePlanComptable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deletePlanComptable,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan-comptable'] }),
  });
}
