import { useEffect, useRef } from 'react';
import { useBonsAValider } from '@/api/bons';
import { registerPushToken } from '@/api/push';
import { useCanValidate } from '@/lib/roles';
import {
  configureNotifications,
  ensureNotificationPermissions,
  presentBonsAValiderNotification,
} from '@/lib/notifications';
import { getExpoPushToken } from '@/lib/push';
import { registerBackgroundNotifs, unregisterBackgroundNotifs } from '@/lib/backgroundNotifs';
import { useAuthStore } from '@/store/auth';
import type { Bon } from '@/types';

/**
 * Pilote les notifications « bons à valider » :
 * - premier plan : notification immédiate quand de nouveaux bons arrivent (Expo Go OK) ;
 * - arrière-plan : tâche planifiée (nécessite un dev build).
 * Ne rend rien.
 */
export function NotificationsManager() {
  const canValidate = useCanValidate();
  const userId = useAuthStore((s) => s.user?.id);
  const { data } = useBonsAValider(canValidate);
  const seen = useRef<Set<string> | null>(null);

  // Configuration + permission, une fois.
  useEffect(() => {
    void (async () => {
      await configureNotifications();
      await ensureNotificationPermissions();
    })();
  }, []);

  // Enregistre le jeton push de l'appareil dès qu'un utilisateur est connecté
  // (pour les notifications push, app fermée — nécessite un dev build).
  useEffect(() => {
    if (!userId) return;
    void (async () => {
      const token = await getExpoPushToken();
      if (token) {
        try {
          await registerPushToken(token);
        } catch {
          /* best-effort */
        }
      }
    })();
  }, [userId]);

  // (Dés)enregistre la tâche d'arrière-plan selon le rôle.
  useEffect(() => {
    if (canValidate) void registerBackgroundNotifs();
    else void unregisterBackgroundNotifs();
  }, [canValidate]);

  // Premier plan : notifie sur les nouveaux bons (sans notifier au tout 1er chargement).
  useEffect(() => {
    if (!canValidate || !data) return;
    const list: Bon[] = data;
    const ids = new Set(list.map((b) => String(b.id)));
    if (seen.current === null) {
      seen.current = ids;
      return;
    }
    const fresh = [...ids].filter((id) => !seen.current!.has(id));
    if (fresh.length > 0) void presentBonsAValiderNotification(fresh.length);
    seen.current = ids;
  }, [data, canValidate]);

  return null;
}
