import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Bon, CreateBonPayload, SousBon, ValidateBonPayload } from '../types';

export interface MyBonsFilter {
  dateFrom?: string;
  dateTo?: string;
  /** Recherche sur le numéro ou le montant — exécutée par la base. */
  search?: string;
  /** Un ou plusieurs statuts séparés par des virgules. */
  statut?: string;
}

/** Bons dont l'utilisateur est le demandeur (filtré côté serveur : demandeur + plage de dates). */
export async function getMyBons(demandeurId: string, filter: MyBonsFilter = {}): Promise<Bon[]> {
  const params: Record<string, string> = { demandeurId };
  if (filter.dateFrom) params.dateFrom = filter.dateFrom;
  if (filter.dateTo) params.dateTo = filter.dateTo;
  if (filter.search) params.search = filter.search;
  if (filter.statut) params.statut = filter.statut;
  const { data } = await api.get<Bon[]>('/bons', { params });
  return data;
}

export function useMyBons(demandeurId: string | null | undefined, filter: MyBonsFilter = {}) {
  return useQuery<Bon[]>({
    queryKey: [
      'my-bons',
      demandeurId,
      filter.dateFrom ?? '',
      filter.dateTo ?? '',
      filter.search ?? '',
      filter.statut ?? '',
    ],
    queryFn: () => getMyBons(demandeurId as string, filter),
    enabled: !!demandeurId,
  });
}

/**
 * Bons sur lesquels l'utilisateur a rendu une décision, dans une plage de dates.
 *
 * La plage porte sur la DATE DE DÉCISION, pas sur la date de création : un
 * validateur cherche « ce que j'ai signé cette semaine », or un bon saisi le 2
 * peut avoir été validé le 20. Le filtrage est fait par la base (EXISTS sur le
 * journal des décisions).
 */
export async function getMesValidations(
  validateurId: string,
  filter: MyBonsFilter = {},
): Promise<Bon[]> {
  const params: Record<string, string> = { validateurId };
  if (filter.dateFrom) params.dateFrom = filter.dateFrom;
  if (filter.dateTo) params.dateTo = filter.dateTo;
  if (filter.search) params.search = filter.search;
  const { data } = await api.get<Bon[]>('/bons', { params });
  return data;
}

export function useMesValidations(
  validateurId: string | null | undefined,
  filter: MyBonsFilter = {},
  enabled = true,
) {
  return useQuery<Bon[]>({
    queryKey: [
      'mes-validations',
      validateurId,
      filter.dateFrom ?? '',
      filter.dateTo ?? '',
      filter.search ?? '',
    ],
    queryFn: () => getMesValidations(validateurId as string, filter),
    enabled: enabled && !!validateurId,
  });
}

export async function createBon(payload: CreateBonPayload): Promise<Bon> {
  const { data } = await api.post<Bon>('/bons', payload);
  return data;
}

export function useCreateBon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createBon,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-bons'] }),
  });
}

// ---- Détail + validation ----

/** Bons en attente de validation visibles par l'utilisateur (restriction serveur par rôle). */
export async function getBonsAValider(search?: string): Promise<Bon[]> {
  const params: Record<string, string> = { statut: 'CREE' };
  if (search) params.search = search;
  const { data } = await api.get<Bon[]>('/bons', { params });
  return data;
}

export function useBonsAValider(enabled = true, search?: string) {
  return useQuery<Bon[]>({
    queryKey: ['bons-a-valider', search ?? ''],
    queryFn: () => getBonsAValider(search),
    enabled,
    // Polling « cloche » : rafraîchit la file toutes les 30 s.
    refetchInterval: 30000,
  });
}

export async function getBon(id: string): Promise<Bon> {
  const { data } = await api.get<Bon>(`/bons/${id}`);
  return data;
}

export function useBon(id: string) {
  return useQuery<Bon>({ queryKey: ['bon', id], queryFn: () => getBon(id), enabled: !!id });
}

export async function getSousBons(id: string): Promise<SousBon[]> {
  const { data } = await api.get<SousBon[]>(`/bons/${id}/soubons`);
  return data;
}

export function useSousBons(id: string) {
  return useQuery<SousBon[]>({ queryKey: ['bon', id, 'soubons'], queryFn: () => getSousBons(id), enabled: !!id });
}

export async function validateBon(id: string, payload: ValidateBonPayload): Promise<Bon> {
  const { data } = await api.post<Bon>(`/bons/${id}/validate`, payload);
  return data;
}

export function useValidateBon(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ValidateBonPayload) => validateBon(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bon', id] });
      qc.invalidateQueries({ queryKey: ['my-bons'] });
      qc.invalidateQueries({ queryKey: ['bons-a-valider'] });
    },
  });
}
