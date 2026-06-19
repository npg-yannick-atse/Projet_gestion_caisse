import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationService } from '@modules/security/authorization.service';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Guard global de rôles. Ne s'applique qu'aux routes décorées par @Roles(...) :
 * une route sans @Roles n'est pas restreinte ici (autorisation gérée ailleurs ou route publique).
 * Les admins (SUPER_ADMIN / ADMINISTRATEUR) passent toujours.
 *
 * Doit s'exécuter APRÈS JwtAuthGuard (qui peuple req.user) — cf. ordre des APP_GUARD.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authz: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const userId = req.user?.sub;
    if (!userId) throw new ForbiddenException('Authentification requise.');

    const codes = await this.authz.getUserRoleCodes(userId);
    if (this.authz.isAdminCodes(codes) || required.some((r) => codes.has(r))) {
      return true;
    }
    throw new ForbiddenException(
      `Action non autorisée. Rôle requis : ${required.join(', ')}.`,
    );
  }
}
