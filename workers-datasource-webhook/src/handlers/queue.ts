// 클라이언트 폴링 — GET /queue/:datasourceId   (Bearer SHARED_CLIENT_TOKEN 인증)
// 클라이언트 ack    — POST /queue/:datasourceId/ack { fileIds: string[] }

import type { Env } from '../types';
import { fetchQueue, ackQueue } from '../lib/queue';

function authOk(req: Request, env: Env): boolean {
  if (!env.SHARED_CLIENT_TOKEN) return false;
  const auth = req.headers.get('Authorization') ?? '';
  return auth === `Bearer ${env.SHARED_CLIENT_TOKEN}`;
}

export async function handleGetQueue(req: Request, env: Env, datasourceId: string): Promise<Response> {
  if (!authOk(req, env)) return new Response('Unauthorized', { status: 401 });
  const state = await fetchQueue(env, datasourceId);
  return new Response(JSON.stringify(state), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleAckQueue(req: Request, env: Env, datasourceId: string): Promise<Response> {
  if (!authOk(req, env)) return new Response('Unauthorized', { status: 401 });
  let body: { fileIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  const fileIds = Array.isArray(body.fileIds) ? body.fileIds : [];
  const removed = await ackQueue(env, datasourceId, fileIds);
  return new Response(JSON.stringify({ ok: true, removed }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
