import { create } from 'zustand';

type Theme = 'light' | 'dark';

const readInitial = (): Theme => {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
};

const apply = (theme: Theme): void => {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try {
    localStorage.setItem('theme', theme);
  } catch { /* ignore */ }
};

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  set: (t: Theme) => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: readInitial(),
  toggle: () => {
    const t: Theme = get().theme === 'dark' ? 'light' : 'dark';
    apply(t);
    set({ theme: t });
  },
  set: (t) => {
    apply(t);
    set({ theme: t });
  },
}));
