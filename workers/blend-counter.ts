// Blend Counter — Cloudflare Worker (v2)
// Tori 명세 (Komi_Telegram_Daily_Report_2026-04-25.md)
// /track-visit  — 익명 UUID 기반 방문 추적 (신규/재방문 구분 + 코호트)
// /track        — 8 events 카운트 (props 일부를 키에 포함)
// 모든 KV 키 90일 TTL.

export interface Env {
  STATS: KVNamespace;
  // [2026-05-05 PM-46 Roy] Workers Analytics Engine — KV race lost update 정정용.
  // Phase 1: KV write에 추가로 dual-write (try/catch 격리, KV path 그대로). 실패해도
  // 기존 동작 영향 0. Phase 2/3에서 read 경로 v2 신설 + 검증 후 cutover.
  USAGE_AE: AnalyticsEngineDataset;
  // Phase 2: WAE SQL API 호출용 자격증명 (Worker secret).
  // AE_QUERY_TOKEN: Account Analytics Read 권한 토큰
  // CF_ACCOUNT_ID: 계정 ID (URL 구성용)
  AE_QUERY_TOKEN: string;
  CF_ACCOUNT_ID: string;
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

        // [2026-05-05 PM-46 Roy] Workers Analytics Engine dual-write — KV race 정정용.
        // KV write는 위에 그대로 유지(완전 무영향). AE는 append-only이므로 race 없음.
        // try/catch 격리 — AE 실패해도 KV 응답에 영향 0 ('OK' 그대로 반환).
        // 스키마: indexes=[provider] (검색/GROUP BY 키), blobs=[model, country, os, date, hour],
        //         doubles=[cost USD, inputTokens, outputTokens]. timestamp 자동.
        // Phase 2에서 SELECT index1, SUM(_sample_interval), SUM(double1) GROUP BY index1
        // 로 provider별 집계 가능 (race 없는 정확한 합).
        try {
          env.USAGE_AE.writeDataPoint({
            indexes: [provider],
            blobs:   [model, country, os, today, HH],
            doubles: [cost, inputTokens, outputTokens],
          });
        } catch {
          // AE 실패는 본 응답 흐름 절대 막지 않음. KV path는 위에서 이미 완료됨.
        }

        return new Response('OK', { status: 200, headers: corsHeaders });
      } catch {
        return new Response('Error', { status: 500, headers: corsHeaders });
      }
    }

    // ═══ /usage-summary — KV 누적 사용량 조회 (2026-05-02 Roy) ═══
    // Billing 화면이 GET 요청 → 어제/이번주/이번달/전체(90일) 합계 + provider별
    // 합계 반환. localStorage(per-device)와 다르게 모든 디바이스(Mac/iPhone/PC)에서
    // 푸시한 데이터의 통합 뷰. CORS 허용 (브라우저 직접 호출).
    if (url.pathname === '/usage-summary' && req.method === 'GET') {
      try {
        const today = kstDate();
        const yesterdayKstDate = (() => {
          const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
          d.setUTCDate(d.getUTCDate() - 1);
          return d.toISOString().slice(0, 10);
        })();

        // 윈도우 정의 (KST)
        const sevenDaysAgo = (() => {
          const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
          d.setUTCDate(d.getUTCDate() - 6);
          return d.toISOString().slice(0, 10);
        })();
        const monthStart = today.slice(0, 7) + '-01';

        // KV listing — daily:* 모든 prefix 가진 키 + 사용량 키만 골라서 날짜 추출
        const list = await env.STATS.list({ prefix: 'daily:', limit: 1000 });
        const dates = new Set<string>();
        for (const k of list.keys) {
          const m = k.name.match(/^daily:(\d{4}-\d{2}-\d{2}):usage:/);
          if (m) dates.add(m[1]);
        }
        const allDates = [...dates].sort();

        // 한 날짜의 buckets 읽기 (최소 키만 — total + provider)
        const sumKeys = ['total:cost', 'total:tokens', 'total:requests'];
        const fetchDay = async (date: string) => {
          const keys = await env.STATS.list({ prefix: `daily:${date}:usage:`, limit: 200 });
          const bucket: Record<string, number> = {};
          await Promise.all(keys.keys.map(async (k) => {
            const v = await env.STATS.get(k.name);
            const sub = k.name.replace(`daily:${date}:usage:`, '');
            bucket[sub] = parseInt(v || '0', 10) || 0;
          }));
          return bucket;
        };

        const inWindow = (date: string, start: string, end: string) =>
          date >= start && date <= end;

        const sumDates = (filterFn: (d: string) => boolean) => {
          return allDates.filter(filterFn);
        };

        const yesterdayDates = sumDates((d) => d === yesterdayKstDate);
        const weekDates = sumDates((d) => inWindow(d, sevenDaysAgo, yesterdayKstDate));
        const monthDates = sumDates((d) => inWindow(d, monthStart, today));
        const allDatesArr = allDates;

        const sumBuckets = (buckets: Array<Record<string, number>>) => {
          const out: Record<string, number> = {};
          for (const b of buckets) {
            for (const [k, v] of Object.entries(b)) {
              out[k] = (out[k] || 0) + v;
            }
          }
          return out;
        };

        const [yBuckets, wBuckets, mBuckets, aBuckets] = await Promise.all([
          Promise.all(yesterdayDates.map(fetchDay)),
          Promise.all(weekDates.map(fetchDay)),
          Promise.all(monthDates.map(fetchDay)),
          Promise.all(allDatesArr.map(fetchDay)),
        ]);

        const ySum = sumBuckets(yBuckets);
        const wSum = sumBuckets(wBuckets);
        const mSum = sumBuckets(mBuckets);
        const aSum = sumBuckets(aBuckets);

        const microToUsd = (m: number) => (m || 0) / 1_000_000;
        const summarize = (sum: Record<string, number>) => {
          const providers: Record<string, { cost: number; tokens: number; requests: number }> = {};
          const models: Record<string, { cost: number; tokens: number; requests: number }> = {};
          for (const [k, v] of Object.entries(sum)) {
            const pm = k.match(/^provider:([^:]+):(cost|tokens|requests)$/);
            if (pm) {
              if (!providers[pm[1]]) providers[pm[1]] = { cost: 0, tokens: 0, requests: 0 };
              if (pm[2] === 'cost') providers[pm[1]].cost = microToUsd(v);
              else if (pm[2] === 'tokens') providers[pm[1]].tokens = v;
              else providers[pm[1]].requests = v;
              continue;
            }
            const mm = k.match(/^model:([^:]+):(cost|tokens|requests)$/);
            if (mm) {
              if (!models[mm[1]]) models[mm[1]] = { cost: 0, tokens: 0, requests: 0 };
              if (mm[2] === 'cost') models[mm[1]].cost = microToUsd(v);
              else if (mm[2] === 'tokens') models[mm[1]].tokens = v;
              else models[mm[1]].requests = v;
            }
          }
          return {
            totalCost: microToUsd(sum['total:cost']),
            totalTokens: sum['total:tokens'] || 0,
            totalRequests: sum['total:requests'] || 0,
            providers,
            models,
          };
        };

        const body = {
          generatedAt: new Date().toISOString(),
          dateRange: allDates.length > 0
            ? { from: allDates[0], to: allDates[allDates.length - 1] }
            : null,
          yesterday: summarize(ySum),
          week: summarize(wSum),
          month: summarize(mSum),
          all: summarize(aSum),
        };

        return new Response(JSON.stringify(body), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
            // 1분 캐시 — Billing 화면 새로고침 시 worker 부하 완화
            'Cache-Control': 'public, max-age=60',
          },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    // ═══ /usage-summary-v2 — WAE SQL 기반 (PM-46 Phase 2, 2026-05-05 Roy) ═══
    // KV race lost update 정정 — append-only WAE는 동시 쓰기에서 손실 없음.
    // 응답 shape는 /usage-summary와 동일 → 클라이언트는 endpoint URL만 swap하면 됨.
    // 기간은 KV 워커와 동일 의미 (yesterday=KST 어제, week=어제까지 7일, month=KST 월,
    // all=전체) — diff 비교 정확성을 위해.
    if (url.pathname === '/usage-summary-v2' && req.method === 'GET') {
      try {
        const today = kstDate();
        const yKst = (() => {
          const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
          d.setUTCDate(d.getUTCDate() - 1);
          return d.toISOString().slice(0, 10);
        })();
        // [2026-05-05 PM-46 Phase 7 Roy] rolling window 통일 — 클라 라벨 ("최근 7일",
        // "최근 30일")과 의미 일치. 이전엔 week=어제까지 7일(today 제외) / month=KST 캘린더 월
        // 이라 today 데이터 빠짐 → "어제 0건 / 이번주 0건 / 전체 49건" 같은 부조리 발생.
        const sevenDaysAgo = (() => {
          const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
          d.setUTCDate(d.getUTCDate() - 6); // today 포함 7일
          return d.toISOString().slice(0, 10);
        })();
        const thirtyDaysAgo = (() => {
          const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
          d.setUTCDate(d.getUTCDate() - 29); // today 포함 30일
          return d.toISOString().slice(0, 10);
        })();

        // WAE SQL 호출 helper. 응답 형식: { data: [{...row}], meta: [{...col}], ... }
        const querySql = async (sql: string): Promise<Array<Record<string, unknown>>> => {
          const res = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${env.AE_QUERY_TOKEN}`,
                'Content-Type': 'text/plain',
              },
              body: sql,
            },
          );
          if (!res.ok) {
            const txt = await res.text().catch(() => '');
            throw new Error(`AE SQL ${res.status}: ${txt.slice(0, 300)}`);
          }
          const json = await res.json() as { data?: Array<Record<string, unknown>> };
          return json.data ?? [];
        };

        // 한 기간 (date 범위)에 대한 provider/model 집계 + total 합산.
        // blob4 = KST date string (track-usage 시점에 저장됨). 범위 비교로 필터.
        // _sample_interval = AE의 정확한 카운트(샘플링 적용 시 자동 보정)
        // [2026-05-05 PM-46 Phase 5] models 필드 추가 — Dashboard 카테고리/category-by-model
        // 분석을 records 의존 없이 WAE만으로 수행 가능하게.
        const summarizePeriod = async (startDate: string | null, endDate: string | null) => {
          const where = startDate && endDate
            ? `WHERE blob4 >= '${startDate}' AND blob4 <= '${endDate}'`
            : '';

          const [providerRows, modelRows] = await Promise.all([
            querySql(`
              SELECT
                index1 AS provider,
                SUM(_sample_interval) AS requests,
                SUM(double1) AS cost,
                SUM(double2) AS input_tokens,
                SUM(double3) AS output_tokens
              FROM blend_usage
              ${where}
              GROUP BY index1
            `),
            querySql(`
              SELECT
                blob1 AS model,
                SUM(_sample_interval) AS requests,
                SUM(double1) AS cost,
                SUM(double2 + double3) AS tokens
              FROM blend_usage
              ${where}
              GROUP BY blob1
            `),
          ]);

          let totalCost = 0, totalTokens = 0, totalRequests = 0;
          const providers: Record<string, { cost: number; tokens: number; requests: number }> = {};
          for (const r of providerRows) {
            const p = String(r.provider || 'unknown');
            const requests = Number(r.requests) || 0;
            const cost = Number(r.cost) || 0;
            const tokens = (Number(r.input_tokens) || 0) + (Number(r.output_tokens) || 0);
            totalCost += cost;
            totalTokens += tokens;
            totalRequests += requests;
            providers[p] = { cost, tokens, requests };
          }
          const models: Record<string, { cost: number; tokens: number; requests: number }> = {};
          for (const r of modelRows) {
            const m = String(r.model || 'unknown');
            models[m] = {
              cost: Number(r.cost) || 0,
              tokens: Number(r.tokens) || 0,
              requests: Number(r.requests) || 0,
            };
          }
          return { totalCost, totalTokens, totalRequests, providers, models };
        };

        // [2026-05-05 PM-46 Phase 7] today 추가 + week/month rolling. 라벨과 의미 일치.
        const [todayP, yesterday, week, month, all] = await Promise.all([
          summarizePeriod(today, today),
          summarizePeriod(yKst, yKst),
          summarizePeriod(sevenDaysAgo, today),
          summarizePeriod(thirtyDaysAgo, today),
          summarizePeriod(null, null),
        ]);

        return new Response(JSON.stringify({
          generatedAt: new Date().toISOString(),
          source: 'analytics_engine',
          today: todayP,
          yesterday,
          week,
          month,
          all,
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
            'Cache-Control': 'public, max-age=60',
          },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: String(e), source: 'analytics_engine' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    // [2026-05-05 PM-46 Phase 2] /usage-summary-diff endpoint 제거 — 워커가 자기 URL
    // fetch 시 CF가 loop 차단(error 1042). 검증은 외부 curl 두 번(/usage-summary +
    // /usage-summary-v2)으로 충분.

    // ═══ /usage-grid — period 내 일×시간 분포 (Phase 5, 2026-05-05 Roy) ═══
    // Dashboard 히트맵 전용. records(이 디바이스) 의존 제거 → WAE만으로 모든 디바이스
    // 활동 시간대 시각화. blob4 (KST date) + blob5 (KST hour) 그룹.
    if (url.pathname === '/usage-grid' && req.method === 'GET') {
      try {
        const from = url.searchParams.get('from');
        const to = url.searchParams.get('to');
        if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
          return new Response(JSON.stringify({ error: 'from/to params required (YYYY-MM-DD)' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }

        const querySql = async (sql: string): Promise<Array<Record<string, unknown>>> => {
          const res = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${env.AE_QUERY_TOKEN}`,
                'Content-Type': 'text/plain',
              },
              body: sql,
            },
          );
          if (!res.ok) {
            const txt = await res.text().catch(() => '');
            throw new Error(`AE SQL ${res.status}: ${txt.slice(0, 300)}`);
          }
          const json = await res.json() as { data?: Array<Record<string, unknown>> };
          return json.data ?? [];
        };

        const rows = await querySql(`
          SELECT blob4 AS date, blob5 AS hour,
                 SUM(_sample_interval) AS requests
          FROM blend_usage
          WHERE blob4 >= '${from}' AND blob4 <= '${to}'
          GROUP BY blob4, blob5
        `);

        const grid = rows.map((r) => ({
          date: String(r.date || ''),
          hour: String(r.hour || '00'),
          requests: Number(r.requests) || 0,
        }));
        return new Response(JSON.stringify({ from, to, grid }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
            'Cache-Control': 'public, max-age=120',
          },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    // ═══ /usage-daily — 최근 N일 일별 cost/requests (Phase 5, 2026-05-05 Roy) ═══
    // Billing 차트 전용. records.getCostByDay() 대체 → 모든 디바이스 합산.
    if (url.pathname === '/usage-daily' && req.method === 'GET') {
      try {
        const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get('days') || '30', 10)));
        const today = kstDate();
        const startDate = (() => {
          const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
          d.setUTCDate(d.getUTCDate() - (days - 1));
          return d.toISOString().slice(0, 10);
        })();

        const querySql = async (sql: string): Promise<Array<Record<string, unknown>>> => {
          const res = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${env.AE_QUERY_TOKEN}`,
                'Content-Type': 'text/plain',
              },
              body: sql,
            },
          );
          if (!res.ok) {
            const txt = await res.text().catch(() => '');
            throw new Error(`AE SQL ${res.status}: ${txt.slice(0, 300)}`);
          }
          const json = await res.json() as { data?: Array<Record<string, unknown>> };
          return json.data ?? [];
        };

        // [2026-05-05 PM-46 Phase 5] ORDER BY blob4 제거 — WAE SQL이 ORDER BY blob 컬럼
        // 타입 추론 실패하는 케이스 있음 ("unable to find type of column: blob4"). 정렬은
        // 클라이언트에서 수행.
        const rows = await querySql(`
          SELECT blob4 AS date,
                 SUM(_sample_interval) AS requests,
                 SUM(double1) AS cost
          FROM blend_usage
          WHERE blob4 >= '${startDate}' AND blob4 <= '${today}'
          GROUP BY blob4
        `);

        // 비어있는 날도 포함 (UI 그래프 X축 균등)
        const byDate = new Map<string, { requests: number; cost: number }>();
        for (const r of rows) {
          byDate.set(String(r.date || ''), {
            requests: Number(r.requests) || 0,
            cost: Number(r.cost) || 0,
          });
        }
        const daily: Array<{ date: string; requests: number; cost: number }> = [];
        for (let i = days - 1; i >= 0; i--) {
          const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
          d.setUTCDate(d.getUTCDate() - i);
          const dateStr = d.toISOString().slice(0, 10);
          const v = byDate.get(dateStr) ?? { requests: 0, cost: 0 };
          daily.push({ date: dateStr, ...v });
        }

        return new Response(JSON.stringify({ from: startDate, to: today, daily }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
            'Cache-Control': 'public, max-age=120',
          },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    // ═══ /usage-by-country — 국가별 분포 (Phase 6, 2026-05-05 Roy) ═══
    // blob2 = country (CF-IPCountry). date 범위 내 합산.
    if (url.pathname === '/usage-by-country' && req.method === 'GET') {
      try {
        const from = url.searchParams.get('from');
        const to = url.searchParams.get('to');
        if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
          return new Response(JSON.stringify({ error: 'from/to required' }), {
            status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }
        const querySql = async (sql: string) => {
          const r = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,
            { method: 'POST', headers: { Authorization: `Bearer ${env.AE_QUERY_TOKEN}`, 'Content-Type': 'text/plain' }, body: sql },
          );
          if (!r.ok) throw new Error(`AE ${r.status}`);
          const j = await r.json() as { data?: Array<Record<string, unknown>> };
          return j.data ?? [];
        };
        const rows = await querySql(`
          SELECT blob2 AS country, SUM(_sample_interval) AS requests, SUM(double1) AS cost
          FROM blend_usage WHERE blob4 >= '${from}' AND blob4 <= '${to}'
          GROUP BY blob2
        `);
        const countries = rows.map((r) => ({
          code: String(r.country || 'XX'),
          requests: Number(r.requests) || 0,
          cost: Number(r.cost) || 0,
        }));
        return new Response(JSON.stringify({ from, to, countries }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders, 'Cache-Control': 'public, max-age=120' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), {
          status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    // ═══ /usage-by-os — OS별 분포 ═══
    if (url.pathname === '/usage-by-os' && req.method === 'GET') {
      try {
        const from = url.searchParams.get('from');
        const to = url.searchParams.get('to');
        if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
          return new Response(JSON.stringify({ error: 'from/to required' }), {
            status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }
        const querySql = async (sql: string) => {
          const r = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,
            { method: 'POST', headers: { Authorization: `Bearer ${env.AE_QUERY_TOKEN}`, 'Content-Type': 'text/plain' }, body: sql },
          );
          if (!r.ok) throw new Error(`AE ${r.status}`);
          const j = await r.json() as { data?: Array<Record<string, unknown>> };
          return j.data ?? [];
        };
        const rows = await querySql(`
          SELECT blob3 AS os, SUM(_sample_interval) AS requests, SUM(double1) AS cost
          FROM blend_usage WHERE blob4 >= '${from}' AND blob4 <= '${to}'
          GROUP BY blob3
        `);
        const oses = rows.map((r) => ({
          os: String(r.os || 'other'),
          requests: Number(r.requests) || 0,
          cost: Number(r.cost) || 0,
        }));
        return new Response(JSON.stringify({ from, to, oses }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders, 'Cache-Control': 'public, max-age=120' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), {
          status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    // ═══ /retention-cohorts — 코호트 리텐션 (KV /track-visit 데이터 기반) ═══
    // KV `cohort:{date}:users` = 그날 가입한 userId[]
    // KV `active:{cohortDate}:{checkDate}` = checkDate에 활성한 cohort 멤버
    // 최근 30일 코호트 모두 조회 → D+1 D+7 D+30 계산.
    if (url.pathname === '/retention-cohorts' && req.method === 'GET') {
      try {
        const today = kstDate();
        const days = Math.min(60, Math.max(7, parseInt(url.searchParams.get('days') || '30', 10)));
        const start = (() => {
          const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
          d.setUTCDate(d.getUTCDate() - days);
          return d.toISOString().slice(0, 10);
        })();

        // 가입 코호트 list
        const list = await env.STATS.list({ prefix: 'cohort:', limit: 100 });
        const cohortDates = list.keys
          .map((k) => k.name.match(/^cohort:(\d{4}-\d{2}-\d{2}):users$/)?.[1])
          .filter((d): d is string => !!d && d >= start && d <= today)
          .sort();

        const addDays = (date: string, n: number): string => {
          const d = new Date(date + 'T00:00:00Z');
          d.setUTCDate(d.getUTCDate() + n);
          return d.toISOString().slice(0, 10);
        };

        const cohorts = await Promise.all(cohortDates.map(async (cd) => {
          const usersJson = await env.STATS.get(`cohort:${cd}:users`);
          const users: string[] = usersJson ? JSON.parse(usersJson) : [];
          const cohortSize = users.length;
          const checkActive = async (offset: number): Promise<number> => {
            const checkDate = addDays(cd, offset);
            if (checkDate > today) return 0; // 아직 안 지남
            const json = await env.STATS.get(`active:${cd}:${checkDate}`);
            const active: string[] = json ? JSON.parse(json) : [];
            return active.length;
          };
          const [d1, d7, d30] = await Promise.all([checkActive(1), checkActive(7), checkActive(30)]);
          return { cohortDate: cd, cohortSize, d1Active: d1, d7Active: d7, d30Active: d30 };
        }));

        return new Response(JSON.stringify({ from: start, to: today, cohorts }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders, 'Cache-Control': 'public, max-age=300' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), {
          status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    // ═══ /usage-detailed — 1일 상세 분석 (PM-46 Phase 4, 2026-05-05 Roy) ═══
    // Telegram 일일 리포트 워커가 호출 → provider/model/hour breakdown 반환.
    // KST 날짜 기준 (date param = YYYY-MM-DD). WAE SQL 3개 쿼리 병렬.
    if (url.pathname === '/usage-detailed' && req.method === 'GET') {
      try {
        const date = url.searchParams.get('date');
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return new Response(JSON.stringify({ error: 'date param required (YYYY-MM-DD)' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }

        const querySql = async (sql: string): Promise<Array<Record<string, unknown>>> => {
          const res = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${env.AE_QUERY_TOKEN}`,
                'Content-Type': 'text/plain',
              },
              body: sql,
            },
          );
          if (!res.ok) {
            const txt = await res.text().catch(() => '');
            throw new Error(`AE SQL ${res.status}: ${txt.slice(0, 300)}`);
          }
          const json = await res.json() as { data?: Array<Record<string, unknown>> };
          return json.data ?? [];
        };

        const where = `WHERE blob4 = '${date}'`;
        const [providerRows, modelRows, hourlyRows] = await Promise.all([
          querySql(`
            SELECT index1 AS provider,
                   SUM(_sample_interval) AS requests,
                   SUM(double1) AS cost,
                   SUM(double2 + double3) AS tokens
            FROM blend_usage ${where}
            GROUP BY index1
          `),
          querySql(`
            SELECT blob1 AS model,
                   SUM(_sample_interval) AS requests,
                   SUM(double1) AS cost,
                   SUM(double2 + double3) AS tokens
            FROM blend_usage ${where}
            GROUP BY blob1
          `),
          querySql(`
            SELECT blob5 AS hour,
                   SUM(_sample_interval) AS requests,
                   SUM(double1) AS cost
            FROM blend_usage ${where}
            GROUP BY blob5
          `),
        ]);

        let totalRequests = 0, totalCost = 0, totalTokens = 0;
        const providers: Record<string, { requests: number; cost: number; tokens: number }> = {};
        for (const r of providerRows) {
          const p = String(r.provider || 'unknown');
          const requests = Number(r.requests) || 0;
          const cost = Number(r.cost) || 0;
          const tokens = Number(r.tokens) || 0;
          totalRequests += requests;
          totalCost += cost;
          totalTokens += tokens;
          providers[p] = { requests, cost, tokens };
        }
        const models: Record<string, { requests: number; cost: number; tokens: number }> = {};
        for (const r of modelRows) {
          const m = String(r.model || 'unknown');
          models[m] = {
            requests: Number(r.requests) || 0,
            cost: Number(r.cost) || 0,
            tokens: Number(r.tokens) || 0,
          };
        }
        const hourly: Array<{ hour: string; requests: number; cost: number }> = [];
        for (const r of hourlyRows) {
          hourly.push({
            hour: String(r.hour || '00'),
            requests: Number(r.requests) || 0,
            cost: Number(r.cost) || 0,
          });
        }

        return new Response(JSON.stringify({
          date,
          totalRequests,
          totalCost,
          totalTokens,
          providers,
          models,
          hourly,
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
            'Cache-Control': 'public, max-age=300', // 5분 캐시
          },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
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
