import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Journalisation FICHIER pour le suivi des tests.
 *
 * Écrit des lignes JSON (format JSONL : une ligne = un objet JSON) directement
 * exploitables par grep / jq / Excel / Grafana-Loki, sans toucher à la base :
 *   - access-YYYY-MM-DD.jsonl : une ligne par requête HTTP (métadonnées, jamais le corps).
 *   - error-YYYY-MM-DD.jsonl  : une ligne par erreur serveur / exception (avec stack).
 *
 * Répertoire : variable d'env LOG_DIR, sinon « <racine backend>/logs ».
 * Tolérant aux pannes : n'interrompt JAMAIS l'application (écriture best-effort).
 */
class TestFileLogger {
  private readonly dir: string;
  private ready = false;

  constructor() {
    this.dir = process.env.LOG_DIR
      ? path.resolve(process.env.LOG_DIR)
      : path.join(process.cwd(), 'logs');
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      this.ready = true;
    } catch {
      this.ready = false;
    }
  }

  /** Horodatage jour local YYYY-MM-DD (pour la rotation quotidienne des fichiers). */
  private dayStamp(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
  }

  private append(kind: 'access' | 'error' | 'ui', entry: Record<string, unknown>): void {
    if (!this.ready) return;
    const file = path.join(this.dir, `${kind}-${this.dayStamp(new Date())}.jsonl`);
    try {
      // Écriture asynchrone « fire-and-forget » : toute erreur d'E/S est ignorée
      // pour ne pas perturber la requête en cours.
      fs.appendFile(file, JSON.stringify(entry) + '\n', () => undefined);
    } catch {
      /* jamais bloquant */
    }
  }

  /** Une requête HTTP terminée. */
  access(entry: Record<string, unknown>): void {
    this.append('access', entry);
  }

  /** Une erreur serveur / exception (avec stack). */
  error(entry: Record<string, unknown>): void {
    this.append('error', entry);
  }

  /** Un événement d'interface (clic, navigation) remonté par le frontend. */
  ui(entry: Record<string, unknown>): void {
    this.append('ui', entry);
  }

  get directory(): string {
    return this.dir;
  }
}

/** Singleton partagé (middleware + filtre d'exceptions). */
export const testLogger = new TestFileLogger();
