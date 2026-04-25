'use client';

// ThemeProvider — D1 테마 시스템 통합 (Tori 명세 2026-04-25)
// useThemeStore가 'light' | 'dark' | 'system' 결정 → data-theme + CSS 변수 주입
import { useEffect } from 'react';
import { D1ThemeProvider } from '@/design/theme-provider';
import { CostAlertToast } from '@/modules/ui/cost-alert-toast';
import { SplashScreen } from '@/modules/ui/splash-screen';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <D1ThemeProvider>
      <SplashScreen />
      {children}
      <CostAlertToast />
    </D1ThemeProvider>
  );
}
