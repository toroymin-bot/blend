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

export const metadata: Metadata = {
  title: "Blend - AI Chat Interface",
  description: "All AI subscriptions — in one, cheaper, smarter",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Blend",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "theme-color": "#0f1117",
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
