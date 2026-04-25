'use client';

import { useEffect } from 'react';
import { useTheme } from './use-theme';

export function D1ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme, tokens } = useTheme();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('d1-light', 'd1-dark');
    root.classList.add(`d1-${theme}`);
    root.dataset.theme = theme;

    root.style.setProperty('--d1-bg',           tokens.bg);
    root.style.setProperty('--d1-surface',      tokens.surface);
    root.style.setProperty('--d1-surface-alt',  tokens.surface2);
    root.style.setProperty('--d1-surface2',     tokens.surface2);
    root.style.setProperty('--d1-text',         tokens.text);
    root.style.setProperty('--d1-text-dim',     tokens.textDim);
    root.style.setProperty('--d1-text-faint',   tokens.textFaint);
    root.style.setProperty('--d1-accent',       tokens.accent);
    root.style.setProperty('--d1-accent-soft',  tokens.accentSoft);
    root.style.setProperty('--d1-accent-mid',   tokens.accentMid);
    root.style.setProperty('--d1-border',       tokens.border);
    root.style.setProperty('--d1-border-strong',tokens.borderStrong);
    root.style.setProperty('--d1-border-mid',   tokens.borderStrong);
    root.style.setProperty('--d1-danger',       tokens.danger);
    root.style.setProperty('--d1-danger-soft',  tokens.dangerSoft);
    root.style.setProperty('--d1-shadow-card',  tokens.shadowCard);
    root.style.setProperty('--d1-shadow-dropdown', tokens.shadowDropdown);
    root.style.setProperty('--d1-shadow-modal', tokens.shadowModal);
    root.style.setProperty('--d1-overlay-modal',tokens.overlayModal);
    // Compatibility — old success/blue alias still referenced by some components
    root.style.setProperty('--d1-success',      theme === 'dark' ? '#2dd4a8' : '#10a37f');
  }, [theme, tokens]);

  return <>{children}</>;
}
