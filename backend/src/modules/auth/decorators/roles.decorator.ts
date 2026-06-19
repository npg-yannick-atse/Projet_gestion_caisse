import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'required_roles';

/**
 * Restreint une route (méthode ou contrôleur) aux rôles indiqués.
 * Les admins (SUPER_ADMIN / ADMINISTRATEUR) passent toujours (cf. RolesGuard).
 * Sans ce décorateur, le RolesGuard ne se prononce pas (route non restreinte par rôle).
 *
 * Exemple : @Roles('CAISSIER')  ou  @Roles('ADMINISTRATEUR')
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
