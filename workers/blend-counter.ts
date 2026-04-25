// Blend Counter — Cloudflare Worker (v2)
// Tori 명세 (Komi_Telegram_Daily_Report_2026-04-25.md)
// /track-visit  — 익명 UUID 기반 방문 추적 (신규/재방문 구분 + 코호트)
// /track        — 8 events 카운트 (props 일부를 키에 포함)
// 모든 KV 키 90일 TTL.

export interface Env {
  STATS: KVNamespace;
}

const ALLOWED_EVENTS = [
  'menu_click',
  'model_select',
  'trial_used',
  'key_registered',
  'first_message_sent',
  'chat_exported',
  'suggestion_clicked',
  'compare_used',
];

// KST 기준 날짜 (YYYY-MM-DD)
function kstDate(): string {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kst = new Date(now.getTime() + kstOffset);
  return kst.toISOString().slice(0, 10);
}

const TTL_90D = 60 * 60 * 24 * 90;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(req.url);

    // ═══ /track-visit — 방문 추적 ═══
    if (url.pathname === '/track-visit' && req.method === 'POST') {
      try {
        const { userId } = (await req.json()) as { userId: string };
        if (!userId || typeof userId !== 'string' || userId.length > 64) {
          return new Response('Invalid userId', { status: 400, headers: corsHeaders });
        }

        const today = kstDate();
        const userKey = `users:${userId}`;
        const existing = await env.STATS.get(userKey);

        if (!existing) {
          // 첫 방문
          await env.STATS.put(
            userKey,
            JSON.stringify({ firstVisit: today, lastVisit: today }),
            { expirationTtl: TTL_90D },
          );

          // 일일 신규 방문자 카운트
          const newKey = `daily:${today}:visit:new`;
          const newCount = parseInt((await env.STATS.get(newKey)) || '0', 10);
          await env.STATS.put(newKey, String(newCount + 1), { expirationTtl: TTL_90D });

          // 코호트 등록
          const cohortKey = `cohort:${today}:users`;
          const cohort: string[] = JSON.parse((await env.STATS.get(cohortKey)) || '[]');
          if (!cohort.includes(userId)) {
            cohort.push(userId);
            await env.STATS.put(cohortKey, JSON.stringify(cohort), { expirationTtl: TTL_90D });
          }
        } else {
          // 재방문
          const data = JSON.parse(existing);
          if (data.lastVisit !== today) {
            await env.STATS.put(
              userKey,
              JSON.stringify({ ...data, lastVisit: today }),
              { expirationTtl: TTL_90D },
            );

            const returnKey = `daily:${today}:visit:return`;
            const returnCount = parseInt((await env.STATS.get(returnKey)) || '0', 10);
            await env.STATS.put(returnKey, String(returnCount + 1), { expirationTtl: TTL_90D });

            // 코호트 활성화 기록 (리텐션 분석)
            // active:{cohortDate}:{today} = [userId, ...]
            const activeKey = `active:${data.firstVisit}:${today}`;
            const active: string[] = JSON.parse((await env.STATS.get(activeKey)) || '[]');
            if (!active.includes(userId)) {
              active.push(userId);
              await env.STATS.put(activeKey, JSON.stringify(active), { expirationTtl: TTL_90D });
            }
          }
        }

        return new Response('OK', { status: 200, headers: corsHeaders });
      } catch {
        return new Response('Error', { status: 500, headers: corsHeaders });
      }
    }

    // ═══ /track — 이벤트 추적 ═══
    if (url.pathname === '/track' && req.method === 'POST') {
      try {
        const body = (await req.json()) as {
          event: string;
          props?: Record<string, string | number | boolean>;
        };

        if (!body.event || !ALLOWED_EVENTS.includes(body.event)) {
          return new Response('Invalid event', { status: 400, headers: corsHeaders });
        }

        const today = kstDate();
        let key = `daily:${today}:${body.event}`;
        const props = body.props || {};

        // props 일부를 키에 추가 (세분화)
        if (body.event === 'menu_click' && props.menu) {
          key += `:${props.menu}`;
        } else if (body.event === 'model_select' && props.model) {
          key += `:${props.model}`;
        } else if (body.event === 'key_registered' && props.provider) {
          key += `:${props.provider}`;
        } else if (body.event === 'chat_exported' && props.format) {
          key += `:${props.format}`;
        }

        const current = parseInt((await env.STATS.get(key)) || '0', 10);
        await env.STATS.put(key, String(current + 1), { expirationTtl: TTL_90D });

        return new Response('OK', { status: 200, headers: corsHeaders });
      } catch {
        return new Response('Error', { status: 500, headers: corsHeaders });
      }
    }

    return new Response('Blend Counter API', { status: 200, headers: corsHeaders });
  },
};
