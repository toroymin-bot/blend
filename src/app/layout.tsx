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
const SITE_TITLE = "Blend — One AI app, cheaper and smarter";
const SITE_DESC_EN = "Use ChatGPT, Claude, Gemini, DeepSeek, Groq from one app. BYOK — pay only for what you use. Average $5/month.";
const SITE_DESC_KO = "ChatGPT, Claude, Gemini, DeepSeek, Groq를 하나의 앱에서. 내 API 키로 쓴 만큼만. 평균 월 $5.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESC_EN,
  manifest: "/manifest.json",
  alternates: {
    canonical: SITE_URL,
    languages: {
      "ko-KR": `${SITE_URL}/ko`,
      "en-US": `${SITE_URL}/en`,
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
    statusBarStyle: "black-translucent",
    title: "Blend",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "theme-color": "#0f1117",
    // KO description for SEO crawlers that read meta name="description:ko"
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
      data-theme="dark"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/* [2026-04-17] Paddle Billing v2 — loaded globally for overlay checkout */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="https://cdn.paddle.com/paddle/v2/paddle.js" async></script>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
