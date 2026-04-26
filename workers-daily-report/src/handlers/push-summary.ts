// POST /push-summary — KOMI nighttask가 일일 요약을 KV에 저장 (Tori 명세 §6.4)

import type { Env, SummaryPayload } from '../types';

const TTL_30D = 60 * 60 * 24 * 30;

function isValidDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function handlePushSummary(req: Request, env: Env): Promise<Response> {
  // 1. 인증 — Bearer 토큰
  if (!env.KOMI_PUSH_TOKEN) {
    return new Response('Server token not configured', { status: 500 });
  }
  const auth = req.headers.get('Authorization') ?? '';
  if (auth !== `Bearer ${env.KOMI_PUSH_TOKEN}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. 페이로드 파싱
  let payload: SummaryPayload;
  try {
    payload = (await req.json()) as SummaryPayload;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  // 3. 검증
  if (!isValidDate(payload.date)) {
    return new Response('Invalid date (expected YYYY-MM-DD)', { status: 400 });
  }
  // tasks/bugs/improvements 모두 옵셔널 — 어느 것도 없으면 빈 요약으로 저장
  for (const field of ['tasks', 'bugs', 'improvements'] as const) {
    const arr = payload[field];
    if (arr !== undefined && !Array.isArray(arr)) {
      return new Response(`Invalid ${field} (expected array)`, { status: 400 });
    }
  }

  // 4. KV 저장 (30일 TTL)
  const key = `summary:${payload.date}`;
  await env.BLEND_STATS.put(key, JSON.stringify(payload), {
    expirationTtl: TTL_30D,
  });

  // 5. 마지막 push 시점 기록
  await env.BLEND_STATS.put('summary:last_pushed', payload.date);

  return new Response(JSON.stringify({ ok: true, key }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
