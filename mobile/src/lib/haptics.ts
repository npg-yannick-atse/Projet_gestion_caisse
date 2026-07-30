/**
 * Retour tactile (haptics) OPTIONNEL : n'échoue jamais si `expo-haptics` n'est
 * pas installé (import paresseux protégé). Installer pour l'activer :
 *   npx expo install expo-haptics
 */
let H: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  H = require('expo-haptics');
} catch {
  H = null;
}

/** Petit « tap » de confirmation (bouton, sélection). */
export function tapLight() {
  try {
    H?.impactAsync?.(H.ImpactFeedbackStyle?.Light);
  } catch {
    /* no-op */
  }
}

/** Vibration de succès (bon créé, validé, décaissé). */
export function notifySuccess() {
  try {
    H?.notificationAsync?.(H.NotificationFeedbackType?.Success);
  } catch {
    /* no-op */
  }
}

/** Vibration d'erreur. */
export function notifyError() {
  try {
    H?.notificationAsync?.(H.NotificationFeedbackType?.Error);
  } catch {
    /* no-op */
  }
}
