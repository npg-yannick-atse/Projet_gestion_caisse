import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { BonPerimeter, CostCenter, Division, NatureOperation, Partenaire, Pays, TypeBon } from '../types';

/** Périmètre de création de l'utilisateur : CC, caisses et portefeuilles autorisés. */
export async function getMyBonPerimeter(): Promise<BonPerimeter> {
  const { data } = await api.get<BonPerimeter>('/bons/perimetre/mine');
  return data;
}

export function useMyBonPerimeter() {
  return useQuery<BonPerimeter>({ queryKey: ['bons', 'perimetre', 'mine'], queryFn: getMyBonPerimeter });
}

export async function listTypeBons(): Promise<TypeBon[]> {
  const { data } = await api.get<TypeBon[]>('/type-bons');
  return data;
}

export function useTypeBons() {
  return useQuery<TypeBon[]>({ queryKey: ['type-bons'], queryFn: listTypeBons });
}

export async function listPartenaires(
  params: { type?: 'CLIENT' | 'FOURNISSEUR'; search?: string; limit?: number } = {},
): Promise<Partenaire[]> {
  const { data } = await api.get<Partenaire[]>('/partenaires', {
    params: {
      type: params.type || undefined,
      search: params.search || undefined,
      limit: params.limit || undefined,
    },
  });
  return data;
}

export function usePartenaires() {
  return useQuery<Partenaire[]>({ queryKey: ['partenaires'], queryFn: () => listPartenaires() });
}

export async function listCostCenters(): Promise<CostCenter[]> {
  const { data } = await api.get<CostCenter[]>('/cost-centers');
  return data;
}

export function useCostCenters() {
  return useQuery<CostCenter[]>({ queryKey: ['cost-centers'], queryFn: listCostCenters, staleTime: 5 * 60 * 1000 });
}

export async function listNaturesOperation(): Promise<NatureOperation[]> {
  const { data } = await api.get<NatureOperation[]>('/natures-operation');
  return data;
}

export function useNaturesOperation() {
  return useQuery<NatureOperation[]>({
    queryKey: ['natures-operation'],
    queryFn: listNaturesOperation,
    staleTime: 5 * 60 * 1000,
  });
}

export async function listPays(): Promise<Pays[]> {
  const { data } = await api.get<Pays[]>('/pays');
  return data;
}

export function usePays() {
  return useQuery<Pays[]>({ queryKey: ['pays'], queryFn: listPays, staleTime: 5 * 60 * 1000 });
}

export async function listDivisions(paysId?: string): Promise<Division[]> {
  const { data } = await api.get<Division[]>('/divisions', { params: paysId ? { paysId } : undefined });
  return data;
}

export function useDivisions(paysId?: string) {
  return useQuery<Division[]>({
    queryKey: ['divisions', paysId ?? 'all'],
    queryFn: () => listDivisions(paysId),
    enabled: !!paysId,
    staleTime: 5 * 60 * 1000,
  });
}
