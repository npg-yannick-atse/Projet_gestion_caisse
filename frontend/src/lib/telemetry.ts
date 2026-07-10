import { api } from './api';
import { getAccessToken } from './token';

/**
 * Télémétrie d'INTERFACE (suivi des tests) : capture les navigations et les clics et
 * les envoie, par lots, à l'API (POST /telemetry → fichiers ui-*.jsonl côté backend).
 *
 * - Batché (toutes les ~4 s ou tous les 15 événements) pour ne pas surcharger.
 * - Uniquement en session authentifiée (sinon l'endpoint renverrait 401).
 * - Best-effort : n'interrompt JAMAIS l'application (erreurs silencieuses).
 * - Ne capture QUE des libellés (aucune valeur de champ saisie → pas de données sensibles).
 */
type UiEvent = { type: string; path?: string; label?: string; ts: string };

let queue: UiEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush(): void {
  if (timer != null) return;
  timer = setTimeout(() => {
    void flushTelemetry();
  }, 4000);
}

export function track(type: string, data?: { path?: string; label?: string }): void {
  if (!getAccessToken()) return; // pas de session → on ne trace pas
  queue.push({
    type,
    path: data?.path ?? (typeof window !== 'undefined' ? window.location.pathname : undefined),
    label: data?.label,
    ts: new Date().toISOString(),
  });
  if (queue.length >= 15) void flushTelemetry();
  else scheduleFlush();
}

export async function flushTelemetry(): Promise<void> {
  if (timer != null) {
    clearTimeout(timer);
    timer = null;
  }
  if (queue.length === 0 || !getAccessToken()) return;
  const events = queue;
  queue = [];
  try {
    await api.post('/telemetry', { events });
  } catch {
    /* silencieux : la télémétrie ne doit jamais perturber l'app */
  }
}

// Envoi au passage en arrière-plan / fermeture d'onglet (best-effort).
if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushTelemetry();
  });
}
