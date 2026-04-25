'use client';

// Roy 결정 (2026-04-25): 테마 시스템 폐기, 라이트 모드 only.
// 이 훅은 외부 호출 호환을 위해 보존되며 항상 light 반환.

import { useThemeStore } from './theme-store';
import { D1_TOKENS, type Theme } from './d1-tokens';
import { D1_PROVIDER_COLORS } from './d1-providers';

export function useTheme() {
  const mode = useThemeStore((s) => s.mode);
  const theme: Theme = 'light';

  return {
    theme,
    tokens: D1_TOKENS.light,
    providerColors: D1_PROVIDER_COLORS.light,
    mode,  // 'light' 고정 — 외부 호환
  };
}
