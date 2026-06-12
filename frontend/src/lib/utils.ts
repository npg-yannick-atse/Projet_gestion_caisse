import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { AxiosError } from 'axios';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Extrait un message d'erreur lisible d'une erreur axios. */
export function apiErrorMessage(error: unknown, fallback = 'Une erreur est survenue'): string {
  if (error instanceof AxiosError) {
    const msg = (error.response?.data as { message?: string | string[] })?.message;
    if (Array.isArray(msg)) return msg.join(', ');
    return msg ?? fallback;
  }
  return fallback;
}

/** Formate un montant string DECIMAL(19,4) pour affichage (sans décimales). */
export function formatMontant(montant: string | number | null | undefined): string {
  if (montant === null || montant === undefined || montant === '') return '—';
  const n = typeof montant === 'string' ? Number(montant) : montant;
  if (Number.isNaN(n)) return String(montant);
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(n));
}

/** Renvoie l'âge "il y a X" en français à partir d'un ISO date. */
export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

/** Renvoie un libellé d'âge concis ("12 h", "3 j"). */
export function ageLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / (1000 * 60 * 60));
  if (h < 24) return `${Math.max(0, h)} h`;
  const d = Math.floor(h / 24);
  return `${d} j`;
}
