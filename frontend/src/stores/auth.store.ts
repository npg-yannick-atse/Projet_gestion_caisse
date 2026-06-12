import { create } from 'zustand';
import type { User } from '@/types/api';
import { clearTokens, setTokens } from '@/lib/token';

interface AuthState {
  user: User | null;
  setSession: (user: User, accessToken: string, refreshToken: string) => void;
  setUser: (user: User | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setSession: (user, accessToken, refreshToken) => {
    setTokens(accessToken, refreshToken);
    set({ user });
  },
  setUser: (user) => set({ user }),
  logout: () => {
    clearTokens();
    set({ user: null });
  },
}));
