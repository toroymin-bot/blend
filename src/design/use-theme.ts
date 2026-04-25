'use client';

import { useEffect, useState } from 'react';
import { useThemeStore } from './theme-store';
import { D1_TOKENS, type Theme } from './d1-tokens';
import { D1_PROVIDER_COLORS } from './d1-providers';

export function useTheme() {
  const mode = useThemeStore((s) => s.mode);
  const [systemPrefersDark, setSystemPrefersDark] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemPrefersDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const theme: Theme =
    mode === 'system' ? (systemPrefersDark ? 'dark' : 'light') : mode;

  return {
    theme,
    tokens: D1_TOKENS[theme],
    providerColors: D1_PROVIDER_COLORS[theme],
    mode,
  };
}
