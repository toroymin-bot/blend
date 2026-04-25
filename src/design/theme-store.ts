'use client';

// Blend D1 Theme store — Roy 결정 2026-04-25: 테마 시스템 폐기, light only.
// 외부 호출 호환을 위해 store API는 유지하되, mode는 항상 'light'.

import { create } from 'zustand';

export type ThemeMode = 'light';

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;  // no-op (라이트 only)
}

export const useThemeStore = create<ThemeState>(() => ({
  mode: 'light',
  setMode: () => { /* no-op — 테마 폐기 */ },
}));
