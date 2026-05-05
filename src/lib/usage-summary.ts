/**
 * [2026-05-05 PM-46 Phase 3 Roy] Cloudflare counter usage-summary 통합 fetcher.
 *
 * Dashboard + Billing 양쪽이 동일 함수 사용 → 자동으로 데이터 일관성 보장.
 *
 * 결정 (2026-05-05 Roy): "WAE로 새로 시작. KV는 사용하지 말자."
 * 런칭 직전 = 사실상 모든 사용자가 신규 → KV의 historical 데이터(=Roy 본인 테스트)는
 * 사용자에 의미 없음. WAE는 race 없는 정확한 값을 첫 메시지부터 누적 → 신규 사용자에게
 * 100% 정확한 통계 제공.
 *
 * 동작:
 *   - /usage-summary-v2 (WAE) **단독** 호출. KV fallback 없음.
 *   - 실패 시 null 반환 (UI는 빈 상태 표시 → 첫 메시지부터 정상 누적되면 자연 회복).
 *
 * KV는 워커 백엔드에서 dual-write 계속됨 (Telegram 일일 리포트가 KV /usage-summary
 * 사용 중). 향후 Telegram도 v2로 옮기면 KV write 제거 가능.
 */
export interface UsageSummary {
  generatedAt: string;
  source?: 'analytics_engine' | 'kv';
  yesterday: { totalCost: number; totalRequests: number; providers?: Record<string, { cost: number; requests: number; tokens?: number }> };
  week:      { totalCost: number; totalRequests: number; providers:  Record<string, { cost: number; requests: number; tokens?: number }> };
  month:     { totalCost: number; totalRequests: number; providers?: Record<string, { cost: number; requests: number; tokens?: number }> };
  all:       { totalCost: number; totalRequests: number; providers:  Record<string, { cost: number; requests: number; tokens?: number }> };
}

/** 실제 fetch — counter URL 기반. WAE 단독, fallback 없음. */
export async function fetchUsageSummary(): Promise<UsageSummary | null> {
  const counterUrl = process.env.NEXT_PUBLIC_BLEND_COUNTER_URL;
  if (!counterUrl) return null;

  try {
    const r = await fetch(`${counterUrl}/usage-summary-v2`);
    if (r.ok) {
      const data = await r.json() as UsageSummary & { error?: string };
      if (!data.error && typeof data.all?.totalRequests === 'number') {
        return { ...data, source: 'analytics_engine' };
      }
    }
  } catch { /* WAE 실패 시 null 반환 — UI는 빈 상태 표시 */ }

  return null;
}
