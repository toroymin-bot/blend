// Subscription 메타 저장 + 만료 임박 갱신 알림.
//
// 클라이언트가 Picker로 폴더 선택 후 Subscribe API를 호출(자체 OAuth 토큰으로) 직후
// Worker에 메타 등록 — POST /subscription/register
//
// Worker는 메타만 보관 (subscriptionId, expiresAt, datasourceId, service).
// OAuth 토큰은 보관 X (BYOK 유지). 갱신 cron은 만료 임박한 datasourceId 목록만 알려주고,
// 실제 갱신은 클라이언트가 다음 진입 시 수행.

import type { Env, SubscriptionRecord } from '../types';

const KEY_PREFIX = 'sub:';
const RENEW_THRESHOLD_MS = 24 * 60 * 60 * 1000;     // 만료 24시간 전 갱신 안내

function authOk(req: Request, env: Env): boolean {
  if (!env.SHARED_CLIENT_TOKEN) return false;
  return req.headers.get('Authorization') === `Bearer ${env.SHARED_CLIENT_TOKEN}`;
}

export async function handleRegisterSubscription(req: Request, env: Env): Promise<Response> {
  if (!authOk(req, env)) return new Response('Unauthorized', { status: 401 });
  let body: SubscriptionRecord;
  try {
    body = (await req.json()) as SubscriptionRecord;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  if (!body.datasourceId || !body.subscriptionId || !body.service) {
    return new Response('Missing fields', { status: 400 });
  }
  const record: SubscriptionRecord = {
    datasourceId: body.datasourceId,
    service: body.service,
    subscriptionId: body.subscriptionId,
    expiresAt: Number(body.expiresAt) || 0,
    registeredAt: Date.now(),
  };
  const ttl = Math.max(60 * 60, Math.ceil((record.expiresAt - Date.now()) / 1000) + 60 * 60 * 24);
  await env.DS_QUEUE.put(`${KEY_PREFIX}${record.datasourceId}`, JSON.stringify(record), {
    expirationTtl: ttl,
  });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleListExpiringSubscriptions(req: Request, env: Env): Promise<Response> {
  if (!authOk(req, env)) return new Response('Unauthorized', { status: 401 });
  const expiring = await listExpiring(env);
  return new Response(JSON.stringify({ expiring }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function listExpiring(env: Env): Promise<SubscriptionRecord[]> {
  const out: SubscriptionRecord[] = [];
  const now = Date.now();
  let cursor: string | undefined;
  do {
    const list = await env.DS_QUEUE.list({ prefix: KEY_PREFIX, cursor });
    for (const k of list.keys) {
      const raw = await env.DS_QUEUE.get(k.name);
      if (!raw) continue;
      try {
        const rec = JSON.parse(raw) as SubscriptionRecord;
        if (rec.expiresAt > 0 && rec.expiresAt - now <= RENEW_THRESHOLD_MS) {
          out.push(rec);
        }
      } catch { /* skip */ }
    }
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);
  return out;
}

// Cron tick: 12시간마다 만료 임박 subscription 목록을 datasource별 'renew_pending' 큐 항목에
// 마킹. 클라이언트가 폴링 시 'renew_pending' 보면 자체 OAuth로 갱신 후 register 재호출.
export async function markExpiringForRenewal(env: Env): Promise<number> {
  const expiring = await listExpiring(env);
  for (const rec of expiring) {
    const queueKey = `queue:${rec.datasourceId}`;
    const raw = await env.DS_QUEUE.get(queueKey);
    const state = raw ? JSON.parse(raw) : { items: [], lastUpdated: 0 };
    state.items = state.items ?? [];
    const already = state.items.some((i: { fileId?: string; changeType?: string }) =>
      i.fileId === '__renew__' && i.changeType === 'updated');
    if (!already) {
      state.items.push({
        service: rec.service,
        fileId: '__renew__',
        changeType: 'updated',
        observedAt: Date.now(),
      });
    }
    state.lastUpdated = Date.now();
    await env.DS_QUEUE.put(queueKey, JSON.stringify(state), {
      expirationTtl: 60 * 60 * 24 * 60,
    });
  }
  return expiring.length;
}
