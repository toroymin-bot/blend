/**
 * Blend D1 Design Tokens — Light + Dark
 *
 * Tori (Web Claude) 명세: Komi_Theme_System_2026-04-25.md
 * - Light: 운영 중 토큰 그대로 (변형 X)
 * - Dark : Claude.ai의 "어두운 따뜻한 톤" 차용 + 블렌드 정합
 *   · 순검정 X — 따뜻한 검정 #1a1816
 *   · 순백 X   — 따뜻한 흰색 #f5f4f2
 *   · accent  — 다크에서 명도 올림 (#e87a5c)
 *   · 그림자 X — 보더로 계층 (다크에선 shadowCard='none')
 */

export type Theme = 'light' | 'dark';

export const D1_TOKENS = {
  light: {
    bg: '#fafaf9',
    surface: '#ffffff',
    surface2: '#f5f4f2',
    text: '#0a0a0a',
    textDim: '#6b6862',
    textFaint: '#a8a49b',
    accent: '#c65a3c',
    accentSoft: 'rgba(198, 90, 60, 0.08)',
    accentMid:  'rgba(198, 90, 60, 0.15)',
    border:       'rgba(10, 10, 10, 0.06)',
    borderStrong: 'rgba(10, 10, 10, 0.12)',
    danger:     '#dc2626',
    dangerSoft: 'rgba(220, 38, 38, 0.08)',
    shadowCard:    '0 1px 3px rgba(0, 0, 0, 0.04)',
    shadowDropdown:'0 4px 16px rgba(0, 0, 0, 0.08)',
    shadowModal:   '0 24px 80px rgba(0, 0, 0, 0.24)',
    overlayModal:  'rgba(10, 10, 10, 0.32)',
  },
  dark: {
    bg: '#1a1816',
    surface: '#252321',
    surface2: '#2f2c29',
    text: '#f5f4f2',
    textDim: '#a8a49b',
    textFaint: '#6b6862',
    accent: '#e87a5c',
    accentSoft: 'rgba(232, 122, 92, 0.12)',
    accentMid:  'rgba(232, 122, 92, 0.20)',
    border:       'rgba(255, 255, 255, 0.08)',
    borderStrong: 'rgba(255, 255, 255, 0.14)',
    danger:     '#ef4444',
    dangerSoft: 'rgba(239, 68, 68, 0.12)',
    shadowCard:    'none',
    shadowDropdown:'0 8px 24px rgba(0, 0, 0, 0.4)',
    shadowModal:   '0 24px 80px rgba(0, 0, 0, 0.6)',
    overlayModal:  'rgba(0, 0, 0, 0.6)',
  },
} as const;
