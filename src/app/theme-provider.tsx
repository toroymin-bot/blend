'use client';

// ThemeProvider — D1 테마 시스템 통합 (Tori 명세 2026-04-25)
// SplashScreen 제거 (Komi_Splash_Removal_2026-04-25.md):
// - 보라 #7c3aed는 디자인 토큰 외 / 옛 카피 박제 / 정적 빌드라 불필요 / 재방문 누적 비용
import { D1ThemeProvider } from '@/design/theme-provider';
import { CostAlertToast } from '@/modules/ui/cost-alert-toast';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <D1ThemeProvider>
      {children}
      <CostAlertToast />
    </D1ThemeProvider>
  );
}
