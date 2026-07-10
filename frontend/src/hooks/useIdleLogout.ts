import { useEffect, useRef } from 'react';
import { getLastActivity, touchActivity } from '@/lib/token';

/** Délai d'inactivité avant déconnexion automatique : 1 heure. */
const IDLE_MS = 60 * 60 * 1000;
/** Écriture de l'horodatage au plus une fois toutes les 5 s (throttle). */
const WRITE_THROTTLE_MS = 5000;
/** Fréquence de vérification de l'inactivité. */
const CHECK_INTERVAL_MS = 30_000;

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

/**
 * Déconnecte l'utilisateur après {@link IDLE_MS} sans activité souris/clavier,
 * même si l'onglet reste ouvert. La vérification a lieu périodiquement ET au
 * retour de focus/visibilité (l'utilisateur qui revient après une longue absence
 * est déconnecté immédiatement). `enabled` = false désactive le mécanisme
 * (ex. utilisateur non connecté).
 */
export function useIdleLogout(onIdle: () => void, enabled: boolean): void {
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!enabled) return;

    // Amorce l'horodatage s'il est absent (ex. session déjà ouverte au chargement).
    if (getLastActivity() == null) touchActivity();

    let firedIdle = false;
    const fireIfIdle = () => {
      if (firedIdle) return;
      const last = getLastActivity();
      if (last != null && Date.now() - last >= IDLE_MS) {
        firedIdle = true;
        onIdleRef.current();
      }
    };

    // Absence déjà trop longue au montage → déconnexion immédiate.
    fireIfIdle();
    if (firedIdle) return;

    let lastWrite = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - lastWrite > WRITE_THROTTLE_MS) {
        lastWrite = now;
        touchActivity();
      }
    };

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    const onVisible = () => {
      if (document.visibilityState === 'visible') fireIfIdle();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', fireIfIdle);
    const interval = window.setInterval(fireIfIdle, CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', fireIfIdle);
      window.clearInterval(interval);
    };
  }, [enabled]);
}
