// design1/layout.tsx — Design variant 1 전용 레이아웃
// 폰트: Pretendard Variable (KR) + Geist (EN, 루트에서 상속) + Instrument Serif (악센트)
// 액센트 컬러: #c65a3c (번트 시에나)
// 애니메이션: cubic-bezier(0.16, 1, 0.3, 1) — iOS easeOutExpo
// 이 레이아웃은 /design1/** 라우트 전체에 자동 적용됨

import { Instrument_Serif } from 'next/font/google';

const instrumentSerif = Instrument_Serif({
  variable: '--font-instrument-serif',
  weight: '400',
  style: ['normal', 'italic'],
  subsets: ['latin'],
  display: 'swap',
});

export default function Design1Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Pretendard Variable — KR 전용, CDN (Google Fonts 미등재 오픈소스) */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        rel="preconnect"
        href="https://cdn.jsdelivr.net"
        crossOrigin="anonymous"
      />
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
        crossOrigin="anonymous"
      />
      <div className={`${instrumentSerif.variable} design1-shell`}>
        {children}
      </div>
    </>
  );
}
