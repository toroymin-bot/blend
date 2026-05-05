/**
 * [2026-05-05 PM-46 Phase 3 Roy] Cloudflare counter usage-summary 통합 fetcher.
 *
 * Dashboard + Billing 양쪽이 동일 함수 사용 → 자동으로 데이터 일관성 보장.
 * 이전엔 두 컴포넌트가 각자 fetch(`/usage-summary`)해서 코드 중복 + 향후 endpoint
 * 변경 시 한쪽 누락 위험 있었음.
 *
 * Phase 3 동작:
 *   1) /usage-summary-v2 (WAE SQL 집계, race 없는 정확한 값) 우선 호출
 *   2) v2 실패/에러 응답 시 /usage-summary (KV) fallback — race lost로 약간 부정확하지만
 *      빈 화면보다 낫고 사용자 경험 보호
 *   3) 둘 다 실패 시 null
 *
 * 응답 shape는 두 endpoint가 동일하게 설계되어 있어 호출자는 차이를 몰라도 됨.
 */
export interface UsageSummary {
  generatedAt: string;
  source?: 'analytics_engine' | 'kv';
  yesterday: { totalCost: number; totalRequests: number; providers?: Record<string, { cost: number; requests: number; tokens?: number }> };
  week:      { totalCost: number; totalRequests: number; providers:  Record<string, { cost: number; requests: number; tokens?: number }> };
  month:     { totalCost: number; totalRequests: number; providers?: Record<string, { cost: number; requests: number; tokens?: number }> };
  all:       { totalCost: number; totalRequests: number; providers:  Record<string, { cost: number; requests: number; tokens?: number }> };
}

/** 실제 fetch — counter URL 기반. 두 endpoint 시도 후 첫 성공 반환. */
export async function fetchUsageSummary(): Promise<UsageSummary | null> {
  const counterUrl = process.env.NEXT_PUBLIC_BLEND_COUNTER_URL;
  if (!counterUrl) return null;

  // 1차: WAE 기반 (정확)
  try {
    const r = await fetch(`${counterUrl}/usage-summary-v2`);
    if (r.ok) {
      const data = await r.json() as UsageSummary & { error?: string };
      if (!data.error && typeof data.all?.totalRequests === 'number') {
        return { ...data, source: 'analytics_engine' };
      }
    }
  } catch { /* fallthrough to KV */ }

  // 2차: KV 기반 (race로 ±수건 drift 가능)
  try {
    const r = await fetch(`${counterUrl}/usage-summary`);
    if (r.ok) {
      const data = await r.json() as UsageSummary;
      return { ...data, source: 'kv' };
    }
  } catch { /* fallthrough to null */ }

  return null;
}
