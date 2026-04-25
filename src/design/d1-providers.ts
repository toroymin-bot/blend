// Blend D1 Provider colors — light only (Roy 결정 2026-04-25)
// 테마 시스템 폐기 (Komi_Theme_Removal_2026-04-25.md): dark 분기 제거.

import type { Theme } from './d1-tokens';

const LIGHT = {
  anthropic: '#c65a3c',  // coral (블렌드 accent와 동일)
  openai:    '#10a37f',  // green
  google:    '#4285f4',  // blue
  deepseek:  '#5865f2',  // purple
  groq:      '#ff6b35',  // orange
  auto:      '#a8a49b',  // textFaint (중성)
} as const;

// 호환 — 기존 D1_PROVIDER_COLORS[theme] 접근 패턴 유지
export const D1_PROVIDER_COLORS: Record<Theme, Record<string, string>> = {
  light: LIGHT,
};

export function getProviderColor(provider: string, _theme: Theme = 'light'): string {
  return LIGHT[provider as keyof typeof LIGHT] ?? LIGHT.auto;
}
