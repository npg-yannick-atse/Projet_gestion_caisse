import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from './audit.service';

const AUDITED_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const VERB_BY_METHOD: Record<string, string> = {
  POST: 'CREER',
  PATCH: 'MODIFIER',
  PUT: 'MODIFIER',
  DELETE: 'SUPPRIMER',
};
// Clés à ne jamais journaliser (secrets / charges lourdes).
const SENSITIVE_KEYS = /mot.?de.?passe|password|signatureImage|signature_image/i;
const MAX_VALUE_LEN = 4000;

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

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
    const numericIds = segments.filter((s) => /^\d+$/.test(s));
    const subSegments = segments.slice(1).filter((s) => !/^\d+$/.test(s));
    const action = subSegments.length > 0 ? subSegments.join('/') : VERB_BY_METHOD[method] ?? method;
    const entiteId = numericIds[0] ?? null;

    const ip =
      (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket?.remoteAddress ||
      null;
    const userAgent = (req.headers?.['user-agent'] as string) ?? null;
    const nouvelleValeur = this.serializeBody(req.body);

    return next.handle().pipe(
      tap((response) => {
        // À la création, l'id n'est pas dans l'URL : on le récupère dans la réponse.
        const finalId = entiteId ?? (response && typeof response === 'object' ? response.id ?? null : null);
        void this.audit.record({
          userId,
          action,
          entiteConcernee: resource,
          entiteId: finalId ?? null,
          nouvelleValeur,
          adresseIp: ip,
          userAgent,
        });
      }),
    );
  }

  private serializeBody(body: unknown): string | null {
    if (body == null || typeof body !== 'object') return null;
    try {
      const clone: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
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
