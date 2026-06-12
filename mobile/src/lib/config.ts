import Constants from 'expo-constants';

/**
 * URL de base de l'API NestJS (port 8080, préfixe api/v1).
 * Surchargeable via app.json → expo.extra.apiUrl, ou la variable d'env EXPO_PUBLIC_API_URL.
 * ⚠️ Sur un vrai téléphone, utiliser l'IP LAN du serveur (pas localhost).
 */
const fromExtra = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? fromExtra ?? 'http://10.10.32.2:8080/api/v1';
