// Les jetons sont stockés en sessionStorage (et non localStorage) : ils sont
// effacés à la fermeture de l'onglet/navigateur. Ainsi l'utilisateur qui quitte
// l'application puis y revient est déconnecté et doit se reconnecter.
const ACCESS_KEY = 'fdc_access_token';
const REFRESH_KEY = 'fdc_refresh_token';
// Horodatage de la dernière activité UTILISATEUR (souris/clavier), pour la
// déconnexion par inactivité. Volontairement décorrélé du rafraîchissement du
// token (qui, lui, se produit tout seul via le polling et ne doit pas « réveiller »
// la session).
const ACTIVITY_KEY = 'fdc_last_activity';

export function getAccessToken(): string | null {
  return sessionStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return sessionStorage.getItem(REFRESH_KEY);
}

export function setTokens(accessToken: string, refreshToken: string): void {
  sessionStorage.setItem(ACCESS_KEY, accessToken);
  sessionStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearTokens(): void {
  sessionStorage.removeItem(ACCESS_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
  sessionStorage.removeItem(ACTIVITY_KEY);
}

/** Enregistre l'instant de la dernière activité utilisateur. */
export function touchActivity(): void {
  sessionStorage.setItem(ACTIVITY_KEY, String(Date.now()));
}

/** Dernière activité utilisateur (ms epoch), ou null si inconnue. */
export function getLastActivity(): number | null {
  const v = sessionStorage.getItem(ACTIVITY_KEY);
  return v ? Number(v) : null;
}
