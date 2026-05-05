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
interface PeriodSummary {
  totalCost: number;
  totalRequests: number;
  totalTokens?: number;
  providers: Record<string, { cost: number; requests: number; tokens?: number }>;
  models?: Record<string, { cost: number; requests: number; tokens?: number }>;
}

export interface UsageSummary {
  generatedAt: string;
  source?: 'analytics_engine' | 'kv';
  today?:    PeriodSummary;   // [Phase 7] WAE v2 추가 — 라벨 "최근 24시간"용 (rolling)
  yesterday: PeriodSummary;
  week:      PeriodSummary;
  month:     PeriodSummary;
  all:       PeriodSummary;
}

export interface UsageGridCell {
  date: string;   // YYYY-MM-DD (KST)
  hour: string;   // HH (00-23, KST)
  requests: number;
}

export interface UsageDaily {
  date: string;   // YYYY-MM-DD
  requests: number;
  cost: number;   // USD
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

/**
 * Dashboard 히트맵용 — period 내 일×시간 분포. records 의존 제거 (이전엔
 * localStorage 기반이라 이 디바이스 한정 + 누락 다수). WAE에서 모든 디바이스 합산.
 * @param fromDate YYYY-MM-DD KST
 * @param toDate YYYY-MM-DD KST
 */
export async function fetchUsageGrid(fromDate: string, toDate: string): Promise<UsageGridCell[]> {
  const counterUrl = process.env.NEXT_PUBLIC_BLEND_COUNTER_URL;
  if (!counterUrl) return [];
  try {
    const r = await fetch(`${counterUrl}/usage-grid?from=${fromDate}&to=${toDate}`);
    if (!r.ok) return [];
    const data = await r.json() as { grid?: UsageGridCell[]; error?: string };
    if (data.error || !Array.isArray(data.grid)) return [];
    return data.grid;
  } catch {
    return [];
  }
}

/**
 * Billing 일별 차트용 — 최근 N일 cost/requests. records.getCostByDay() 대체.
 * 모든 디바이스 합산.
 */
export async function fetchUsageDaily(days: number = 30): Promise<UsageDaily[]> {
  const counterUrl = process.env.NEXT_PUBLIC_BLEND_COUNTER_URL;
  if (!counterUrl) return [];
  try {
    const r = await fetch(`${counterUrl}/usage-daily?days=${days}`);
    if (!r.ok) return [];
    const data = await r.json() as { daily?: UsageDaily[]; error?: string };
    if (data.error || !Array.isArray(data.daily)) return [];
    return data.daily;
  } catch {
    return [];
  }
}
