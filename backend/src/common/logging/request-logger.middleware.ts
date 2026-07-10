import type { NextFunction, Request, Response } from 'express';
import { testLogger } from './test-logger';

// Clés à ne jamais journaliser (secrets / charges lourdes).
const SENSITIVE = /mot.?de.?passe|password|signatureImage|signature_image|token/i;
const MAX_LEN = 2000;
const MUTATIONS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/** Sérialise en masquant les clés sensibles et en tronquant les grosses valeurs. */
function safe(value: unknown): string | undefined {
  if (value == null || typeof value !== 'object') return undefined;
  try {
    const clone: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      clone[k] = SENSITIVE.test(k) ? '«masqué»' : v;
    }
    let json = JSON.stringify(clone);
    if (!json || json === '{}') return undefined;
    if (json.length > MAX_LEN) json = json.slice(0, MAX_LEN) + '…[tronqué]';
    return json;
  } catch {
    return undefined;
  }
}

/**
 * Journalise CHAQUE requête HTTP (une ligne JSONL) au moment où la réponse se termine.
 * Capture aussi :
 *   - le CORPS envoyé par l'utilisateur sur les actions (POST/PATCH/PUT/DELETE), masqué ;
 *   - la RÉPONSE du serveur pour les erreurs (le message qu'il/elle voit) et le résultat
 *     des actions — pour « voir ce qu'on lui répond ». Les GET en succès ne consignent pas
 *     leur corps (volumineux et sans intérêt : simple lecture de données).
 *
 * On ne journalise jamais de secret (mot de passe, signature, token masqués).
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  // Capture du corps de réponse : on intercepte res.json (utilisé par Nest/Express).
  let responseBody: unknown;
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    responseBody = body;
    return originalJson(body);
  };

  res.on('finish', () => {
    try {
      const status = res.statusCode;
      const method = req.method;

      // Filtre du BRUIT : on ne journalise ni les préflights CORS (OPTIONS) ni les
      // réponses « non modifié » (304) du polling/cache — elles noient les vraies
      // actions sans rien apporter. Le reste (GET 200, actions, erreurs, 401) est gardé.
      if (method === 'OPTIONS' || status === 304) return;

      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      const user = (req as { user?: { sub?: string; matricule?: string } }).user;
      const ip =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.ip ||
        req.socket?.remoteAddress ||
        null;

      const path = String(req.originalUrl || req.url || '').split('?')[0];
      const isMutation = MUTATIONS.has(method);
      const isError = status >= 400;
      // La télémétrie d'interface a son propre fichier (ui-*.jsonl) : inutile de
      // recopier son corps dans le journal d'accès.
      const skipBody = path.endsWith('/telemetry');

      const entry: Record<string, unknown> = {
        ts: new Date().toISOString(),
        level: status >= 500 ? 'error' : isError ? 'warn' : 'info',
        method,
        path,
        status,
        durationMs: Math.round(durationMs * 10) / 10,
        userId: user?.sub ?? null,
        matricule: user?.matricule ?? null,
        ip,
        userAgent: (req.headers['user-agent'] as string) ?? null,
      };

      // Ce qu'elle a envoyé (uniquement sur les actions).
      if (isMutation && !skipBody) {
        const body = safe(req.body);
        if (body) entry.requestBody = body;
      }
      // Ce qu'on lui répond : toujours sur erreur (message vu), sinon résultat d'action.
      if ((isError || isMutation) && !skipBody) {
        const resp = safe(responseBody);
        if (resp) entry.responseBody = resp;
      }

      testLogger.access(entry);
    } catch {
      /* la journalisation ne doit jamais casser la requête */
    }
  });

  next();
}
