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

    // ═══ /track-usage — AI 사용 비용 추적 (2026-05-02 Roy) ═══
    // 채팅 응답 1회마다 client가 호출. KV에 시간/일별 + 국가/OS/owner별 누적.
    // 비용은 client에서 계산해 받음 (registry pricing이 client에 있음).
    // 키 설계 (TTL 90일):
    //   daily:YYYY-MM-DD:usage:total:{cost,tokens,requests}
    //   daily:YYYY-MM-DD:usage:provider:{p}:{cost,tokens,requests}
    //   daily:YYYY-MM-DD:usage:model:{m}:{cost,tokens,requests}
    //   daily:YYYY-MM-DD:usage:hour:HH:{cost,requests}        ← KST 시간
    //   daily:YYYY-MM-DD:usage:owner:{cost,tokens,requests}
    //   daily:YYYY-MM-DD:usage:owner:provider:{p}:cost
    //   daily:YYYY-MM-DD:usage:others:{cost,tokens,requests}  ← Roy 제외
    //   daily:YYYY-MM-DD:usage:country:{cc}:{cost,requests}    ← Roy 제외
    //   daily:YYYY-MM-DD:usage:os:{os}:{cost,requests}         ← Roy 제외
    if (url.pathname === '/track-usage' && req.method === 'POST') {
      try {
        const body = (await req.json()) as {
          provider?: string;
          model?: string;
          inputTokens?: number;
          outputTokens?: number;
          cost?: number;
          os?: string;
          // [2026-05-02 Roy] localStorage 마이그레이션용 — 과거 데이터를 그 시점의
          // KST 날짜/시간 키로 backdate 누적. 미제공 시 현재 시각.
          dateOverride?: string; // 'YYYY-MM-DD' (KST)
          hourOverride?: number; // 0~23 (KST)
        };

        const provider = String(body.provider ?? '').slice(0, 32) || 'unknown';
        const model = String(body.model ?? '').slice(0, 64) || 'unknown';
        const inputTokens = Math.max(0, Math.round(Number(body.inputTokens) || 0));
        const outputTokens = Math.max(0, Math.round(Number(body.outputTokens) || 0));
        const cost = Math.max(0, Number(body.cost) || 0);
        const tokens = inputTokens + outputTokens;
        const os = String(body.os ?? 'other').slice(0, 16);
        const country = (req.headers.get('CF-IPCountry') ?? 'XX').slice(0, 3);

        if (cost === 0 && tokens === 0) {
          return new Response('OK', { status: 200, headers: corsHeaders });
        }

        // 마이그레이션 backdate 지원 — dateOverride가 유효하면 사용.
        const validDate = typeof body.dateOverride === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(body.dateOverride) &&
          body.dateOverride <= kstDate(); // 미래 날짜 방지
        const today = validDate ? body.dateOverride! : kstDate();
        // KST 시간 (HH 00~23)
        const validHour = typeof body.hourOverride === 'number' &&
          body.hourOverride >= 0 && body.hourOverride < 24;
        const kstHour = validHour
          ? Math.floor(body.hourOverride!)
          : new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCHours();
        const HH = String(kstHour).padStart(2, '0');

        // 부동소수점 누적 → 정밀도 손실 방지: 마이크로센트 정수로 저장 (cost*1_000_000)
        // 읽을 때 / 1_000_000으로 복원. 연 1$ 사용해도 1e6 정수, 안전.
        const costMicro = Math.round(cost * 1_000_000);

        // 직렬 합산 helper — 호출 폭주 시 race condition 위험 있으나
        // KV는 eventually-consistent이라 부정확한 +1/+2 손실은 수용 (집계용도).
        const incr = async (key: string, by: number) => {
          if (by === 0) return;
          const cur = parseInt((await env.STATS.get(key)) || '0', 10);
          await env.STATS.put(key, String(cur + by), { expirationTtl: TTL_90D });
        };

        const base = `daily:${today}:usage`;

        // 전체 (Roy 포함 — owner 구분 없음)
        await incr(`${base}:total:cost`, costMicro);
        await incr(`${base}:total:tokens`, tokens);
        await incr(`${base}:total:requests`, 1);

        // 시간대별
        await incr(`${base}:hour:${HH}:cost`, costMicro);
        await incr(`${base}:hour:${HH}:requests`, 1);

        // 프로바이더별
        await incr(`${base}:provider:${provider}:cost`, costMicro);
        await incr(`${base}:provider:${provider}:tokens`, tokens);
        await incr(`${base}:provider:${provider}:requests`, 1);

        // 모델별
        await incr(`${base}:model:${model}:cost`, costMicro);
        await incr(`${base}:model:${model}:tokens`, tokens);
        await incr(`${base}:model:${model}:requests`, 1);

        // [2026-05-02 Roy] owner 구분 제거 — per-device setup 부담 회피.
        // 국가/OS는 모든 데이터에 대해 추적 (Roy 본인 데이터도 KR/macOS로 분류됨).
        await incr(`${base}:country:${country}:cost`, costMicro);
        await incr(`${base}:country:${country}:requests`, 1);
        await incr(`${base}:os:${os}:cost`, costMicro);
        await incr(`${base}:os:${os}:requests`, 1);

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
