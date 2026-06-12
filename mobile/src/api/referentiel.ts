import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { BonPerimeter, CostCenter, NatureOperation, Partenaire, TypeBon } from '../types';

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

export async function listPartenaires(): Promise<Partenaire[]> {
  const { data } = await api.get<Partenaire[]>('/partenaires');
  return data;
}

export function usePartenaires() {
  return useQuery<Partenaire[]>({ queryKey: ['partenaires'], queryFn: listPartenaires });
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
