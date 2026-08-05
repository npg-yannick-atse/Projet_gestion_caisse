import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface SapPing {
  ok: boolean;
  message: string;
}

export interface SapClientInfo {
  code: string;
  existe: boolean;
  nom?: string;
  ville?: string;
  pays?: string;
  identifiantFiscal?: string;
  telephone?: string;
  messages: string[];
  details?: Record<string, unknown>;
}

export interface SapCommandeInfo {
  numero: string;
  existe: boolean;
  fournisseur?: string;
  fournisseurNom?: string;
  usineSource?: string;
  societe?: string;
  devise?: string;
  typeDocument?: string;
  dateDocument?: string;
  statut?: string;
  conditionsPaiement?: string;
  messages: string[];
  details?: Record<string, unknown>;
}

export async function sapPing(): Promise<SapPing> {
  const { data } = await api.get<SapPing>('/sap/ping');
  return data;
}

export async function verifierClientSap(code: string): Promise<SapClientInfo> {
  const { data } = await api.get<SapClientInfo>(`/sap/client/${encodeURIComponent(code)}`);
  return data;
}

export async function verifierCommandeSap(numero: string): Promise<SapCommandeInfo> {
  const { data } = await api.get<SapCommandeInfo>(`/sap/commande/${encodeURIComponent(numero)}`);
  return data;
}

export interface SapFournisseurInfo {
  code: string;
  existe: boolean;
  nom?: string;
  ville?: string;
  pays?: string;
  telephone?: string;
  messages: string[];
  details?: Record<string, unknown>;
}

export async function verifierFournisseurSap(code: string): Promise<SapFournisseurInfo> {
  const { data } = await api.get<SapFournisseurInfo>(`/sap/fournisseur/${encodeURIComponent(code)}`);
  return data;
}

export function useVerifierFournisseurSap() {
  return useMutation({ mutationFn: verifierFournisseurSap });
}

export interface SyncComptesResult {
  comptesAjoutes: number;
  naturesAjoutees: number;
}

export async function syncComptesSap(): Promise<SyncComptesResult> {
  const { data } = await api.post<SyncComptesResult>('/sap/sync/comptes', {});
  return data;
}

export function useSyncComptesSap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: syncComptesSap,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['natures-operation'] });
      qc.invalidateQueries({ queryKey: ['natures-comptable'] });
    },
  });
}

export interface SyncFournisseursResult {
  ajoutes: number;
  totalSap: number;
}

export async function syncFournisseursSap(): Promise<SyncFournisseursResult> {
  const { data } = await api.post<SyncFournisseursResult>('/sap/sync/fournisseurs', {});
  return data;
}

export function useSyncFournisseursSap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: syncFournisseursSap,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partenaires'] }),
  });
}

/** Import des clients SAP (table KNA1) dans le référentiel des partenaires. */
export async function syncClientsSap(): Promise<SyncFournisseursResult> {
  const { data } = await api.post<SyncFournisseursResult>('/sap/sync/clients', {});
  return data;
}

export function useSyncClientsSap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: syncClientsSap,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partenaires'] }),
  });
}

export interface LigneEcriture {
  compteGL: string;
  sens: 'D' | 'C';
  montant: number;
  texte?: string;
  centreCout?: string;
}

export interface PosterPiecePayload {
  societe: string;
  devise: string;
  typePiece?: string;
  datePiece?: string;
  dateComptable?: string;
  reference?: string;
  texte?: string;
  lignes: LigneEcriture[];
}

export interface SapPosteResult {
  ok: boolean;
  dryRun: boolean;
  numeroPiece?: string;
  messages: string[];
  details?: Record<string, unknown>;
}

export async function checkEcritureSap(payload: PosterPiecePayload): Promise<SapPosteResult> {
  const { data } = await api.post<SapPosteResult>('/sap/ecriture/check', payload);
  return data;
}

export async function posterEcritureSap(payload: PosterPiecePayload): Promise<SapPosteResult> {
  const { data } = await api.post<SapPosteResult>('/sap/ecriture/post', payload);
  return data;
}

export async function contrepasserSap(objKey: string, motif?: string): Promise<SapPosteResult> {
  const { data } = await api.post<SapPosteResult>('/sap/ecriture/contrepasser', { objKey, motif });
  return data;
}

export async function envoyerOperationSap(operationId: string): Promise<SapPosteResult & { operationId: string }> {
  const { data } = await api.post<SapPosteResult & { operationId: string }>(`/sap/operations/${operationId}/envoyer`, {});
  return data;
}

export interface CompteGL {
  compte: string;
  libelle?: string;
}

export async function listComptesSap(q?: string, societe?: string): Promise<CompteGL[]> {
  const { data } = await api.get<CompteGL[]>('/sap/comptes', {
    params: { q: q || undefined, societe: societe || undefined },
  });
  return data;
}

/* Appels déclenchés par bouton → des mutations. */
export function useSapPing() {
  return useMutation({ mutationFn: sapPing });
}
export function useListComptesSap() {
  return useMutation({ mutationFn: (args: { q?: string; societe?: string }) => listComptesSap(args.q, args.societe) });
}
export function useCheckEcritureSap() {
  return useMutation({ mutationFn: checkEcritureSap });
}
export function usePosterEcritureSap() {
  return useMutation({ mutationFn: posterEcritureSap });
}
export function useContrepasserSap() {
  return useMutation({ mutationFn: ({ objKey, motif }: { objKey: string; motif?: string }) => contrepasserSap(objKey, motif) });
}
export function useEnvoyerOperationSap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: envoyerOperationSap,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['operations'] }),
  });
}

/* ------------------------------ Mapping comptable ------------------------------ */

export interface SapMappingRow {
  typeCompte: string;
  compteSap: string | null;
}

export async function getSapMapping(): Promise<SapMappingRow[]> {
  const { data } = await api.get<SapMappingRow[]>('/sap/mapping');
  return data;
}

export async function setSapMapping(typeCompte: string, compteSap: string | null): Promise<SapMappingRow[]> {
  const { data } = await api.post<SapMappingRow[]>('/sap/mapping', { typeCompte, compteSap });
  return data;
}

export function useSapMapping() {
  return useQuery({ queryKey: ['sap-mapping'], queryFn: getSapMapping });
}

export function useSetSapMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ typeCompte, compteSap }: { typeCompte: string; compteSap: string | null }) =>
      setSapMapping(typeCompte, compteSap),
    onSuccess: (data) => qc.setQueryData(['sap-mapping'], data),
  });
}

/* --------------------------- Mapping centres de coût --------------------------- */

export interface SapCcMappingRow {
  costCenterApp: string;
  costCenterSap: string | null;
}

export async function getSapCostCenterMapping(): Promise<SapCcMappingRow[]> {
  const { data } = await api.get<SapCcMappingRow[]>('/sap/cost-centers');
  return data;
}

export async function setSapCostCenterMapping(
  costCenterApp: string,
  costCenterSap: string | null,
): Promise<SapCcMappingRow[]> {
  const { data } = await api.post<SapCcMappingRow[]>('/sap/cost-centers', { costCenterApp, costCenterSap });
  return data;
}

export interface SapCostCenter {
  code: string;
  libelle?: string;
}

export async function searchCostCentersSap(q?: string): Promise<SapCostCenter[]> {
  const { data } = await api.get<SapCostCenter[]>('/sap/cost-centers/search', { params: { q: q || undefined } });
  return data;
}

export function useSearchCostCentersSap() {
  return useMutation({ mutationFn: (q?: string) => searchCostCentersSap(q) });
}

export function useSapCostCenterMapping() {
  return useQuery({ queryKey: ['sap-cc-mapping'], queryFn: getSapCostCenterMapping });
}

export function useSetSapCostCenterMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ costCenterApp, costCenterSap }: { costCenterApp: string; costCenterSap: string | null }) =>
      setSapCostCenterMapping(costCenterApp, costCenterSap),
    onSuccess: (data) => qc.setQueryData(['sap-cc-mapping'], data),
  });
}
export function useVerifierClientSap() {
  return useMutation({ mutationFn: verifierClientSap });
}
export function useVerifierCommandeSap() {
  return useMutation({ mutationFn: verifierCommandeSap });
}
