import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  Bon,
  BonStatut,
  BonSummary,
  BonTimelinePoint,
  BonsByDirectionRow,
  Caisse,
  CostCenter,
  CreateBonPayload,
  ExtensionMode,
  ImpressionBon,
  Portefeuille,
  SousBon,
  StatutExtension,
} from '@/types/api';

/**
 * Périmètre de création de bon de l'utilisateur courant :
 * centres de coût, caisses et portefeuilles autorisés + droit multi-CC.
 */
export interface BonPerimeter {
  costCenters: CostCenter[];
  caisses: Caisse[];
  portefeuilles: Portefeuille[];
  hasMultiCc: boolean;
  isAdmin: boolean;
}

export async function getMyBonPerimeter(): Promise<BonPerimeter> {
  const { data } = await api.get<BonPerimeter>('/bons/perimetre/mine');
  return data;
}

export function useMyBonPerimeter() {
  return useQuery({ queryKey: ['bons', 'perimetre', 'mine'], queryFn: getMyBonPerimeter });
}

export interface ListBonsFilters {
  statut?: BonStatut;
  period?: 'today' | 'week' | 'month';
  typeBonId?: string;
  demandeurId?: string;
  extension?: boolean;
  statutExtension?: StatutExtension;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export async function listBons(filters: ListBonsFilters | BonStatut = {}): Promise<Bon[]> {
  // Compat : autorise un BonStatut nu (ancien appel) ou un objet
  const params: Record<string, string> = {};
  if (typeof filters === 'string') {
    params.statut = filters;
  } else {
    if (filters.statut) params.statut = filters.statut;
    if (filters.period) params.period = filters.period;
    if (filters.typeBonId) params.typeBonId = filters.typeBonId;
    if (filters.demandeurId) params.demandeurId = filters.demandeurId;
    if (filters.extension) params.extension = '1';
    if (filters.statutExtension) params.statutExtension = filters.statutExtension;
    if (filters.search) params.search = filters.search;
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
    if (filters.sortBy) params.sortBy = filters.sortBy;
    if (filters.sortDir) params.sortDir = filters.sortDir;
  }
  const { data } = await api.get<Bon[]>('/bons', { params });
  return data;
}

export async function createBon(payload: CreateBonPayload): Promise<Bon> {
  const { data } = await api.post<Bon>('/bons', payload);
  return data;
}

export function useCreateBon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createBon,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bons'] }),
  });
}

export async function getBon(id: string): Promise<Bon> {
  const { data } = await api.get<Bon>(`/bons/${id}`);
  return data;
}

export async function getSousBons(id: string): Promise<SousBon[]> {
  const { data } = await api.get<SousBon[]>(`/bons/${id}/soubons`);
  return data;
}

export async function getImpression(id: string): Promise<ImpressionBon | null> {
  const { data } = await api.get<ImpressionBon | null>(`/bons/${id}/impression`);
  return data;
}

export function useImpression(id: string) {
  return useQuery({ queryKey: ['bon', id, 'impression'], queryFn: () => getImpression(id) });
}

export function useBons(filters: ListBonsFilters | BonStatut = {}) {
  // Stabilise la clé : si on passe juste un statut, on garde 'all' / 'CREE' / etc.
  const key =
    typeof filters === 'string'
      ? { statut: filters }
      : filters && Object.keys(filters).length > 0
        ? filters
        : 'all';
  return useQuery({ queryKey: ['bons', key], queryFn: () => listBons(filters) });
}

export async function getBonsTimeline(opts: {
  days?: number;
  statut?: BonStatut;
  demandeurId?: string;
}): Promise<BonTimelinePoint[]> {
  const { data } = await api.get<BonTimelinePoint[]>('/bons/stats/timeline', { params: opts });
  return data;
}

export function useBonsTimeline(opts: {
  days?: number;
  statut?: BonStatut;
  demandeurId?: string;
} = {}) {
  return useQuery({
    queryKey: ['bons', 'timeline', opts],
    queryFn: () => getBonsTimeline(opts),
  });
}

export async function getBonsSummary(opts: {
  demandeurId?: string;
  validateurId?: string;
}): Promise<BonSummary> {
  const { data } = await api.get<BonSummary>('/bons/stats/summary', { params: opts });
  return data;
}

export function useBonsSummary(opts: {
  demandeurId?: string;
  validateurId?: string;
} = {}) {
  return useQuery({
    queryKey: ['bons', 'summary', opts],
    queryFn: () => getBonsSummary(opts),
  });
}

export async function getBonsByDirection(opts: {
  period?: 'today' | 'week' | 'month';
} = {}): Promise<BonsByDirectionRow[]> {
  const { data } = await api.get<BonsByDirectionRow[]>('/bons/stats/by-direction', {
    params: opts.period ? { period: opts.period } : undefined,
  });
  return data;
}

export function useBonsByDirection(opts: { period?: 'today' | 'week' | 'month' } = {}) {
  return useQuery({
    queryKey: ['bons', 'by-direction', opts],
    queryFn: () => getBonsByDirection(opts),
  });
}

export function useBon(id: string) {
  return useQuery({ queryKey: ['bon', id], queryFn: () => getBon(id) });
}

export function useSousBons(id: string) {
  return useQuery({ queryKey: ['bon', id, 'soubons'], queryFn: () => getSousBons(id) });
}

function useBonAction<TPayload>(action: (id: string, payload: TPayload) => Promise<unknown>, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: TPayload) => action(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bon', id] });
      qc.invalidateQueries({ queryKey: ['bons'] });
    },
  });
}

export function useValidateBon(id: string) {
  return useBonAction<{ approuve: boolean; commentaire?: string; porteur?: string }>(
    (bonId, payload) => api.post(`/bons/${bonId}/validate`, payload),
    id,
  );
}

export function usePrintBon(id: string) {
  return useBonAction<void>((bonId) => api.post(`/bons/${bonId}/print`), id);
}

export function useSignBon(id: string) {
  return useBonAction<{ signatureImage?: string } | undefined>(
    (bonId, payload) => api.post(`/bons/${bonId}/sign`, payload ?? {}),
    id,
  );
}

export function useDecaisserBon(id: string) {
  return useBonAction<{ beneficiaire: string; beneficiairePiece?: string }>(
    (bonId, payload) => api.post(`/bons/${bonId}/decaisser`, payload),
    id,
  );
}

export function useCancelBon(id: string) {
  return useBonAction<void>((bonId) => api.post(`/bons/${bonId}/cancel`), id);
}

// ── Circuit d'extension de budget (action par id, utilisable depuis une liste) ──

export function useApprouverExtension() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, mode, commentaire }: { id: string; mode: ExtensionMode; commentaire?: string }) =>
      api.post(`/bons/${id}/extension/approuver`, { mode, commentaire }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bons'] });
      qc.invalidateQueries({ queryKey: ['bon'] });
      qc.invalidateQueries({ queryKey: ['portefeuille-solde'] });
    },
  });
}

export function useRefuserExtension() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, commentaire }: { id: string; commentaire?: string }) =>
      api.post(`/bons/${id}/extension/refuser`, { commentaire }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bons'] });
      qc.invalidateQueries({ queryKey: ['bon'] });
    },
  });
}

export function useExtensionsEnAttente(enabled = true) {
  return useQuery({
    queryKey: ['bons', 'extensions', 'EN_ATTENTE'],
    queryFn: () => listBons({ statutExtension: 'EN_ATTENTE' }),
    enabled,
  });
}
