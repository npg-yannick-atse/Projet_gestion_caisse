import axios from 'axios';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import { API_URL } from './config';

const TASK = 'fdc-bons-a-valider';
const KEY_SEEN = 'fdc.bgSeenBonsAValider';

/**
 * Tâche d'arrière-plan : interroge périodiquement la file « à valider » et notifie
 * s'il y a de nouveaux bons. ⚠️ Nécessite un dev build (ne tourne pas en Expo Go).
 * L'intervalle minimum imposé par l'OS est ~15 min.
 */
TaskManager.defineTask(TASK, async () => {
  try {
    const token = await SecureStore.getItemAsync('fdc.accessToken');
    if (!token) return BackgroundFetch.BackgroundFetchResult.NoData;

    const { data } = await axios.get(`${API_URL}/bons`, {
      params: { statut: 'CREE' },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 12000,
    });
    const ids: string[] = (data ?? []).map((b: { id: string | number }) => String(b.id));

    const raw = await SecureStore.getItemAsync(KEY_SEEN);
    const seen: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    const fresh = ids.filter((id) => !seen.includes(id));

    if (fresh.length > 0) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Bons à valider',
          body:
            fresh.length === 1
              ? '1 nouveau bon à valider'
              : `${fresh.length} nouveaux bons à valider`,
          sound: 'default',
        },
        trigger: null,
      });
    }

    await SecureStore.setItemAsync(KEY_SEEN, JSON.stringify(ids));
    return fresh.length > 0
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundNotifs() {
  try {
    const already = await TaskManager.isTaskRegisteredAsync(TASK);
    if (!already) {
      await BackgroundFetch.registerTaskAsync(TASK, {
        minimumInterval: 15 * 60,
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }
  } catch {
    // En Expo Go la tâche n'est pas supportée — on ignore silencieusement.
  }
}

export async function unregisterBackgroundNotifs() {
  try {
    const already = await TaskManager.isTaskRegisteredAsync(TASK);
    if (already) await BackgroundFetch.unregisterTaskAsync(TASK);
  } catch {
    /* ignore */
  }
}
