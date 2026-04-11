import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // [2026-04-12 01:07] 기능: 정적 빌드 전환 — 이유: Next.js 서버 제거로 $0 서버 비용 달성
  output: 'export',
  // images.unoptimized: static export에서 next/image 최적화 미지원
  images: { unoptimized: true },
};

export default nextConfig;
