import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  BonCaisse,
  PrepareBonCaissePayload,
  UpdateBonCaissePayload,
} from '@/types/api';

/**
 * Endpoints du workflow BonCaisse (copie de travail caissier).
 *
 *   prepare  -> POST /bons-caisse/prepare           crée un BonCaisse PREPARE
 *   update   -> PATCH /bons-caisse/:id              ajuste les champs éditables
 *   finalize -> POST /bons-caisse/:id/finalize      passe en FINALISE + crée l'opération
 *   cancel   -> POST /bons-caisse/:id/cancel        passe en ANNULE
 *   findOne  -> GET   /bons-caisse/:id
 *   bySousBon-> GET   /bons-caisse/sous-bon/:id
 *   byBon    -> GET   /bons-caisse/bon/:id
 */

export async function prepareBonCaisse(payload: PrepareBonCaissePayload): Promise<BonCaisse> {
  const { data } = await api.post<BonCaisse>('/bons-caisse/prepare', payload);
  return data;
}

export async function getBonCaisse(id: string): Promise<BonCaisse> {
  const { data } = await api.get<BonCaisse>(`/bons-caisse/${id}`);
  return data;
}

export async function getBonCaisseBySousBon(sousBonId: string): Promise<BonCaisse[]> {
  const { data } = await api.get<BonCaisse[]>(`/bons-caisse/sous-bon/${sousBonId}`);
  return data;
}

export async function getBonCaisseByBon(bonId: string): Promise<BonCaisse[]> {
  const { data } = await api.get<BonCaisse[]>(`/bons-caisse/bon/${bonId}`);
  return data;
}

export async function updateBonCaisse(
  id: string,
  payload: UpdateBonCaissePayload,
): Promise<BonCaisse> {
  const { data } = await api.patch<BonCaisse>(`/bons-caisse/${id}`, payload);
  return data;
}

export async function finalizeBonCaisse(id: string): Promise<BonCaisse> {
  const { data } = await api.post<BonCaisse>(`/bons-caisse/${id}/finalize`);
  return data;
}

export async function cancelPrepareBonCaisse(id: string): Promise<BonCaisse> {
  const { data } = await api.post<BonCaisse>(`/bons-caisse/${id}/cancel`);
  return data;
}

/* ------------------------------------------------------------------ */
/* Hooks TanStack Query                                                */
/* ------------------------------------------------------------------ */

/**
 * Invalide les caches impactés par un mouvement de BonCaisse :
 * - la liste/historique des BonCaisse (clé ['bons-caisse', ...])
 * - le bon parent et la liste des bons (statuts modifiés sur finalize)
 * - le ledger d'opérations (création d'une DECAISSEMENT sur finalize)
 */
function invalidateBonCaisseRelated(qc: ReturnType<typeof useQueryClient>, bonCaisse?: BonCaisse) {
  qc.invalidateQueries({ queryKey: ['bons-caisse'] });
  qc.invalidateQueries({ queryKey: ['bons'] });
  qc.invalidateQueries({ queryKey: ['operations'] });
  if (bonCaisse?.bonSourceId) {
    qc.invalidateQueries({ queryKey: ['bon', bonCaisse.bonSourceId] });
  }
  if (bonCaisse?.id) {
    qc.invalidateQueries({ queryKey: ['bon-caisse', bonCaisse.id] });
  }
  if (bonCaisse?.sousBonSourceId) {
    qc.invalidateQueries({ queryKey: ['bons-caisse', 'sous-bon', bonCaisse.sousBonSourceId] });
  }
}

export function useBonCaisse(id: string | null) {
  return useQuery({
    queryKey: ['bon-caisse', id],
    queryFn: () => getBonCaisse(id!),
    enabled: !!id,
  });
}

export function useBonCaisseBySousBon(sousBonId: string | null) {
  return useQuery({
    queryKey: ['bons-caisse', 'sous-bon', sousBonId],
    queryFn: () => getBonCaisseBySousBon(sousBonId!),
    enabled: !!sousBonId,
  });
}

export function useBonCaisseByBon(bonId: string | null) {
  return useQuery({
    queryKey: ['bons-caisse', 'bon', bonId],
    queryFn: () => getBonCaisseByBon(bonId!),
    enabled: !!bonId,
  });
}

export function usePrepareBonCaisse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: prepareBonCaisse,
    onSuccess: (bonCaisse) => invalidateBonCaisseRelated(qc, bonCaisse),
  });
}

export function useUpdateBonCaisse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateBonCaissePayload }) =>
      updateBonCaisse(id, payload),
    onSuccess: (bonCaisse) => invalidateBonCaisseRelated(qc, bonCaisse),
  });
}

export function useFinalizeBonCaisse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => finalizeBonCaisse(id),
    onSuccess: (bonCaisse) => invalidateBonCaisseRelated(qc, bonCaisse),
  });
}

export function useCancelPrepareBonCaisse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelPrepareBonCaisse(id),
    onSuccess: (bonCaisse) => invalidateBonCaisseRelated(qc, bonCaisse),
  });
}
