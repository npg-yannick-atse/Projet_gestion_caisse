import { Platform } from 'react-native';
import { api } from '../lib/api';

/** Enregistre le jeton push de l'appareil côté backend (pour les push). */
export async function registerPushToken(token: string): Promise<void> {
  await api.post('/push-tokens', { token, platform: Platform.OS });
}
