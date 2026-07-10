import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from './token';
import type { TokensResponse } from '@/types/api';

const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

export const api = axios.create({ baseURL });

// Un seul refresh en vol à la fois : toutes les requêtes concurrentes le partagent.
let refreshing: Promise<string> | null = null;

async function runRefresh(): Promise<string> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new Error('No refresh token');
  const { data } = await axios.post<TokensResponse>(`${baseURL}/auth/refresh`, { refreshToken });
  setTokens(data.accessToken, data.refreshToken);
  return data.accessToken;
}

/** Lance (ou réutilise) le refresh partagé et remet le verrou à zéro à la fin. */
function sharedRefresh(): Promise<string> {
  refreshing =
    refreshing ??
    runRefresh().finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** true si l'access token JWT expire dans moins de `skewMs` (ou est illisible/absent). */
function isExpiringSoon(token: string, skewMs = 30_000): boolean {
  try {
    const part = token.split('.')[1];
    if (!part) return false;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64)) as { exp?: number };
    if (!payload.exp) return false;
    return payload.exp * 1000 - Date.now() < skewMs;
  } catch {
    return false;
  }
}

// --- Refresh PROACTIF : avant chaque requête, si le token est sur le point d'expirer,
//     on le rafraîchit d'abord → plus aucune requête ne part avec un token périmé
//     (élimine les rafales de 401 à chaque cycle d'expiration).
api.interceptors.request.use(async (config) => {
  const isAuthRoute = config.url?.includes('/auth/');
  let token = getAccessToken();

  if (token && !isAuthRoute && isExpiringSoon(token) && getRefreshToken()) {
    try {
      token = await sharedRefresh();
    } catch {
      // Échec du refresh : on laisse la requête partir ; le gestionnaire 401 (ci-dessous)
      // prendra le relais (et redirigera vers /login si nécessaire).
      token = getAccessToken();
    }
  }

  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// --- Filet de sécurité RÉACTIF : si une requête prend malgré tout un 401 (token révoqué,
//     horloge décalée…), on rafraîchit une fois et on rejoue la requête.
api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const isAuthRoute = original?.url?.includes('/auth/');

    if (error.response?.status === 401 && original && !original._retry && !isAuthRoute) {
      original._retry = true;
      try {
        const newToken = await sharedRefresh();
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch (e) {
        clearTokens();
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(e);
      }
    }
    return Promise.reject(error);
  },
);
