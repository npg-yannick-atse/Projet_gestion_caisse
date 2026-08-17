import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface RecuCaisse {
  id: string;
  numero: string;
  caisseId: string;
  deviseId: string;
  montant: string;
  /** Partagé avec l'opération qui l'a produit : c'est ce qui les relie. */
  transactionUuid: string;
  typeEntree?: string | null;
  remisPar?: string | null;
  motif?: string | null;
  createdAt: string;
  /** Libellés résolus par le serveur — l'impression ne recompose rien. */
  caisseLibelle?: string | null;
  deviseCode?: string | null;
  encaissePar?: string | null;
}

export async function listRecusCaisse(caisseId?: string, limit = 100): Promise<RecuCaisse[]> {
  const { data } = await api.get<RecuCaisse[]>('/recus-caisse', {
    // Filtré EN BASE : une caisse peut totaliser des milliers de reçus.
    params: { ...(caisseId ? { caisseId } : {}), limit },
  });
  return data;
}

export function useRecusCaisse(caisseId?: string, limit = 100) {
  return useQuery({
    queryKey: ['recus-caisse', caisseId ?? 'tous', limit],
    queryFn: () => listRecusCaisse(caisseId, limit),
  });
}

/**
 * Ouvre le reçu au format PDF, fabriqué par le SERVEUR.
 *
 * Le fichier est identique quel que soit le poste, alors que l'impression
 * navigateur dépendait des marges, en-têtes et polices de chaque machine. Une
 * pièce comptable doit se retrouver à l'identique dans six mois.
 *
 * Passe par  et NON par un lien direct : la route est authentifiée, et une
 * fenêtre ouverte sur l'URL ne porterait pas le jeton — on récupérerait une
 * page 401 au lieu du reçu.
 */
export async function ouvrirRecuPdf(recu: RecuCaisse): Promise<boolean> {
  const { data } = await api.get<Blob>(`/recus-caisse/${recu.id}/pdf`, { responseType: 'blob' });
  const url = URL.createObjectURL(data);
  const fenetre = window.open(url, '_blank');
  // Révocation différée : libérer l'URL trop tôt laisserait un onglet vide.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return !!fenetre;
}

/** Compatibilité : le nom d'avant, conservé pour les appelants existants. */
export function imprimerRecu(recu: RecuCaisse): void {
  void ouvrirRecuPdf(recu);
}
