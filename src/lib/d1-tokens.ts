'use client';

/**
 * D1 design tokens — light / dark
 *
 * Light: Tori 기존 디자인 (#fafaf9 베이스, accent #c65a3c).
 * Dark : Claude.ai 다크 모드 벤치마킹 (따뜻한 검정 + 코랄 accent).
 *
 * useD1Tokens() — html[data-theme] 변화 감지 (ThemeProvider가 설정).
 */

import { useEffect, useState } from 'react';

export type D1Tokens = {
  bg:           string;
  surface:      string;
  surfaceAlt:   string;
  text:         string;
  textDim:      string;
  textFaint:    string;
  accent:       string;
  accentSoft:   string;
  border:       string;
  borderStrong: string;
  borderMid:    string;
  danger:       string;
  success:      string;
};

export const lightTokens: D1Tokens = {
  bg:           '#fafaf9',
  surface:      '#ffffff',
  surfaceAlt:   '#f6f5f3',
  text:         '#0a0a0a',
  textDim:      '#6b6862',
  textFaint:    '#a8a49b',
  accent:       '#c65a3c',
  accentSoft:   'rgba(198, 90, 60, 0.08)',
  border:       'rgba(10, 10, 10, 0.06)',
  borderStrong: 'rgba(10, 10, 10, 0.12)',
  borderMid:    'rgba(10, 10, 10, 0.10)',
  danger:       '#c44',
  success:      '#10a37f',
};

// Claude.ai dark mode benchmark (warm black + coral accent)
export const darkTokens: D1Tokens = {
  bg:           '#262624',  // 따뜻한 진한 검정 (Claude bg)
  surface:      '#30302e',  // 카드 표면
  surfaceAlt:   '#3a3a37',  // 약간 더 밝은 surface
  text:         '#faf9f7',  // 따뜻한 off-white
  textDim:      '#c2bfb6',  // 부드러운 회색
  textFaint:    '#8a8780',  // 더 흐린 회색
  accent:       '#d97757',  // 코랄 (Anthropic 시그니처, 다크에서 더 따뜻)
  accentSoft:   'rgba(217, 119, 87, 0.14)',
  border:       'rgba(250, 249, 247, 0.08)',
  borderStrong: 'rgba(250, 249, 247, 0.18)',
  borderMid:    'rgba(250, 249, 247, 0.12)',
  danger:       '#e57373',
  success:      '#10b981',
};

function detectTheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light';
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'dark') return 'dark';
  if (attr === 'light') return 'light';
  // Fallback: prefers-color-scheme
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

export function useD1Tokens(): D1Tokens {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    setTheme(detectTheme());
    const html = document.documentElement;
    const observer = new MutationObserver(() => setTheme(detectTheme()));
    observer.observe(html, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return theme === 'dark' ? darkTokens : lightTokens;
}
