// KST 08:35 cron + GET /preview — 어제 요약을 텔레그램으로 전송 (Tori 명세 §6.5)

import type { Env, SummaryPayload, UsageDetailed } from '../types';
import { formatDevLogMessage, formatEmptyMessage } from '../lib/markdown-v2';
import { sendTelegramMessage } from '../lib/telegram';

// [2026-05-05 PM-46 Phase 4 Roy] blend-counter /usage-detailed에서 어제 데이터 fetch.
// 실패 시 null 반환 → markdown formatter가 usage 섹션 자체 생략. 본 dev-log 흐름에 영향 0.
async function fetchYesterdayUsage(env: Env, date: string): Promise<UsageDetailed | null> {
  if (!env.BLEND_COUNTER_URL) return null;
  try {
    const res = await fetch(`${env.BLEND_COUNTER_URL}/usage-detailed?date=${date}`);
    if (!res.ok) return null;
    const data = await res.json() as UsageDetailed & { error?: string };
    if (data.error) return null;
    if (typeof data.totalRequests !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

// "YYYY-MM-DD" — KST 기준 어제
function getYesterdayKST(): string {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const kstYesterday = new Date(kstNow.getTime() - 24 * 60 * 60 * 1000);
  return kstYesterday.toISOString().slice(0, 10);
}

export async function handleDevLogSummary(
  env: Env,
  opts?: { dryRun?: boolean; date?: string },
): Promise<Response> {
  const date = opts?.date ?? getYesterdayKST();

  // 1. KV에서 dev log + WAE에서 사용 통계 병렬 fetch (성능)
  const [json, usage] = await Promise.all([
    env.BLEND_STATS.get(`summary:${date}`),
    fetchYesterdayUsage(env, date),
  ]);

  let message: string;
  if (!json) {
    // KOMI가 push 안 했어도 사용 통계 있으면 그걸로 메시지 생성
    if (usage && usage.totalRequests > 0) {
      message = formatDevLogMessage({ date }, usage);
    } else {
      message = formatEmptyMessage(date);
    }
  } else {
    try {
      const parsed = JSON.parse(json) as SummaryPayload;
      message = formatDevLogMessage(parsed, usage ?? undefined);
    } catch {
      await env.BLEND_STATS.put(
        'dev_log_last_error',
        `${new Date().toISOString()} parse-failed:${date}`,
      );
      message = formatEmptyMessage(date);
    }
  }

  // 2. dryRun이면 미리보기만
  if (opts?.dryRun) {
    return new Response(message, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  // 3. Telegram 전송
  try {
    await sendTelegramMessage(env, message);
    await env.BLEND_STATS.put('dev_log_last_run', new Date().toISOString());
    return new Response('sent', { status: 200 });
  } catch (e) {
    const err = e as Error;
    await env.BLEND_STATS.put(
      'dev_log_last_error',
      `${new Date().toISOString()} ${err.message ?? String(err)}`,
    );
    return new Response(`telegram send failed: ${err.message}`, { status: 500 });
  }
}
