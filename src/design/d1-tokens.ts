/**
 * Blend D1 Design Tokens — Light only (Roy 결정 2026-04-25)
 *
 * 테마 시스템 폐기 (Komi_Theme_Removal_2026-04-25.md):
 * - 다크 모드 토큰 제거 — 단일 비주얼 정체성
 * - CSS 변수 패턴은 유지 (향후 재도입 대비)
 *
 * 이 파일은 이전 D1_TOKENS.light + .dark 구조에서 단일 객체로 평탄화됨.
 * 외부에서 `D1_TOKENS.light`로 접근하던 코드 호환을 위해 light alias 유지.
 */

export type Theme = 'light';

const LIGHT = {
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
} as const;

// 호환 — 기존 D1_TOKENS[theme] 패턴 유지
export const D1_TOKENS = {
  light: LIGHT,
} as const;
