import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  Conversion,
  CreateTauxPayload,
  Devise,
  RapportImportTaux,
  TauxCourant,
  TauxPeriode,
} from '@/types/api';

export async function listTauxCourants(): Promise<TauxCourant[]> {
  const { data } = await api.get<TauxCourant[]>('/taux-change');
  return data;
}

export async function getDeviseReference(): Promise<Devise> {
  const { data } = await api.get<Devise>('/taux-change/reference');
  return data;
}

export async function getHistoriqueTaux(
  deviseSourceId: string,
  deviseCibleId: string,
): Promise<TauxPeriode[]> {
  const { data } = await api.get<TauxPeriode[]>(
    `/taux-change/historique/${deviseSourceId}/${deviseCibleId}`,
  );
  return data;
}

export async function convertirMontant(params: {
  montant: string;
  deviseSourceId: string;
  deviseCibleId: string;
  date?: string;
}): Promise<Conversion> {
  const { data } = await api.get<Conversion>('/taux-change/convertir', { params });
  return data;
}

export async function createTaux(payload: CreateTauxPayload): Promise<TauxPeriode> {
  const { data } = await api.post<TauxPeriode>('/taux-change', payload);
  return data;
}

export async function importerTaux(): Promise<RapportImportTaux> {
  const { data } = await api.post<RapportImportTaux>('/taux-change/importer');
  return data;
}

export async function deleteTaux(id: string): Promise<void> {
  await api.delete(`/taux-change/${id}`);
}

/* ------------------------------------------------------------------------- */

export function useTauxCourants() {
  return useQuery({ queryKey: ['taux-change'], queryFn: listTauxCourants });
}

export function useDeviseReference() {
  return useQuery({ queryKey: ['taux-change', 'reference'], queryFn: getDeviseReference });
}

/** Historique d'un couple. Désactivé tant qu'aucun couple n'est déplié. */
export function useHistoriqueTaux(deviseSourceId?: string, deviseCibleId?: string) {
  return useQuery({
    queryKey: ['taux-change', 'historique', deviseSourceId, deviseCibleId],
    queryFn: () => getHistoriqueTaux(deviseSourceId!, deviseCibleId!),
    enabled: !!deviseSourceId && !!deviseCibleId,
  });
}

/**
 * Toute écriture invalide la liste ET les historiques : enregistrer un taux
 * CLÔT le précédent, donc la période affichée dans l'historique change elle
 * aussi. N'invalider que la liste laisserait un historique qui ment.
 */
function invalidateTaux(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['taux-change'] });
}

export function useCreateTaux() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: createTaux, onSuccess: () => invalidateTaux(qc) });
}

export function useImporterTaux() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: importerTaux, onSuccess: () => invalidateTaux(qc) });
}

export function useDeleteTaux() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: deleteTaux, onSuccess: () => invalidateTaux(qc) });
}
