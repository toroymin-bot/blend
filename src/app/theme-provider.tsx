'use client';

// ThemeProvider: reads settings-store theme and applies data-theme to <html>
import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import { CostAlertToast } from '@/modules/ui/cost-alert-toast';
// [2026-04-10 15:00] 스플래시 스크린 추가
import { SplashScreen } from '@/modules/ui/splash-screen';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { settings, loadFromStorage } = useSettingsStore();

  // Load persisted settings on mount
  useEffect(() => {
    loadFromStorage();
  }, []);

  // Apply data-theme attribute whenever theme changes
  useEffect(() => {
    const html = document.documentElement;
    const theme = settings.theme;

    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      html.setAttribute('data-theme', prefersDark ? 'dark' : 'light');

      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => {
        html.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      };
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    } else {
      html.setAttribute('data-theme', theme);
    }
  }, [settings.theme]);

  return (
    <>
      {/* [2026-04-10 15:00] 접속 시 1초 스플래시 */}
      <SplashScreen />
      {children}
      <CostAlertToast />
    </>
  );
}
