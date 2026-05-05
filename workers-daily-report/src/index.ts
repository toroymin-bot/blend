// blend-daily-report — Worker entrypoint (Tori 명세 v3 §6.3)
//
// 엔드포인트:
//   POST /push-summary  — KOMI nighttask가 일일 요약 KV에 저장
//   GET  /preview       — 오늘/지정날짜 요약을 plaintext로 미리보기 (Telegram 전송 X)
//   GET  /health        — 가벼운 상태 확인
//
// Cron:
//   35 23 * * *  → KST 08:35  →  어제 요약을 Telegram으로 전송

import type { Env } from './types';
import { handlePushSummary } from './handlers/push-summary';
import { handleDevLogSummary } from './handlers/dev-log';

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === '/push-summary' && req.method === 'POST') {
      return handlePushSummary(req, env);
    }

    if (url.pathname === '/preview' && req.method === 'GET') {
      const date = url.searchParams.get('date') ?? undefined;
      // [2026-05-05 Phase 5] ?send=1 → dryRun 끄고 실제 Telegram 발송. 평소 GET은 미리보기.
      const send = url.searchParams.get('send') === '1';
      return handleDevLogSummary(env, { dryRun: !send, date });
    }

    if (url.pathname === '/health') {
      return new Response('ok', { status: 200 });
    }

    // [2026-05-05 PM-46 Phase 5] 진단용 — service binding fetch 결과 확인.
    if (url.pathname === '/diag') {
      const date = url.searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
      let fetchInfo: any = { binding: env.BLEND_COUNTER ? 'present' : 'MISSING' };
      try {
        const r = await env.BLEND_COUNTER.fetch(`https://internal/usage-detailed?date=${date}`);
        fetchInfo.status = r.status;
        fetchInfo.body = (await r.text()).slice(0, 500);
      } catch (e) {
        fetchInfo.error = String(e);
      }
      return new Response(JSON.stringify({ date, fetchInfo }, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('blend-daily-report', { status: 200 });
  },

  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    if (event.cron === '35 23 * * *') {
      await handleDevLogSummary(env);
    }
  },
};
