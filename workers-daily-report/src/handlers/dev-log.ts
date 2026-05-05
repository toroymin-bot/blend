// KST 08:35 cron + GET /preview — 어제 요약을 텔레그램으로 전송 (Tori 명세 §6.5)

import type { Env, SummaryPayload, UsageDetailed } from '../types';
import { formatDevLogMessage, formatEmptyMessage } from '../lib/markdown-v2';
import { sendTelegramMessage } from '../lib/telegram';

// [2026-05-05 PM-46 Phase 5 Roy] blend-counter service binding으로 internal call.
// 이전 public URL fetch는 CF loop 차단(error 1042). Service binding은 internal routing이라
// edge cache + loop 검사 우회.
async function fetchYesterdayUsage(env: Env, date: string): Promise<UsageDetailed | null> {
  if (!env.BLEND_COUNTER) return null;
  try {
    // Service binding fetch — URL host는 무시되고 path/query만 의미. 'https://internal'
    // 같은 dummy host 사용 관행.
    const res = await env.BLEND_COUNTER.fetch(`https://internal/usage-detailed?date=${date}`);
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

  // 3. Telegram 전송 — KV 메타 기록은 부수적, 실패해도 본 흐름 차단 X.
  try {
    await sendTelegramMessage(env, message);
    // 성공 메타 — KV put 한도 초과해도 응답 영향 X.
    try { await env.BLEND_STATS.put('dev_log_last_run', new Date().toISOString()); } catch {}
    return new Response('sent', { status: 200 });
  } catch (e) {
    const err = e as Error;
    try {
      await env.BLEND_STATS.put(
        'dev_log_last_error',
        `${new Date().toISOString()} ${err.message ?? String(err)}`,
      );
    } catch { /* KV 한도 초과 — 에러 메시지만 응답으로 */ }
    return new Response(`telegram send failed: ${err.message ?? String(err)}`, { status: 500 });
  }
}
