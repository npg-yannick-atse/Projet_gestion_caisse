import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Operation, Portefeuille, SoldePortefeuille } from '../types';

/**
 * Portefeuilles visibles par l'utilisateur.
 *
 * Le serveur applique déjà le périmètre : un porteur ordinaire ne reçoit que
 * les siens (possédés, gérés, ou ceux de sa direction). Rien à filtrer ici, et
 * surtout rien à filtrer côté téléphone — la liste reçue EST le périmètre.
 */
export async function getMesPortefeuilles(): Promise<Portefeuille[]> {
  const { data } = await api.get<Portefeuille[]>('/portefeuilles');
  return data;
}

export function useMesPortefeuilles() {
  return useQuery<Portefeuille[]>({
    queryKey: ['mes-portefeuilles'],
    queryFn: getMesPortefeuilles,
  });
}

/** Solde courant, recalculé depuis les écritures — jamais un champ stocké. */
export async function getSoldePortefeuille(id: string): Promise<SoldePortefeuille> {
  const { data } = await api.get<SoldePortefeuille>(`/portefeuilles/${id}/solde`);
  return data;
}

export function useSoldePortefeuille(id: string | null | undefined) {
  return useQuery<SoldePortefeuille>({
    queryKey: ['portefeuille', id, 'solde'],
    queryFn: () => getSoldePortefeuille(id as string),
    enabled: !!id,
  });
}

export interface MouvementsFilter {
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Mouvements d'un portefeuille, filtrés PAR LA BASE.
 *
 * Le périmètre est réappliqué côté serveur : passer l'identifiant d'un
 * portefeuille qu'on ne peut pas voir ne renvoie rien.
 */
export async function getMouvementsPortefeuille(
  portefeuilleId: string,
  filter: MouvementsFilter = {},
): Promise<Operation[]> {
  const params: Record<string, string> = { portefeuilleId };
  if (filter.dateFrom) params.dateFrom = filter.dateFrom;
  if (filter.dateTo) params.dateTo = filter.dateTo;
  const { data } = await api.get<Operation[]>('/ledger/operations', { params });
  return data;
}

export function useMouvementsPortefeuille(
  portefeuilleId: string | null | undefined,
  filter: MouvementsFilter = {},
) {
  return useQuery<Operation[]>({
    queryKey: ['portefeuille', portefeuilleId, 'mouvements', filter.dateFrom ?? '', filter.dateTo ?? ''],
    queryFn: () => getMouvementsPortefeuille(portefeuilleId as string, filter),
    enabled: !!portefeuilleId,
  });
}
