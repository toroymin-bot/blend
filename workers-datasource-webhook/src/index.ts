// blend-datasource-webhook — Cloudflare Worker entrypoint
//
// Tori 명세 16384118 §3.7. 클라이언트 BYOK 유지.
//
// HTTP routes:
//   POST /webhook/google-drive          — Google Drive Watch 채널 알림 (헤더 기반)
//   POST /webhook/onedrive              — Microsoft Graph subscription 알림
//                                         (validationToken plain text 응답 포함)
//   GET  /queue/:datasourceId           — 클라이언트 폴링 (Bearer 인증)
//   POST /queue/:datasourceId/ack       — 처리한 fileIds ack (Bearer 인증)
//   POST /subscription/register         — 클라이언트가 자체 OAuth로 subscribe 후
//                                         메타 등록 (Bearer 인증)
//   GET  /subscription/expiring         — 만료 임박 subscription 목록 (Bearer 인증)
//   GET  /health                        — ok
//
// Cron: 17 *\/12 * * * — 12시간마다 만료 임박 subscription을 큐에 'renew_pending' 마킹.
// 실제 갱신은 클라이언트가 다음 진입 시 자체 OAuth로 수행.

import type { Env } from './types';
import { handleGoogleDriveWebhook } from './handlers/google-drive';
import { handleOneDriveWebhook } from './handlers/onedrive';
import { handleGetQueue, handleAckQueue } from './handlers/queue';
import {
  handleRegisterSubscription,
  handleListExpiringSubscriptions,
  markExpiringForRenewal,
} from './handlers/subscription';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

function withCors(res: Response): Response {
  const merged = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders)) merged.set(k, v);
  return new Response(res.body, { status: res.status, headers: merged });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(req.url);
    const path = url.pathname;

    if (path === '/health') {
      return withCors(new Response('ok', { status: 200 }));
    }

    // ── Webhook receivers ─────────────────────────────────────────────
    if (path === '/webhook/google-drive' && req.method === 'POST') {
      return await handleGoogleDriveWebhook(req, env);
    }
    if (path === '/webhook/onedrive') {
      // OneDrive validation handshake는 POST + ?validationToken=...
      if (req.method === 'POST') return await handleOneDriveWebhook(req, env);
    }

    // ── Client polling ────────────────────────────────────────────────
    const queueMatch = path.match(/^\/queue\/([^/]+)(\/ack)?$/);
    if (queueMatch) {
      const datasourceId = queueMatch[1];
      const isAck = !!queueMatch[2];
      if (isAck && req.method === 'POST') {
        return withCors(await handleAckQueue(req, env, datasourceId));
      }
      if (!isAck && req.method === 'GET') {
        return withCors(await handleGetQueue(req, env, datasourceId));
      }
    }

    // ── Subscription meta ─────────────────────────────────────────────
    if (path === '/subscription/register' && req.method === 'POST') {
      return withCors(await handleRegisterSubscription(req, env));
    }
    if (path === '/subscription/expiring' && req.method === 'GET') {
      return withCors(await handleListExpiringSubscriptions(req, env));
    }

    return withCors(new Response('Not Found', { status: 404 }));
  },

  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    if (event.cron === '17 */12 * * *') {
      const count = await markExpiringForRenewal(env);
      console.log(`[blend-datasource-webhook] cron renew-mark — ${count} expiring`);
    }
  },
};
