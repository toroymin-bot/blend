// Blend D1 Provider colors — light/dark separate (Tori 명세)
// Dark에선 어두운 배경에서 가독성 확보를 위해 명도 약간 올림.

import type { Theme } from './d1-tokens';

export const D1_PROVIDER_COLORS: Record<Theme, Record<string, string>> = {
  light: {
    anthropic: '#c65a3c',  // coral (블렌드 accent와 동일)
    openai:    '#10a37f',  // green
    google:    '#4285f4',  // blue
    deepseek:  '#5865f2',  // purple
    groq:      '#ff6b35',  // orange
    auto:      '#a8a49b',  // textFaint (중성)
  },
  dark: {
    anthropic: '#e87a5c',
    openai:    '#2dd4a8',
    google:    '#6ba2ff',
    deepseek:  '#7c8aff',
    groq:      '#ff8a5c',
    auto:      '#6b6862',
  },
} as const;

export function getProviderColor(provider: string, theme: Theme = 'light'): string {
  return D1_PROVIDER_COLORS[theme][provider] ?? D1_PROVIDER_COLORS[theme].auto;
}
