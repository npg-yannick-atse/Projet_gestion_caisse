import { create } from 'zustand';
import type { RoleCode } from '@/types/api';

export type Persona =
  | 'SUPER_ADMIN'
  | 'DAF'
  | 'ADMIN'
  | 'VALIDATEUR'
  | 'CAISSIER'
  | 'GESTIONNAIRE_PORTEFEUILLE'
  | 'DEMANDEUR';

/** Ordre de priorité par défaut (du plus puissant au moins puissant). */
const DEFAULT_PRIORITY: Persona[] = [
  'SUPER_ADMIN',
  'DAF',
  'ADMIN',
  'CAISSIER',
  'VALIDATEUR',
  'GESTIONNAIRE_PORTEFEUILLE',
  'DEMANDEUR',
];

/** Mapping RoleCode → Persona. */
function roleToPersona(code: RoleCode): Persona {
  if (code === 'SUPER_ADMIN') return 'SUPER_ADMIN';
  if (code === 'ADMINISTRATEUR') return 'ADMIN';
  return code as Persona; // DAF / VALIDATEUR / CAISSIER / GESTIONNAIRE_PORTEFEUILLE / DEMANDEUR
}

/** Personas disponibles d'après les rôles attribués. */
export function availablePersonas(roleCodes: Set<RoleCode>): Persona[] {
  const set = new Set<Persona>();
  roleCodes.forEach((code) => set.add(roleToPersona(code)));
  // Le DAF est un persona COMBINÉ : il absorbe Admin + Caissier afin de présenter
  // un seul tableau de bord fusionné (pas de bascule à deux onglets).
  if (set.has('DAF')) {
    set.delete('ADMIN');
    set.delete('CAISSIER');
  }
  // Tri par priorité par défaut pour stabilité d'affichage
  return DEFAULT_PRIORITY.filter((p) => set.has(p));
}

/** Persona par défaut quand l'utilisateur n'a pas explicitement choisi. */
export function defaultPersona(roleCodes: Set<RoleCode>): Persona {
  const available = availablePersonas(roleCodes);
  return available[0] ?? 'DEMANDEUR';
}

const STORAGE_KEY = 'fdc.persona.active';

interface PersonaState {
  /** Persona explicitement choisi par l'utilisateur (sinon null = défaut). */
  activePersona: Persona | null;
  /** Définit le persona actif et le persiste. */
  setActivePersona: (p: Persona | null) => void;
  /** Resette au comportement par défaut (priorité). */
  clear: () => void;
}

function readStoredPersona(): Persona | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  // Validation contre la liste connue (évite valeurs corrompues)
  if (DEFAULT_PRIORITY.includes(raw as Persona)) return raw as Persona;
  return null;
}

export const usePersonaStore = create<PersonaState>((set) => ({
  activePersona: readStoredPersona(),
  setActivePersona: (p) => {
    if (typeof window !== 'undefined') {
      if (p === null) window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, p);
    }
    set({ activePersona: p });
  },
  clear: () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    set({ activePersona: null });
  },
}));

/**
 * Détermine le persona effectif :
 * - si l'utilisateur a choisi un persona ET qu'il y a toujours droit → on le respecte
 * - sinon → on retombe sur la priorité par défaut
 */
export function effectivePersona(
  roleCodes: Set<RoleCode>,
  chosen: Persona | null,
): Persona {
  const available = availablePersonas(roleCodes);
  if (chosen && available.includes(chosen)) return chosen;
  return available[0] ?? 'DEMANDEUR';
}
