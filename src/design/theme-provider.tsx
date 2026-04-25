'use client';

// Roy 결정 (2026-04-25): 테마 폐기, 라이트 모드 only.
// CSS 변수 패턴은 유지 (var(--d1-*)) — 향후 재도입 시 대비.

import { useEffect } from 'react';
import { D1_TOKENS } from './d1-tokens';

export function D1ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const tokens = D1_TOKENS.light;
    const root = document.documentElement;
    root.classList.remove('d1-dark');
    root.classList.add('d1-light');
    root.dataset.theme = 'light';
    // 시스템 다크 모드를 무시하고 라이트 강제
    root.style.colorScheme = 'light';

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
    root.style.setProperty('--d1-success',      '#10a37f');
  }, []);

  return <>{children}</>;
}
