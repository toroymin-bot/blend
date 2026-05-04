import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "./theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://blend.ai4min.com";
const SITE_TITLE = "Blend — One AI app, more affordable and smarter";
const SITE_DESC_EN = "Use ChatGPT, Claude, Gemini, DeepSeek, Groq from one app. BYOK — pay only for what you use. Average $5/month.";
const SITE_DESC_KO = "ChatGPT, Claude, Gemini, DeepSeek, Groq를 하나의 앱에서. 내 API 키로 쓴 만큼만. 평균 월 $5.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESC_EN,
  manifest: "/manifest.json",
  // [2026-04-26 Tori 16220538 §2.7] design1 트랙으로 canonical 통일
  alternates: {
    canonical: `${SITE_URL}/design1/ko`,
    languages: {
      "ko-KR": `${SITE_URL}/design1/ko`,
      "en-US": `${SITE_URL}/design1/en`,
    },
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Blend",
    title: SITE_TITLE,
    description: SITE_DESC_EN,
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Blend — One AI app" }],
    locale: "en_US",
    alternateLocale: ["ko_KR"],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESC_EN,
    images: ["/og-image.png"],
  },
  appleWebApp: {
    capable: true,
    // [2026-05-01 Roy] 라이트 모드 only — iOS status bar 라이트 톤. 'default'는
    // 시스템 라이트 (검은 글씨, 흰 배경) — 라이트 테마와 일치.
    statusBarStyle: "default",
    title: "Blend",
  },
  // [2026-05-01 Roy] 라이트 모드 only — iOS status bar / 브라우저 toolbar 색상도
  // 라이트로. 이전엔 dark(#0f1117)였는데 layout이 라이트로 렌더되며 'dark→light
  // flash' 유발했음. theme-color는 라이트 배경(#fafaf9)과 일치.
  other: {
    "mobile-web-app-capable": "yes",
    "theme-color": "#fafaf9",
    "description:ko": SITE_DESC_KO,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // [2026-05-01 Roy] 라이트 모드 only — SSR HTML에 light로 박아 dark→light
      // flash 제거. 이전 'dark'는 ThemeProvider useEffect가 늦게 light로 바꿔서
      // 첫 페인트 직후 잠깐 다크 보이는 문제 있었음.
      data-theme="light"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/* [2026-05-03 BUG-012] /(design[123]/)?(ko|en) 라우트면 document lang 즉시 보정.
            output:'export'로 SSR HTML은 lang="en" 정적 박혀 있지만 이 스크립트가
            첫 페인트 전에 동기 실행돼 스크린리더 + DOM lang API 모두 올바른 값을 본다. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=location.pathname.match(/^\\/(?:design[123]\\/)?(ko|en)(?:\\/|$)/);if(m)document.documentElement.lang=m[1];}catch(e){}})();`,
          }}
        />
        {/* [2026-04-17] Paddle Billing v2 — loaded globally for overlay checkout */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="https://cdn.paddle.com/paddle/v2/paddle.js" async></script>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
