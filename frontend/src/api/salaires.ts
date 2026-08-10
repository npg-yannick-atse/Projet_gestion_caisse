import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type SourceFonds = 'CAISSE' | 'PORTEFEUILLE';

export interface PaiementSalaireResume {
  id: string;
  montant: string;
  datePaiement: string;
  sourceType: SourceFonds;
  sourceId: string;
  statut: 'PAYE' | 'ANNULE';
}

/** Une ligne de la grille : l'employé, son salaire, et son paiement du mois. */
export interface LigneSalaire {
  employeId: string;
  matricule: string;
  nom: string;
  prenoms: string | null;
  directionId: string | null;
  salaire: string | null;
  paiement: PaiementSalaireResume | null;
  /** Mensualité de crédit qui sera retenue sur cette paie (null si rien à retenir). */
  retenueCredit: RetenueCredit | null;
}

/** Retenue annoncée AVANT le paiement, calculée par le serveur. */
export interface RetenueCredit {
  creditId: string;
  echeance: number;
  nbMois: number;
  montant: string;
  deviseId: string;
  /**
   * Le salaire ne couvre pas l'échéance : le caissier doit indiquer ce qui peut
   * être prélevé, le reliquat est reporté sur les mois suivants.
   */
  salaireInsuffisant: boolean;
  /** Plafond de la retenue : on ne prélève pas plus que le salaire versé. */
  maxPrelevable: string;
}

export interface GrilleSalaires {
  periode: string;
  lignes: LigneSalaire[];
}

export interface SalairesFilters {
  periode?: string;
  search?: string;
  directionId?: string;
}

export async function getGrilleSalaires(filters: SalairesFilters = {}): Promise<GrilleSalaires> {
  const params: Record<string, string> = {};
  if (filters.periode) params.periode = filters.periode;
  if (filters.search) params.search = filters.search;
  if (filters.directionId) params.directionId = filters.directionId;
  const { data } = await api.get<GrilleSalaires>('/salaires', { params });
  return data;
}

export function useGrilleSalaires(filters: SalairesFilters = {}) {
  return useQuery({
    queryKey: ['salaires', filters],
    queryFn: () => getGrilleSalaires(filters),
  });
}

export interface PayerSalairePayload {
  employeId: string;
  periode?: string;
  montant?: string;
  sourceType: SourceFonds;
  sourceId: string;
  deviseId: string;
  commentaire?: string;
  /**
   * Montant que le caissier accepte de prélever au titre du crédit quand le
   * salaire ne couvre pas l'échéance. Le reliquat est reporté sur les mois
   * suivants. Sans cette valeur, aucune retenue partielle n'est faite.
   */
  montantRetenue?: string;
}

export async function payerSalaire(payload: PayerSalairePayload) {
  const { data } = await api.post('/salaires/payer', payload);
  return data;
}

export async function annulerPaiementSalaire(id: string, motif?: string) {
  const { data } = await api.post(`/salaires/${id}/annuler`, { motif });
  return data;
}

export async function getHistoriqueSalaire(employeId: string) {
  const { data } = await api.get(`/salaires/employe/${employeId}`);
  return data;
}

// Payer touche à la trésorerie : on rafraîchit aussi soldes et opérations.
function invalider(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['salaires'] });
  qc.invalidateQueries({ queryKey: ['operations'] });
  qc.invalidateQueries({ queryKey: ['caisses'] });
  qc.invalidateQueries({ queryKey: ['caisse'] });
  qc.invalidateQueries({ queryKey: ['portefeuilles'] });
  qc.invalidateQueries({ queryKey: ['portefeuille'] });
}

export function usePayerSalaire() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: payerSalaire, onSuccess: () => invalider(qc) });
}

export function useAnnulerPaiementSalaire() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motif }: { id: string; motif?: string }) => annulerPaiementSalaire(id, motif),
    onSuccess: () => invalider(qc),
  });
}
