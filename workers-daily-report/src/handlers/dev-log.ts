// [2026-05-05 PM-46 Phase 6 Roy] Daily Pulse — 사용 통계 + 인사이트 + 개발 일지 통합.
// KST 08:35 cron + GET /preview — 어제(KST) 데이터 기반 리포트.
//
// blend-counter service binding으로 다음 데이터 fetch (병렬):
//   /usage-detailed?date=yesterday   — 어제 1일 상세 (provider/model/hourly)
//   /usage-detailed?date=DBefore     — DoD 비교용
//   /usage-summary-v2                — 월간 누적 (월말 추정)
//   /usage-daily?days=7              — 7일 평균 (anomaly detection)
//   /usage-by-country?from=&to=      — 국가별 (어제 기준)
//   /usage-by-os?from=&to=           — OS별
//   /retention-cohorts?days=30       — 코호트 리텐션
// + KV: summary:date (KOMI 푸시 dev log)

import type { Env, SummaryPayload, UsageDetailed, MonthSummary } from '../types';
import { sendTelegramMessage } from '../lib/telegram';
import { formatDailyPulse } from '../lib/daily-pulse';
import { formatEmptyMessage } from '../lib/markdown-v2';
import type { CohortRetention } from '../lib/insights';

function getYesterdayKST(): string {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const kstYesterday = new Date(kstNow.getTime() - 24 * 60 * 60 * 1000);
  return kstYesterday.toISOString().slice(0, 10);
}
function addDaysKST(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function counterFetch<T>(env: Env, path: string): Promise<T | null> {
  if (!env.BLEND_COUNTER) return null;
  try {
    const r = await env.BLEND_COUNTER.fetch(`https://internal${path}`);
    if (!r.ok) return null;
    const data = await r.json() as T & { error?: string };
    if ((data as any).error) return null;
    return data;
  } catch {
    return null;
  }
}

export async function handleDevLogSummary(
  env: Env,
  opts?: { dryRun?: boolean; date?: string },
): Promise<Response> {
  const date = opts?.date ?? getYesterdayKST();
  const dayBefore = addDaysKST(date, -1);

  const [
    devLogJson,
    todayUsage,
    yesterdayUsage,
    monthV2,
    weeklyDaily,
    byCountry,
    byOs,
    retentionData,
  ] = await Promise.all([
    env.BLEND_STATS.get(`summary:${date}`),
    counterFetch<UsageDetailed>(env, `/usage-detailed?date=${date}`),
    counterFetch<UsageDetailed>(env, `/usage-detailed?date=${dayBefore}`),
    counterFetch<{ month: MonthSummary }>(env, `/usage-summary-v2`),
    counterFetch<{ daily: Array<{ date: string; requests: number; cost: number }> }>(env, `/usage-daily?days=7`),
    counterFetch<{ countries: Array<{ code: string; requests: number; cost: number }> }>(env, `/usage-by-country?from=${date}&to=${date}`),
    counterFetch<{ oses: Array<{ os: string; requests: number; cost: number }> }>(env, `/usage-by-os?from=${date}&to=${date}`),
    counterFetch<{ cohorts: CohortRetention[] }>(env, `/retention-cohorts?days=30`),
  ]);

  // 7일 평균 계산 (date 자신 제외)
  let weekAvgRequests: number | null = null;
  let weekAvgCost: number | null = null;
  if (weeklyDaily?.daily && weeklyDaily.daily.length > 0) {
    const past = weeklyDaily.daily.filter((d) => d.date !== date);
    if (past.length > 0) {
      weekAvgRequests = past.reduce((s, d) => s + d.requests, 0) / past.length;
      weekAvgCost = past.reduce((s, d) => s + d.cost, 0) / past.length;
    }
  }

  // 활동 없음 처리
  if (!todayUsage || todayUsage.totalRequests === 0) {
    // 개발 일지만이라도 있으면 기본 포맷
    if (devLogJson) {
      try {
        const parsed = JSON.parse(devLogJson) as SummaryPayload;
        // 개발 일지만 있는 경우엔 간단 포맷
        const message = formatDailyPulse({
          date,
          today: { date, totalRequests: 0, totalCost: 0, totalTokens: 0, providers: {}, models: {}, hourly: [] },
          yesterday: yesterdayUsage,
          weekAvgRequests, weekAvgCost,
          monthSoFar: monthV2?.month ?? null,
          countries: byCountry?.countries ?? [],
          oses: byOs?.oses ?? [],
          cohorts: retentionData?.cohorts ?? [],
          devLog: parsed,
        });
        if (opts?.dryRun) {
          return new Response(message, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
        }
        try {
          await sendTelegramMessage(env, message);
          try { await env.BLEND_STATS.put('dev_log_last_run', new Date().toISOString()); } catch {}
          return new Response('sent', { status: 200 });
        } catch (e) {
          return new Response(`telegram failed: ${(e as Error).message}`, { status: 500 });
        }
      } catch {
        // parse 실패 → 빈 메시지
      }
    }
    const message = formatEmptyMessage(date);
    if (opts?.dryRun) {
      return new Response(message, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    try {
      await sendTelegramMessage(env, message);
      try { await env.BLEND_STATS.put('dev_log_last_run', new Date().toISOString()); } catch {}
      return new Response('sent', { status: 200 });
    } catch (e) {
      return new Response(`telegram failed: ${(e as Error).message}`, { status: 500 });
    }
  }

  // 메인 — 사용 통계 있음, Daily Pulse 생성
  let devLog: SummaryPayload | null = null;
  if (devLogJson) {
    try { devLog = JSON.parse(devLogJson) as SummaryPayload; } catch {}
  }

  const message = formatDailyPulse({
    date,
    today: todayUsage,
    yesterday: yesterdayUsage,
    weekAvgRequests, weekAvgCost,
    monthSoFar: monthV2?.month ?? null,
    countries: byCountry?.countries ?? [],
    oses: byOs?.oses ?? [],
    cohorts: retentionData?.cohorts ?? [],
    devLog,
  });

  if (opts?.dryRun) {
    return new Response(message, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  try {
    await sendTelegramMessage(env, message);
    try { await env.BLEND_STATS.put('dev_log_last_run', new Date().toISOString()); } catch {}
    return new Response('sent', { status: 200 });
  } catch (e) {
    const err = e as Error;
    try {
      await env.BLEND_STATS.put('dev_log_last_error', `${new Date().toISOString()} ${err.message}`);
    } catch {}
    return new Response(`telegram failed: ${err.message}`, { status: 500 });
  }
}
