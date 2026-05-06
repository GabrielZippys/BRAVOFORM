'use client';

/**
 * useTheme — hook de gerenciamento de tema (light/dark/auto).
 *
 * Comportamento:
 *   - Lê preferência do localStorage (chave: bravoform-theme)
 *   - Default: 'auto' (segue prefers-color-scheme)
 *   - Aplica `data-theme` no <html> para o tokens.css resolver as variáveis
 *   - Persiste mudanças automaticamente
 *   - Sincroniza entre abas via storage event
 */

import { useEffect, useState, useCallback } from 'react';

export type Theme = 'light' | 'dark' | 'auto';

const STORAGE_KEY = 'bravoform-theme';
const DEFAULT_THEME: Theme = 'auto';

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'auto') return v;
  } catch {
    /* noop */
  }
  return DEFAULT_THEME;
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);

  // Inicialização — lê do storage uma vez
  useEffect(() => {
    const stored = readStoredTheme();
    setThemeState(stored);
    applyTheme(stored);
  }, []);

  // Sincronização entre abas
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        const t = e.newValue as Theme;
        if (t === 'light' || t === 'dark' || t === 'auto') {
          setThemeState(t);
          applyTheme(t);
        }
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* noop */
    }
  }, []);

  /** Cicla light → dark → auto → light */
  const cycleTheme = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'auto' : 'light');
  }, [theme, setTheme]);

  return { theme, setTheme, cycleTheme };
}
