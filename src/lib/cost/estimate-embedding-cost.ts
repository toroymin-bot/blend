// [2026-04-26 Tori 16384118 §3.6] 임베딩 비용 추정
// OpenAI text-embedding-3-small 기준. 변경 시 RATE_PER_1M_TOKENS 갱신.

const RATE_PER_1M_TOKENS = 0.02;          // OpenAI text-embedding-3-small
const TOKENS_PER_KB = 256;                // 평균 한·영 텍스트
const AVG_DAILY_CHANGE_RATIO = 0.05;      // 5% — 폴더 평균 변경률

export interface CostEstimate {
  initialUsd: number;       // 첫 인덱싱 비용
  monthlyUsd: number;       // 월 자동 동기화 (변경 5% 가정)
  initialKrw: number;
  monthlyKrw: number;
}

export function estimateInitialCost(totalSizeBytes: number): number {
  const sizeKB = totalSizeBytes / 1024;
  const tokens = sizeKB * TOKENS_PER_KB;
  return (tokens / 1_000_000) * RATE_PER_1M_TOKENS;
}

export function estimateMonthlyCost(totalSizeBytes: number): number {
  const initial = estimateInitialCost(totalSizeBytes);
  const dailyChange = initial * AVG_DAILY_CHANGE_RATIO;
  return dailyChange * 30;
}

// [2026-05-05 PM-30 Roy] KRW 환율 src/lib/currency.ts (xe.com 매월 1일 기준).
import { getCurrentFxRates } from '@/lib/currency';

export function estimateCost(totalSizeBytes: number): CostEstimate {
  const initialUsd = estimateInitialCost(totalSizeBytes);
  const monthlyUsd = estimateMonthlyCost(totalSizeBytes);
  const krwPerUsd = getCurrentFxRates().krwPerUsd;
  return {
    initialUsd,
    monthlyUsd,
    initialKrw: Math.ceil(initialUsd * krwPerUsd),
    monthlyKrw: Math.ceil(monthlyUsd * krwPerUsd),
  };
}

export function formatUsd(usd: number): string {
  if (usd === 0) return '$0';
  if (usd < 0.01) return '<$0.01';
  if (usd < 1) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatKrw(usd: number): string {
  const krw = Math.round(usd * getCurrentFxRates().krwPerUsd);
  if (krw === 0) return '₩0';
  if (krw < 100) return `<₩100`;
  return `₩${krw.toLocaleString('ko-KR')}`;
}

// 위험 임계값 — 월 $5 초과 시 경고
export const MONTHLY_WARN_USD = 5;

export function isCostRisky(monthlyUsd: number): boolean {
  return monthlyUsd > MONTHLY_WARN_USD;
}
