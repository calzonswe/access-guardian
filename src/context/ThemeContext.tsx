import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

/** What the user chose. 'system' follows the device's light/dark setting. */
export type ThemePreference = 'light' | 'dark' | 'system';
/** What is actually shown. */
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'rbac-theme';

interface ThemeContextType {
  /** The user's choice (light, dark or system). */
  preference: ThemePreference;
  /** The theme currently applied. */
  theme: ResolvedTheme;
  setPreference: (p: ThemePreference) => void;
  /** Quick switch between light and dark (sets an explicit choice). */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

function systemTheme(): ResolvedTheme {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
  const [system, setSystem] = useState<ResolvedTheme>(systemTheme);

  // Follow the device setting live while the preference is 'system'.
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const onChange = () => setSystem(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const theme: ResolvedTheme = preference === 'system' ? system : preference;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    try { localStorage.setItem(STORAGE_KEY, p); } catch { /* private mode: keep in memory */ }
  }, []);

  const toggleTheme = useCallback(() => {
    setPreference(theme === 'light' ? 'dark' : 'light');
  }, [theme, setPreference]);

  return (
    <ThemeContext.Provider value={{ preference, theme, setPreference, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be inside ThemeProvider');
  return ctx;
};
