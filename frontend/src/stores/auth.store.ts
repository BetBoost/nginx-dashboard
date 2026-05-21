import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Role = 'ADMIN' | 'USER';

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  role: Role;
}

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  setAccessToken: (token: string | null) => void;
  setUser: (user: AuthUser | null) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      setAccessToken: (token) => set({ accessToken: token }),
      setUser: (user) => set({ user }),
      clear: () => set({ accessToken: null, user: null }),
    }),
    {
      name: 'nginx-dashboard-auth',
      partialize: (s) => ({ user: s.user }),
    },
  ),
);
