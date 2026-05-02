#!/usr/bin/env node
// Blend Daily Telegram Report v2 (Tori 명세 2026-04-25)
// KST 08:40 = UTC 23:40 (전날) cron으로 실행.

const KV_API_BASE = `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/storage/kv/namespaces/${process.env.CF_KV_NAMESPACE_ID}`;

const HEADERS = {
  Authorization: `Bearer ${process.env.CF_API_TOKEN}`,
  'Content-Type': 'application/json',
};

// ── 날짜 유틸 ─────────────────────────────────────────────────
function yesterdayKST() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCDate(kst.getUTCDate() - 1);
  return kst.toISOString().slice(0, 10);
}

function dateOffset(baseDate, days) {
  const d = new Date(baseDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── KV 헬퍼 ──────────────────────────────────────────────────
async function listKVKeys(prefix) {
  const url = `${KV_API_BASE}/keys?prefix=${encodeURIComponent(prefix)}&limit=1000`;
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error(`KV list failed: ${r.status}`);
  const json = await r.json();
  return (json.result || []).map((k) => k.name);
}

async function getKV(key) {
  const url = `${KV_API_BASE}/values/${encodeURIComponent(key)}`;
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) return null;
  return r.text();
}

async function getKVJSON(key) {
  const v = await getKV(key);
  if (!v) return null;
  try { return JSON.parse(v); } catch { return null; }
}

// ── 리텐션 ───────────────────────────────────────────────────
async function calculateRetention(targetDate) {
  async function retentionRate(daysAgo) {
    const cohortDate = dateOffset(targetDate, -daysAgo);
    const cohort = (await getKVJSON(`cohort:${cohortDate}:users`)) || [];
    if (cohort.length === 0) return { cohortSize: 0, retained: 0, rate: null };
    const active = (await getKVJSON(`active:${cohortDate}:${targetDate}`)) || [];
    const retained = active.length;
    const rate = (retained / cohort.length) * 100;
    return { cohortSize: cohort.length, retained, rate: rate.toFixed(1) };
  }
  return {
    day1:  await retentionRate(1),
    day7:  await retentionRate(7),
    day30: await retentionRate(30),
  };
}

// ── 누적 사용자 ──────────────────────────────────────────────
async function getTotalUsers() {
  const cohortKeys = await listKVKeys('cohort:');
  let total = 0;
  for (const k of cohortKeys) {
    if (k.endsWith(':users')) {
      const cohort = (await getKVJSON(k)) || [];
      total += cohort.length;
    }
  }
  return total;
}

// ── 메뉴 정의 (큐레이션 기준) ────────────────────────────────
const ALL_MENUS = [
  'chat', 'compare', 'documents', 'models', 'dashboard',
  'agents', 'meeting', 'datasources', 'savings', 'billing',
  'security', 'about', 'settings',
];

// ── AI 사용 비용 추적 (2026-05-02 Roy) ────────────────────────
// blend-counter Worker가 /track-usage로 받아 KV에 마이크로센트 정수로 저장.
// daily:YYYY-MM-DD:usage:total:cost (×1_000_000 = USD)
// 1$ → KRW 환율은 ~1370 (변동, 단순화)
const KRW_PER_USD = 1370;

// [2026-05-02 Roy] provider id → 사람 친화적 회사+제품명 + 콘솔 링크.
// Roy가 텔레그램에서 직접 클릭해 들어가 실 청구액 확인 가능.
const PROVIDER_LABELS = {
  openai:    'OpenAI (GPT)',
  anthropic: 'Anthropic (Claude)',
  google:    'Google (Gemini)',
  deepseek:  'DeepSeek',
  groq:      'Groq',
};

// [2026-05-02 Roy] '돈 청구된 금액(₩/$)' 보여주는 빌링 페이지로 직링크.
// 각 회사 콘솔에서 ALL keys (조직/워크스페이스 단위) 합산 청구액이 표시되는 곳.
// usage 페이지가 아닌 billing/payment 페이지 — Roy가 클릭하면 결제 명세 바로 보임.
const PROVIDER_USAGE_URLS = {
  openai:    'https://platform.openai.com/settings/organization/billing/overview', // billing overview
  anthropic: 'https://console.anthropic.com/settings/billing',                     // 빌링/크레딧
  google:    'https://console.cloud.google.com/billing',                           // GCP 빌링 (Gemini API는 GCP 청구)
  deepseek:  'https://platform.deepseek.com/usage',                                // DeepSeek는 별도 billing 없음 — usage가 잔액+spend
  groq:      'https://console.groq.com/settings/billing',                          // billing
};

const COUNTRY_LABELS = {
  KR: '🇰🇷 한국', US: '🇺🇸 미국', JP: '🇯🇵 일본',  CN: '🇨🇳 중국',
  TW: '🇹🇼 대만', HK: '🇭🇰 홍콩', SG: '🇸🇬 싱가포르', VN: '🇻🇳 베트남',
  ID: '🇮🇩 인도네시아', PH: '🇵🇭 필리핀', TH: '🇹🇭 태국', MY: '🇲🇾 말레이시아',
  IN: '🇮🇳 인도', GB: '🇬🇧 영국', DE: '🇩🇪 독일', FR: '🇫🇷 프랑스',
  CA: '🇨🇦 캐나다', AU: '🇦🇺 호주', BR: '🇧🇷 브라질',
};

function microToUsd(micro) {
  return (micro || 0) / 1_000_000;
}

function fmtCost(usd) {
  if (!usd || usd === 0) return '$0.00';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

function fmtCostBoth(usd) {
  if (!usd || usd === 0) return '$0.00';
  const krw = Math.round(usd * KRW_PER_USD);
  return `${fmtCost(usd)} (₩${krw.toLocaleString()})`;
}

function fmtTokens(n) {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// 한 날짜의 prefix를 통째로 읽어 dict로 반환
async function loadDateBucket(date) {
  const prefix = `daily:${date}:usage:`;
  const keys = await listKVKeys(prefix);
  const out = {};
  await Promise.all(keys.map(async (k) => {
    const v = await getKV(k);
    out[k] = parseInt(v || '0', 10) || 0;
  }));
  return out;
}

// 여러 날짜를 합산 — 같은 sub-key 끼리 합침
function sumBuckets(buckets) {
  const merged = {};
  for (const b of buckets) {
    for (const [k, v] of Object.entries(b)) {
      // prefix(daily:YYYY-MM-DD:usage:) 떼고 sub-key만 사용
      const sub = k.replace(/^daily:\d{4}-\d{2}-\d{2}:usage:/, '');
      merged[sub] = (merged[sub] || 0) + v;
    }
  }
  return merged;
}

// sub 패턴별 Top-N 추출 (cost 기준)
//   pattern '^provider:([^:]+):cost$' → {openai: 1234, anthropic: 567, ...}
function topByPattern(merged, pattern, valueSuffix = ':cost', topN = 10) {
  const re = new RegExp(`^${pattern}${valueSuffix}$`);
  const result = [];
  for (const [k, v] of Object.entries(merged)) {
    const m = k.match(re);
    if (m) result.push({ key: m[1], value: v });
  }
  result.sort((a, b) => b.value - a.value);
  return result.slice(0, topN);
}

// [2026-05-02 Roy] OpenAI organization-level 실 청구액 자동 가져오기.
// admin key 필요 (https://platform.openai.com/settings/organization/admin-keys).
// /v1/organization/costs 엔드포인트 — start_time 부터의 일별 cost. 어제/이번주/전체.
//
// API: bucket_width='1d' / start_time(unix sec) / end_time(unix sec) / limit
// 응답: { data: [{ start_time, end_time, results: [{ amount: { value, currency } }] }, ... ] }
//
// 실패해도 본문 발송 차단 X — try/catch로 감싸 silent fallback (추정값만 표시).
async function fetchOpenAIRealCosts(targetDate) {
  const adminKey = process.env.OPENAI_ADMIN_KEY;
  if (!adminKey) return null; // 미설정 — silent skip

  // 시간 범위 계산 (UTC 기준)
  const yesterdayUTC = new Date(targetDate + 'T00:00:00Z');
  const yesterdayEnd = new Date(yesterdayUTC.getTime() + 24 * 60 * 60 * 1000);
  const weekStart = new Date(yesterdayUTC.getTime() - 6 * 24 * 60 * 60 * 1000);
  // 전체는 지난 90일 (KV TTL과 일치)
  const allStart = new Date(yesterdayUTC.getTime() - 89 * 24 * 60 * 60 * 1000);

  const fetchCosts = async (startDate, endDate) => {
    const url = new URL('https://api.openai.com/v1/organization/costs');
    url.searchParams.set('start_time', String(Math.floor(startDate.getTime() / 1000)));
    url.searchParams.set('end_time', String(Math.floor(endDate.getTime() / 1000)));
    url.searchParams.set('bucket_width', '1d');
    url.searchParams.set('limit', '180');
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${adminKey}`, 'Content-Type': 'application/json' },
    });
    if (!r.ok) {
      console.warn(`[openai-costs] ${r.status} ${await r.text().catch(() => '')}`);
      return null;
    }
    const json = await r.json();
    let total = 0;
    for (const bucket of json.data ?? []) {
      for (const result of bucket.results ?? []) {
        total += Number(result.amount?.value ?? 0);
      }
    }
    return total;
  };

  try {
    const [dayCost, weekCost, allCost] = await Promise.all([
      fetchCosts(yesterdayUTC, yesterdayEnd),
      fetchCosts(weekStart, yesterdayEnd),
      fetchCosts(allStart, yesterdayEnd),
    ]);
    if (dayCost === null && weekCost === null && allCost === null) return null;
    return {
      day: dayCost ?? 0,
      week: weekCost ?? 0,
      all: allCost ?? 0,
    };
  } catch (e) {
    console.warn('[openai-costs] fetch failed:', e?.message ?? e);
    return null;
  }
}

async function buildUsageSection(targetDate) {
  // [2026-05-02 Roy] 시간 윈도우: 어제 / 이번 주(7일) / 전체 누적(90일)
  // - 어제: targetDate 단일
  // - 이번 주: 어제 포함 7일
  // - 전체 누적: KV TTL 90일치 전부 (`daily:` prefix 모든 날짜 합산)
  const today = await loadDateBucket(targetDate);
  const todaySum = sumBuckets([today]);

  const weekDates = [];
  for (let i = 0; i < 7; i++) weekDates.push(dateOffset(targetDate, -i));
  const weekBuckets = await Promise.all(weekDates.map(loadDateBucket));
  const weekSum = sumBuckets(weekBuckets);

  // 전체 누적 — KV에서 daily:YYYY-MM-DD:usage:* prefix 가진 모든 날짜 키 listing
  // 후 모두 로드. listKVKeys는 prefix 검색이라 'daily:'로 받은 뒤 ':usage:'
  // 포함 키만 골라 날짜 추출.
  const allUsageKeys = await listKVKeys('daily:');
  const allUsageDateSet = new Set();
  for (const k of allUsageKeys) {
    const m = k.match(/^daily:(\d{4}-\d{2}-\d{2}):usage:/);
    if (m) allUsageDateSet.add(m[1]);
  }
  const allDates = [...allUsageDateSet].sort();
  const allBuckets = await Promise.all(allDates.map(loadDateBucket));
  const allSum = sumBuckets(allBuckets);
  const allDateRange = allDates.length > 0
    ? (allDates.length === 1 ? allDates[0] : `${allDates[0]} ~ ${allDates[allDates.length - 1]}`)
    : null;

  const totalToday = microToUsd(todaySum['total:cost']);
  const totalWeek = microToUsd(weekSum['total:cost']);
  const totalAll = microToUsd(allSum['total:cost']);
  if (totalToday === 0 && totalWeek === 0 && totalAll === 0) {
    return null;
  }

  const lines = [];
  lines.push('━━━━━━━━━━━━━━━━━━');
  lines.push('💰 *AI 사용 비용*');
  lines.push('');

  // ─────── 합계 (어제/이번 주/전체 누적) ───────
  lines.push('*합계*');
  lines.push(`어제          ${fmtCostBoth(totalToday)}  · ${todaySum['total:requests'] || 0}건 · ${fmtTokens(todaySum['total:tokens'])}토큰`);
  lines.push(`이번 주(7일)  ${fmtCostBoth(totalWeek)}  · ${weekSum['total:requests'] || 0}건 · ${fmtTokens(weekSum['total:tokens'])}토큰`);
  lines.push(`전체 누적     ${fmtCostBoth(totalAll)}  · ${allSum['total:requests'] || 0}건 · ${fmtTokens(allSum['total:tokens'])}토큰`);
  if (allDateRange) lines.push(`             (${allDateRange})`);
  lines.push('');

  // ─────── AI 회사별 합계 (3 윈도우 한눈에) ───────
  // [2026-05-02 Roy] 회사별 비교 가독성 — 각 회사가 어제/이번주/전체에서 얼마 썼는지
  // 한 표에. 하나라도 데이터 있으면 한 줄, 없으면 skip.
  const allProviders = new Set();
  ['openai', 'anthropic', 'google', 'deepseek', 'groq'].forEach((p) => allProviders.add(p));
  for (const sum of [todaySum, weekSum, allSum]) {
    for (const k of Object.keys(sum)) {
      const m = k.match(/^provider:([^:]+):cost$/);
      if (m) allProviders.add(m[1]);
    }
  }
  const providerRows = [];
  for (const p of allProviders) {
    const d = microToUsd(todaySum[`provider:${p}:cost`]);
    const w = microToUsd(weekSum[`provider:${p}:cost`]);
    const a = microToUsd(allSum[`provider:${p}:cost`]);
    if (d === 0 && w === 0 && a === 0) continue;
    providerRows.push({ p, d, w, a });
  }
  if (providerRows.length > 0) {
    providerRows.sort((x, y) => y.a - x.a); // 전체 누적 큰 순
    lines.push('*AI 회사별 합계 (추정값, 모든 API 키 통합)*');
    providerRows.forEach((r) => {
      const label = PROVIDER_LABELS[r.p] || r.p;
      const url = PROVIDER_USAGE_URLS[r.p];
      // Telegram Markdown 링크 형식 — 라벨에 [회사명](빌링 URL).
      // 클릭 → 그 회사 콘솔의 사용량/청구액 페이지 (조직 전체 모든 키 합산)
      lines.push(url ? `[${label}](${url})` : label);
      lines.push(`  어제 ${fmtCost(r.d)} · 이번주 ${fmtCost(r.w)} · 전체 ${fmtCost(r.a)}`);
    });
    lines.push('');
  }

  // [2026-05-02 Roy] OpenAI 실 청구액 (admin key 있으면 자동) ─────
  // /v1/organization/costs는 organization 단위 API → 모든 API 키(admin/standard/
  // restricted) 합산 청구액. Roy가 본인 + 다른 곳 등록한 모든 키 통합.
  const realCosts = await fetchOpenAIRealCosts(targetDate);
  if (realCosts) {
    lines.push('💵 *OpenAI 실 청구액 (자동, 모든 API 키 통합)*');
    lines.push(`어제          ${fmtCostBoth(realCosts.day)}`);
    lines.push(`이번 주(7일)  ${fmtCostBoth(realCosts.week)}`);
    lines.push(`전체(90일)    ${fmtCostBoth(realCosts.all)}`);
    lines.push(`[💳 OpenAI Usage 콘솔 열기](${PROVIDER_USAGE_URLS.openai})`);
    lines.push('');
  }

  // 다른 AI 회사 빌링 페이지 직링크 — 클릭하면 모든 API 키 합산 청구액 표시
  lines.push('💳 *각 회사 빌링 페이지 (모든 API 키 통합)*');
  ['anthropic', 'google', 'deepseek', 'groq'].forEach((p) => {
    const label = PROVIDER_LABELS[p];
    const url = PROVIDER_USAGE_URLS[p];
    lines.push(`[${label}](${url})`);
  });
  lines.push('');
  lines.push('💡 OpenAI 외 회사는 공개 usage API 미제공 → 위 링크 클릭해 직접 확인');
  lines.push('');

  // 윈도우별 세부 — 데이터 있는 윈도우만 출력
  // [helper] 한 sum에 대해 breakdown 4종(provider/model/hour/country/OS)을 lines에 push
  const renderBreakdown = (label, sum) => {
    const total = microToUsd(sum['total:cost']);
    if (total === 0) return false;

    lines.push(`━━ ${label} ━━`);

    // AI 회사별
    const provRows = topByPattern(sum, 'provider:([^:]+)', ':cost', 10);
    if (provRows.length > 0) {
      lines.push('*AI 회사별*');
      provRows.forEach((row) => {
        const usd = microToUsd(row.value);
        const reqs = sum[`provider:${row.key}:requests`] || 0;
        const tok = sum[`provider:${row.key}:tokens`] || 0;
        const label = PROVIDER_LABELS[row.key] || row.key;
        lines.push(`${label}  ${fmtCost(usd)}  · ${reqs}건 · ${fmtTokens(tok)}토큰`);
      });
      lines.push('');
    }

    // 모델별 Top 5
    const modelRows = topByPattern(sum, 'model:([^:]+)', ':cost', 5);
    if (modelRows.length > 0) {
      lines.push('*모델별 Top 5*');
      modelRows.forEach((row) => {
        const usd = microToUsd(row.value);
        const reqs = sum[`model:${row.key}:requests`] || 0;
        lines.push(`${row.key}  ${fmtCost(usd)}  · ${reqs}건`);
      });
      lines.push('');
    }

    // 시간대별 (KST)
    const hourRows = [];
    for (let h = 0; h < 24; h++) {
      const HH = String(h).padStart(2, '0');
      const cost = microToUsd(sum[`hour:${HH}:cost`]);
      if (cost > 0) hourRows.push({ hour: HH, cost });
    }
    if (hourRows.length > 0) {
      const maxCost = Math.max(...hourRows.map((r) => r.cost));
      lines.push('*시간대별 (KST)*');
      hourRows.forEach((r) => {
        const bars = Math.round((r.cost / maxCost) * 10);
        const bar = '█'.repeat(bars) + '░'.repeat(10 - bars);
        lines.push(`${r.hour}시  ${bar}  ${fmtCost(r.cost)}`);
      });
      lines.push('');
    }

    // 국가별
    const countryRows = topByPattern(sum, 'country:([^:]+)', ':cost', 8);
    if (countryRows.length > 0) {
      lines.push('*국가별*');
      countryRows.forEach((row) => {
        const usd = microToUsd(row.value);
        const reqs = sum[`country:${row.key}:requests`] || 0;
        const label = COUNTRY_LABELS[row.key] || row.key;
        lines.push(`${label}  ${fmtCost(usd)} · ${reqs}건`);
      });
      lines.push('');
    }

    // OS별
    const osRows = topByPattern(sum, 'os:([^:]+)', ':cost', 8);
    if (osRows.length > 0) {
      lines.push('*OS별*');
      osRows.forEach((row) => {
        const usd = microToUsd(row.value);
        const reqs = sum[`os:${row.key}:requests`] || 0;
        lines.push(`${row.key}  ${fmtCost(usd)} · ${reqs}건`);
      });
      lines.push('');
    }
    return true;
  };

  renderBreakdown('어제', todaySum);
  renderBreakdown('이번 주(7일)', weekSum);
  renderBreakdown('전체 누적(90일)', allSum);

  lines.push('—');
  lines.push('💡 비용은 토큰 × pricing 추정값 (~95% 정확). 실 청구액은 각 AI 콘솔 확인.');

  return lines.join('\n');
}

// ── 리포트 생성 ──────────────────────────────────────────────
async function buildReport() {
  const date = yesterdayKST();
  const prefix = `daily:${date}:`;

  const keys = await listKVKeys(prefix);
  const data = {};
  await Promise.all(keys.map(async (k) => { data[k] = await getKV(k); }));

  const newVisitors    = parseInt(data[`${prefix}visit:new`]    || '0', 10);
  const returnVisitors = parseInt(data[`${prefix}visit:return`] || '0', 10);
  const totalVisitors  = newVisitors + returnVisitors;
  const firstMessages  = parseInt(data[`${prefix}first_message_sent`] || '0', 10);
  const trialUsed      = parseInt(data[`${prefix}trial_used`]    || '0', 10);
  const compareUsed    = parseInt(data[`${prefix}compare_used`]  || '0', 10);

  // 모든 메뉴 카운트 (사용 안 된 메뉴는 0)
  const menuCounts = {};
  for (const menu of ALL_MENUS) {
    menuCounts[menu] = parseInt(data[`${prefix}menu_click:${menu}`] || '0', 10);
  }
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith(`${prefix}menu_click:`)) {
      const menu = k.split(':').pop();
      if (!Object.prototype.hasOwnProperty.call(menuCounts, menu)) {
        menuCounts[menu] = parseInt(v, 10);
      }
    }
  }

  const modelCounts = {};
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith(`${prefix}model_select:`)) {
      const model = k.split(':').pop();
      modelCounts[model] = parseInt(v, 10);
    }
  }

  const keysByProvider = {};
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith(`${prefix}key_registered:`)) {
      const provider = k.split(':').pop();
      keysByProvider[provider] = parseInt(v, 10);
    }
  }
  const keyRegistered = Object.values(keysByProvider).reduce((a, b) => a + b, 0);

  const conversionRate = firstMessages > 0
    ? ((keyRegistered / firstMessages) * 100).toFixed(1)
    : '—';

  const retention = await calculateRetention(date);
  const totalUsers = await getTotalUsers();

  const totalEvents = Object.values(data).reduce(
    (sum, v) => sum + (parseInt(v || '0', 10) || 0),
    0,
  );
  if (totalEvents === 0 && newVisitors === 0 && returnVisitors === 0) {
    return `📊 *Blend 일일 리포트*\n${date}\n\n어제는 활동이 없었어요.`;
  }

  // ── 리포트 작성 ─────────────────────────────────────────
  const lines = [];
  lines.push(`📊 *Blend 일일 리포트*`);
  lines.push(date);
  lines.push('');

  lines.push('*방문자*');
  lines.push(`총 ${totalVisitors}명 (신규 ${newVisitors} · 재방문 ${returnVisitors})`);
  lines.push(`누적 총 사용자  ${totalUsers.toLocaleString()}`);
  lines.push('');

  lines.push('*리텐션*');
  function fmtR(r) {
    if (r.rate === null) return '데이터 부족';
    return `${r.retained}/${r.cohortSize} (${r.rate}%)`;
  }
  lines.push(`Day 1   ${fmtR(retention.day1)}`);
  lines.push(`Day 7   ${fmtR(retention.day7)}`);
  lines.push(`Day 30  ${fmtR(retention.day30)}`);
  lines.push('');

  lines.push('*전환*');
  lines.push(`첫 메시지  ${firstMessages}`);
  lines.push(`키 등록    ${keyRegistered}`);
  lines.push(`전환율    ${conversionRate}%`);
  lines.push('');

  lines.push('*메뉴 사용 (전체)*');
  Object.entries(menuCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([menu, count]) => {
      const indicator = count === 0 ? '⚠️' : '  ';
      lines.push(`${indicator} ${menu}  ${count}`);
    });
  lines.push('');

  if (Object.keys(modelCounts).length > 0) {
    lines.push('*모델 사용 (전체)*');
    Object.entries(modelCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([model, count]) => lines.push(`${model}  ${count}`));
    lines.push('');
  }

  if (Object.keys(keysByProvider).length > 0) {
    lines.push('*프로바이더별 키 등록*');
    Object.entries(keysByProvider)
      .sort((a, b) => b[1] - a[1])
      .forEach(([p, c]) => lines.push(`${p}  ${c}`));
    lines.push('');
  }

  lines.push('*기타*');
  lines.push(`트라이얼  ${trialUsed}회`);
  lines.push(`Compare  ${compareUsed}회`);
  lines.push('');

  lines.push('—');
  lines.push('⚠️ 표시 = 사용 0건 (제거 검토)');
  lines.push('대시보드: https://vercel.com/toroymin-bots-projects/blend/analytics');

  // [2026-05-02 Roy] AI 사용 비용 섹션 append (블렌드 비즈니스 리포트 확장).
  // 데이터 0이면 섹션 자체 skip — 빈 칸 노이즈 차단.
  // 실패해도 본문 발송 보장 (try/catch).
  try {
    const usageSection = await buildUsageSection(date);
    if (usageSection) {
      lines.push('');
      lines.push(usageSection);
    }
  } catch (e) {
    console.error('[usage section] build failed:', e?.message ?? e);
    lines.push('');
    lines.push('⚠️ AI 사용 비용 섹션 빌드 실패 — 다음 발송에서 재시도');
  }

  return lines.join('\n');
}

// ── 텔레그램 발송 ────────────────────────────────────────────
async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    }),
  });
  if (!r.ok) throw new Error(`Telegram failed: ${r.status} ${await r.text()}`);
}

// ── 실행 ─────────────────────────────────────────────────────
(async () => {
  try {
    const report = await buildReport();
    console.log('=== Generated Report ===');
    console.log(report);
    console.log('========================');
    await sendTelegram(report);
    console.log('✓ Telegram message sent');
  } catch (e) {
    console.error('Report failed:', e);
    try {
      await sendTelegram(`⚠️ *Blend 리포트 발송 실패*\n\n${e.message || e}`);
    } catch {}
    process.exit(1);
  }
})();
