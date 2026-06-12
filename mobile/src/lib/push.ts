import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { ensureNotificationPermissions } from './notifications';

/**
 * Récupère le jeton Expo Push de l'appareil (pour les notifications app fermée).
 * Renvoie null si refusé / indisponible (ex. Expo Go sans projet EAS).
 */
export async function getExpoPushToken(): Promise<string | null> {
  try {
    const granted = await ensureNotificationPermissions();
    if (!granted) return null;

    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
      (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;

    const res = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return res.data ?? null;
  } catch {
    return null;
  }
}
