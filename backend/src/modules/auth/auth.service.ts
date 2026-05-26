import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '@modules/security/users/users.service';
import { User } from '@modules/security/entities/user.entity';
import { JwtPayload } from './decorators/current-user.decorator';
import { TokensResponse } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async validateUser(identifiant: string, motDePasse: string): Promise<User> {
    const user = identifiant.includes('@')
      ? await this.users.findByEmail(identifiant)
      : await this.users.findByMatricule(identifiant);

    if (!user || !user.estActif) {
      throw new UnauthorizedException('Identifiants invalides');
    }
    const ok = await this.users.verifyPassword(motDePasse, user.motDePasseHash);
    if (!ok) {
      throw new UnauthorizedException('Identifiants invalides');
    }
    return user;
  }

  async login(identifiant: string, motDePasse: string): Promise<TokensResponse & { user: User }> {
    const user = await this.validateUser(identifiant, motDePasse);
    await this.users.updateLastConnection(user.id);
    const tokens = await this.issueTokens(user);
    return { ...tokens, user };
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
