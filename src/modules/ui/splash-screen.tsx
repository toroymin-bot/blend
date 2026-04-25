'use client';

// [2026-04-10 15:00] 스플래시 스크린 — 접속 시 1초간 표시 후 페이드아웃
import { useState, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';

export function SplashScreen() {
  const { t } = useTranslation();
  const [fading, setFading] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    // 1200ms 후 페이드 시작
    const fadeTimer = setTimeout(() => setFading(true), 1200);
    // 1500ms 후 DOM에서 제거
    const hideTimer = setTimeout(() => setHidden(true), 1500);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  if (hidden) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#0d0d10',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.3s ease',
        pointerEvents: fading ? 'none' : 'auto',
      }}
    >
      {/* B 아이콘 */}
      <div
        style={{
          width: 88,
          height: 88,
          borderRadius: 22,
          background: 'linear-gradient(145deg, #7c3aed 0%, #6d28d9 50%, #4f46e5 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 48px rgba(109, 40, 217, 0.45), 0 0 12px rgba(79, 70, 229, 0.3)',
        }}
      >
        <span
          style={{
            color: 'white',
            fontSize: 44,
            fontWeight: 800,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            lineHeight: 1,
            letterSpacing: '-1px',
          }}
        >
          B
        </span>
      </div>

      {/* 텍스트 */}
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h1
          style={{
            color: '#ffffff',
            fontSize: 28,
            fontWeight: 700,
            margin: 0,
            letterSpacing: '-0.5px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          }}
          suppressHydrationWarning
        >
          {t('app.tagline')}
        </h1>
      </div>
    </div>
  );
}
