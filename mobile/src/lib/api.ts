import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { API_URL } from './config';
import { useAuthStore } from '../store/auth';

export const api = axios.create({ baseURL: API_URL, timeout: 15000 });

// Injecte le bearer token sur chaque requête (lu depuis le store auth).
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Un seul refresh en vol à la fois : les requêtes concurrentes le partagent.
let refreshing: Promise<string> | null = null;

async function runRefresh(): Promise<string> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) throw new Error('No refresh token');
  // Appel « brut » (sans l'instance `api`) pour ne pas repasser par cet intercepteur.
  const { data } = await axios.post<{ accessToken: string; refreshToken: string }>(
    `${API_URL}/auth/refresh`,
    { refreshToken },
  );
  await useAuthStore.getState().setTokens(data.accessToken, data.refreshToken);
  return data.accessToken;
}

function sharedRefresh(): Promise<string> {
  refreshing =
    refreshing ??
    runRefresh().finally(() => {
      refreshing = null;
    });
  return refreshing;
}

// Sur 401 : on tente UN refresh puis on rejoue la requête. `signOut` seulement si
// le refresh échoue (token révoqué / expiré) — plus de déconnexion à chaque cycle.
api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const isAuthRoute = original?.url?.includes('/auth/');

    if (error.response?.status === 401 && original && !original._retry && !isAuthRoute) {
      original._retry = true;
      try {
        const newToken = await sharedRefresh();
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch (e) {
        await useAuthStore.getState().signOut();
        return Promise.reject(e);
      }
    }
    return Promise.reject(error);
  },
);

/** Message d'erreur lisible depuis une erreur axios. */
export function apiErrorMessage(error: unknown, fallback = 'Une erreur est survenue'): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string | string[] } | undefined;
    const msg = data?.message;
    if (Array.isArray(msg)) return msg.join(', ');
    if (typeof msg === 'string') return msg;
  }
  return fallback;
}
