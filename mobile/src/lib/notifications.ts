import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

let configured = false;

/** Configure l'affichage des notifications (au premier plan : alerte + son). */
export async function configureNotifications() {
  if (configured) return;
  configured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Notifications',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    });
  }
}

/** Demande la permission de notifier (système). */
export async function ensureNotificationPermissions(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/** Affiche immédiatement une notification « bons à valider ». */
export async function presentBonsAValiderNotification(count: number) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Bons à valider',
      body: count === 1 ? '1 nouveau bon à valider' : `${count} nouveaux bons à valider`,
      sound: 'default',
    },
    trigger: null,
  });
}
