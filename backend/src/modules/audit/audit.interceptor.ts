import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { DataSource } from 'typeorm';
import { AuditService } from './audit.service';

const AUDITED_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Ressources JAMAIS journalisées, si mutantes soient-elles.
 *
 * Critère : l'appel ne relate aucune décision de l'utilisateur sur des données
 * métier. Il est technique, répétitif, et il a déjà sa destination propre.
 *
 * `telemetry` en est l'exemple : le frontend envoie ses clics et ses
 * navigations toutes les quelques secondes, et le contrôleur les écrit déjà
 * dans les fichiers `ui-AAAA-MM-JJ.jsonl`. Journalisées EN PLUS dans l'audit,
 * elles y représentaient 2 989 lignes sur 3 789 — 79 % — et noyaient les vraies
 * actions : 22 bons créés, 15 encaissements. Un journal qu'on ne peut plus lire
 * ne protège plus rien.
 */
const RESSOURCES_NON_AUDITEES = new Set(['telemetry']);
const VERB_BY_METHOD: Record<string, string> = {
  POST: 'CREER',
  PATCH: 'MODIFIER',
  PUT: 'MODIFIER',
  DELETE: 'SUPPRIMER',
};
// Clés à ne jamais journaliser (secrets / charges lourdes).
const SENSITIVE_KEYS = /mot.?de.?passe|password|signatureImage|signature_image/i;
const MAX_VALUE_LEN = 4000;

// Ressource (1er segment d'URL) → table SQL. Sert à capturer l'« ancienne valeur »
// avant un PATCH/DELETE simple (/ressource/:id) — pour tracer ce qui a été modifié/supprimé.
const TABLE_BY_RESOURCE: Record<string, string> = {
  users: 'sec_user',
  directions: 'sec_direction',
  roles: 'sec_role',
  profils: 'sec_profil',
  interims: 'sec_interim',
  caisses: 'fin_caisse',
  portefeuilles: 'fin_portefeuille',
  partenaires: 'ref_partenaire',
  'cost-centers': 'ref_cost_center',
  'natures-operation': 'ref_nature_operation',
  'plan-comptable': 'ref_plan_comptable',
  bons: 'trx_bon',
};

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const method: string = req?.method ?? '';

    // On ne journalise que les actions mutantes d'un utilisateur authentifié.
    const userId: string | undefined = req?.user?.sub;
    if (!AUDITED_METHODS.has(method) || !userId) {
      return next.handle();
    }

    const path = String(req.originalUrl || req.url || '').split('?')[0];
    const clean = path.replace(/^\/api\/v\d+/i, '').replace(/^\/+/, '');
    const segments = clean.split('/').filter(Boolean);
    const resource = segments[0] ?? '—';

    if (RESSOURCES_NON_AUDITEES.has(resource)) {
      return next.handle();
    }

    const numericIds = segments.filter((s) => /^\d+$/.test(s));
    const subSegments = segments.slice(1).filter((s) => !/^\d+$/.test(s));
    const action = subSegments.length > 0 ? subSegments.join('/') : VERB_BY_METHOD[method] ?? method;
    const entiteId = numericIds[0] ?? null;

    // Paires ressource→id présentes dans l'URL (ex. /users/2/roles/4 → users:2, roles:4).
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < segments.length - 1; i++) {
      if (!/^\d+$/.test(segments[i]) && /^\d+$/.test(segments[i + 1])) {
        pairs.push([segments[i], segments[i + 1]]);
      }
    }
    // Cible(s) au-delà de l'entité principale (ex. le rôle attaché à l'utilisateur).
    const cible = Object.fromEntries(pairs.slice(1));

    const ip =
      (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket?.remoteAddress ||
      null;
    const userAgent = (req.headers?.['user-agent'] as string) ?? null;

    // Détail (nouvelle valeur) : le corps s'il est informatif ; sinon, pour les endpoints
    // d'attache/détache (attribuer un rôle/profil/permission), on reconstitue la cible depuis
    // l'URL et le sens de l'opération — pour ne plus journaliser un Détail vide « {} ».
    const bodyJson = this.serializeValue(req.body);
    const hasBody = !!bodyJson && bodyJson !== '{}';
    const op = method === 'POST' ? 'ajout' : method === 'DELETE' ? 'retrait' : undefined;
    const nouvelleValeur = hasBody
      ? bodyJson
      : Object.keys(cible).length > 0
        ? JSON.stringify({ ...cible, ...(op ? { op } : {}) })
        : // Action sans corps (ex. finalize / cancel / valider) : on évite un Détail
          // vide « {} » en consignant l'action et la cible déduites de l'URL.
          entiteId
          ? JSON.stringify({ action, cible: `${resource}#${entiteId}` })
          : bodyJson;

    // Ancienne valeur : pour un PATCH/DELETE simple (/ressource/:id), on lit la ligne AVANT
    // l'action, afin de tracer ce qui a été modifié/supprimé.
    const wantOld =
      (method === 'DELETE' || method === 'PATCH') &&
      segments.length === 2 &&
      /^\d+$/.test(segments[1] ?? '') &&
      !!TABLE_BY_RESOURCE[resource];

    return from(wantOld ? this.fetchOld(resource, segments[1]) : Promise.resolve(null)).pipe(
      switchMap((ancienneValeur) =>
        next.handle().pipe(
          tap((response) => {
            // À la création, l'id n'est pas dans l'URL : on le récupère dans la réponse.
            const finalId =
              entiteId ?? (response && typeof response === 'object' ? response.id ?? null : null);
            void this.audit.record({
              userId,
              action,
              entiteConcernee: resource,
              entiteId: finalId ?? null,
              ancienneValeur,
              nouvelleValeur,
              adresseIp: ip,
              userAgent,
            });
          }),
        ),
      ),
    );
  }

  /** Lit la ligne `id` de `table` (whitelist) et la sérialise comme ancienne valeur. */
  private async fetchOld(resource: string, id: string): Promise<string | null> {
    const table = TABLE_BY_RESOURCE[resource];
    if (!table) return null;
    try {
      // `id` est strictement numérique (validé) et `table` vient d'une whitelist → pas d'injection.
      const rows = await this.dataSource.query(`SELECT TOP 1 * FROM dbo.${table} WHERE id = ${id}`);
      if (!Array.isArray(rows) || rows.length === 0) return null;
      return this.serializeValue(rows[0]);
    } catch {
      return null;
    }
  }

  private serializeValue(value: unknown): string | null {
    if (value == null || typeof value !== 'object') return null;
    try {
      const clone: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        clone[k] = SENSITIVE_KEYS.test(k) ? '«masqué»' : v;
      }
      let json = JSON.stringify(clone);
      if (json.length > MAX_VALUE_LEN) json = json.slice(0, MAX_VALUE_LEN) + '…[tronqué]';
      return json;
    } catch {
      return null;
    }
  }
}
