import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface LdapUserDto {
  idLdap: number | null;
  username: string;
  matricule: string;
  nom: string;
  prenom: string;
  email: string | null;
}

/** Proxy vers l'annuaire LDAP NPG (GET {LDAP_USERS_URL}) + normalisation des champs. */
@Injectable()
export class LdapDirectoryService {
  private readonly logger = new Logger(LdapDirectoryService.name);

  constructor(private readonly config: ConfigService) {}

  async listUsers(): Promise<LdapUserDto[]> {
    const url = this.config.get<string>('ldap.usersUrl')!;
    const timeoutMs = this.config.get<number>('ldap.timeoutMs') ?? 8000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, { method: 'GET', signal: controller.signal });
    } catch (err) {
      this.logger.error(`LDAP annuaire injoignable (${url}): ${(err as Error).message}`);
      throw new ServiceUnavailableException("Annuaire LDAP injoignable.");
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      this.logger.error(`Réponse LDAP /users inattendue : ${response.status}`);
      throw new ServiceUnavailableException("Erreur de l'annuaire LDAP.");
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new ServiceUnavailableException("Réponse LDAP invalide (JSON attendu).");
    }

    const raws = Array.isArray(data)
      ? data
      : Array.isArray((data as { users?: unknown[] })?.users)
        ? (data as { users: unknown[] }).users
        : [];

    return raws
      .map((r) => this.normalize(r))
      .filter((u): u is LdapUserDto => u !== null);
  }

  private normalize(raw: unknown): LdapUserDto | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;

    // Exclure les comptes désactivés (actif = 0/false)
    if ('actif' in obj && obj.actif !== undefined && obj.actif !== null) {
      const a = obj.actif;
      if (a === 0 || a === false || a === '0') return null;
    }

    const username = (obj.username ?? obj.userName ?? obj.login) as string | undefined;
    if (!username || typeof username !== 'string') return null;

    const idUserRaw = obj.id_user ?? obj.idUser ?? obj.id;
    const idLdap =
      typeof idUserRaw === 'number'
        ? idUserRaw
        : Number.parseInt(String(idUserRaw ?? ''), 10);
    const idLdapNum = Number.isFinite(idLdap) ? idLdap : null;

    const matricule =
      (typeof obj.matricule === 'string' && obj.matricule) ||
      (typeof obj.matricule === 'number' && String(obj.matricule)) ||
      (idLdapNum !== null ? String(idLdapNum) : '');
    if (!matricule) return null;

    const fullName =
      (typeof obj.fullName === 'string' && obj.fullName) ||
      (typeof obj.name_user === 'string' && obj.name_user) ||
      (typeof obj.displayName === 'string' && obj.displayName) ||
      (typeof obj.name === 'string' && obj.name) ||
      '';
    const parts = fullName.split(' ').filter(Boolean);
    const [prenomFromFull, ...rest] = parts;
    const nomFromFull = rest.join(' ');

    const prenom = (typeof obj.prenom === 'string' && obj.prenom) || prenomFromFull || '';
    const nom = (typeof obj.nom === 'string' && obj.nom) || nomFromFull || '';

    return {
      idLdap: idLdapNum,
      username,
      matricule,
      nom,
      prenom,
      email: typeof obj.email === 'string' ? obj.email : null,
    };
  }
}
