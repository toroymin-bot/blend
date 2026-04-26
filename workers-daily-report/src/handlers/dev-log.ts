// KST 08:35 cron + GET /preview — 어제 요약을 텔레그램으로 전송 (Tori 명세 §6.5)

import type { Env, SummaryPayload } from '../types';
import { formatDevLogMessage, formatEmptyMessage } from '../lib/markdown-v2';
import { sendTelegramMessage } from '../lib/telegram';

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

  // 1. KV 읽기 + 메시지 빌드
  const json = await env.BLEND_STATS.get(`summary:${date}`);
  let message: string;
  if (!json) {
    // KOMI가 push 안 했음 → "활동 없음"
    message = formatEmptyMessage(date);
  } else {
    try {
      const parsed = JSON.parse(json) as SummaryPayload;
      message = formatDevLogMessage(parsed);
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
