import { useEffectiveRoles } from '../api/users';
import { useAuthStore } from '../store/auth';
import type { Role } from '../types';

/** Rôles autorisés à valider/refuser un bon (admins & DAF inclus via l'expansion serveur). */
const VALIDATION_ROLES = ['VALIDATEUR', 'SUPER_ADMIN', 'ADMINISTRATEUR', 'DAF'];

/** Vrai si l'utilisateur connecté peut valider des bons (gating UI ; le backend reste la référence). */
export function useCanValidate(): boolean {
  const user = useAuthStore((s) => s.user);
  const { data: roles } = useEffectiveRoles(user?.id);
  const list: Role[] = roles ?? [];
  return list.some((r) => VALIDATION_ROLES.includes(r.code));
}
