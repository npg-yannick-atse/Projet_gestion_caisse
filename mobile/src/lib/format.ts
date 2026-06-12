import type { BonStatut } from '../types';

/** Formate un montant (chaîne décimale) avec séparateurs d'espaces. */
export function formatMontant(value: string | number): string {
  const n = Number(value ?? 0);
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
}

/** Date du jour au format YYYY-MM-DD (heure locale). */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Date courte fr (JJ/MM/AAAA) depuis une chaîne ISO. */
export function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR');
}

export const STATUT_META: Record<BonStatut, { label: string; bg: string; fg: string }> = {
  CREE: { label: 'En attente', bg: '#FFFBEB', fg: '#B45309' },
  VALIDE: { label: 'Validé', bg: '#EFF6FF', fg: '#1A6DB5' },
  DECAISSE: { label: 'Décaissé', bg: '#ECFDF5', fg: '#047857' },
  COMPTABILISE: { label: 'Comptabilisé', bg: '#ECFEFF', fg: '#0E7490' },
  ANNULE: { label: 'Annulé', bg: '#F1F5F9', fg: '#64748B' },
  REFUSE: { label: 'Refusé', bg: '#FEF2F2', fg: '#B42318' },
};
