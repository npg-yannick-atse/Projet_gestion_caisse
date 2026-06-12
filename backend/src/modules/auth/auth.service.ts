import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '@modules/security/users/users.service';
import { User } from '@modules/security/entities/user.entity';
import { JwtPayload } from './decorators/current-user.decorator';
import { Plateforme, TokensResponse } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Authentification via le service LDAP NPG.
   * Le LDAP est l'autorité du mot de passe ; l'utilisateur doit en plus
   * exister et être actif dans la base locale (matricule = clé stable) pour
   * porter les droits applicatifs (rôles/permissions).
   */
  async validateUser(identifiant: string, motDePasse: string): Promise<User> {
    const ldap = await this.ldapAuthenticate(identifiant, motDePasse);
    const matriculeLdap = this.extractMatricule(ldap);

    const user =
      (matriculeLdap ? await this.users.findByMatricule(matriculeLdap) : null) ??
      (identifiant.includes('@')
        ? await this.users.findByEmail(identifiant)
        : await this.users.findByMatricule(identifiant));

    if (!user || !user.estActif) {
      throw new UnauthorizedException(
        "Compte introuvable ou désactivé dans l'application. Contactez l'administrateur.",
      );
    }
    return user;
  }

  /** Appelle POST {LDAP_AUTH_URL} { username, password }. 200 = OK, 401/403 = refus. */
  private async ldapAuthenticate(username: string, password: string): Promise<unknown> {
    const url = this.config.get<string>('ldap.authUrl')!;
    const timeoutMs = this.config.get<number>('ldap.timeoutMs') ?? 8000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: controller.signal,
      });
    } catch (err) {
      this.logger.error(`LDAP injoignable (${url}): ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        "Service d'authentification injoignable. Réessayez plus tard.",
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 200) {
      return response.json().catch(() => ({}));
    }
    if (response.status === 401 || response.status === 403) {
      throw new UnauthorizedException('Identifiants invalides');
    }
    this.logger.error(`Réponse LDAP inattendue: ${response.status}`);
    throw new ServiceUnavailableException("Erreur du service d'authentification.");
  }

  /** Extrait le matricule de la réponse LDAP (formats observés sur le service NPG). */
  private extractMatricule(data: unknown): string | null {
    const d = data as {
      matricule?: unknown;
      id_user?: unknown;
      user?: { matricule?: unknown; id_user?: unknown };
    } | null;
    const raw = d?.user?.matricule ?? d?.matricule ?? d?.id_user ?? d?.user?.id_user;
    return raw != null ? String(raw).trim() : null;
  }

  async login(
    identifiant: string,
    motDePasse: string,
    plateforme?: Plateforme,
  ): Promise<TokensResponse & { user: User }> {
    const user = await this.validateUser(identifiant, motDePasse);
    this.assertPlatformAccess(user, plateforme);
    await this.users.updateLastConnection(user.id);
    const tokens = await this.issueTokens(user);
    return { ...tokens, user };
  }

  /** Refuse la connexion si le compte n'est pas autorisé sur la plateforme du client. */
  private assertPlatformAccess(user: User, plateforme?: Plateforme): void {
    if (plateforme === 'WEB' && user.accesWeb === false) {
      throw new ForbiddenException(
        "Ce compte n'est pas autorisé à se connecter sur l'application web.",
      );
    }
    if (plateforme === 'MOBILE' && user.accesMobile === false) {
      throw new ForbiddenException(
        "Ce compte n'est pas autorisé à se connecter sur l'application mobile.",
      );
    }
  }

  async refresh(refreshToken: string): Promise<TokensResponse> {
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
      const user = await this.users.findOne(payload.sub);
      return this.issueTokens(user);
    } catch {
      throw new UnauthorizedException('Refresh token invalide ou expire');
    }
  }

  private async issueTokens(user: User): Promise<TokensResponse> {
    const payload: JwtPayload = {
      sub: user.id,
      matricule: user.matricule,
      email: user.email,
    };

    const accessExpiresIn = this.config.get<string>('jwt.expiresIn') ?? '15m';
    const refreshExpiresIn = this.config.get<string>('jwt.refreshExpiresIn') ?? '7d';

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.get<string>('jwt.secret'),
        expiresIn: accessExpiresIn,
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: refreshExpiresIn,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.parseDurationSeconds(accessExpiresIn),
    };
  }

  private parseDurationSeconds(s: string): number {
    const m = s.match(/^(\d+)([smhd])$/);
    if (!m) return 900;
    const n = parseInt(m[1], 10);
    const unit = m[2];
    return unit === 's' ? n : unit === 'm' ? n * 60 : unit === 'h' ? n * 3600 : n * 86400;
  }
}
