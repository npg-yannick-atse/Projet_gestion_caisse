import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { User } from '../types';

const KEY_ACCESS = 'fdc.accessToken';
const KEY_REFRESH = 'fdc.refreshToken';
const KEY_USER = 'fdc.user';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** Faux tant que le token n'a pas été relu depuis le stockage sécurisé (évite un flash de login). */
  isReady: boolean;
  bootstrap: () => Promise<void>;
  setSession: (user: User, accessToken: string, refreshToken: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isReady: false,

  bootstrap: async () => {
    try {
      const [accessToken, refreshToken, rawUser] = await Promise.all([
        SecureStore.getItemAsync(KEY_ACCESS),
        SecureStore.getItemAsync(KEY_REFRESH),
        SecureStore.getItemAsync(KEY_USER),
      ]);
      set({
        accessToken: accessToken ?? null,
        refreshToken: refreshToken ?? null,
        user: rawUser ? (JSON.parse(rawUser) as User) : null,
        isReady: true,
      });
    } catch {
      set({ isReady: true });
    }
  },

  setSession: async (user, accessToken, refreshToken) => {
    await Promise.all([
      SecureStore.setItemAsync(KEY_ACCESS, accessToken),
      SecureStore.setItemAsync(KEY_REFRESH, refreshToken),
      SecureStore.setItemAsync(KEY_USER, JSON.stringify(user)),
    ]);
    set({ user, accessToken, refreshToken });
  },

  signOut: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(KEY_ACCESS),
      SecureStore.deleteItemAsync(KEY_REFRESH),
      SecureStore.deleteItemAsync(KEY_USER),
    ]);
    set({ user: null, accessToken: null, refreshToken: null });
  },
}));
