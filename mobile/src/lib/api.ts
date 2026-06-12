import axios from 'axios';
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

// Déconnexion automatique si le token est rejeté.
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401) {
      void useAuthStore.getState().signOut();
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
