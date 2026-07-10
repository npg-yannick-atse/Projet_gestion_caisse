import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';

/**
 * Nettoie les espaces superflus (trim) sur toutes les chaînes des `body` et `query`
 * AVANT la validation. Sans ça, `@IsNotEmpty` accepte « "   " » (longueur ≥ 1) et un
 * champ rempli uniquement d'espaces passerait la validation.
 *
 * Doit être enregistré AVANT le ValidationPipe (cf. main.ts).
 */
// Champs à NE PAS trimmer : un mot de passe peut légitimement contenir des
// espaces en début/fin — les retirer casserait l'authentification.
const SKIP_TRIM_KEYS = /mot.?de.?passe|password|pwd/i;

@Injectable()
export class TrimPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (metadata.type !== 'body' && metadata.type !== 'query') return value;
    return this.trim(value);
  }

  private trim(value: unknown): unknown {
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) return value.map((v) => this.trim(v));
    // Uniquement les objets « simples » (JSON) — on ne touche pas aux Date, Buffer, etc.
    if (value && typeof value === 'object' && (value as object).constructor === Object) {
      const obj = value as Record<string, unknown>;
      for (const k of Object.keys(obj)) {
        obj[k] = SKIP_TRIM_KEYS.test(k) ? obj[k] : this.trim(obj[k]);
      }
      return obj;
    }
    return value;
  }
}
