'use client';

/**
 * D1DashboardView — Design1 Dashboard view
 * "당신이 AI를 어떻게 쓰는지 한눈에."
 *
 * Self-contained. useUsageStore.records 단일 데이터 소스.
 */

import { useEffect, useMemo, useState } from 'react';
import { useUsageStore } from '@/stores/usage-store';
import { AVAILABLE_MODELS } from '@/data/available-models';
import { fetchUsageSummary } from '@/lib/usage-summary';

// ── Design tokens ────────────────────────────────────────────────
const tokens = {
  bg:           'var(--d1-bg)',
  surface:      'var(--d1-surface)',
  surfaceAlt:   'var(--d1-surface-alt)',
  text:         'var(--d1-text)',
  textDim:      'var(--d1-text-dim)',
  textFaint:    'var(--d1-text-faint)',
  accent:       'var(--d1-accent)',
  accentSoft:   'var(--d1-accent-soft)',
  border:       'var(--d1-border)',
  borderStrong: 'var(--d1-border-strong)',
} as const;

const BRAND_COLORS: Record<string, string> = {
  openai:    '#10a37f',
  anthropic: '#d97757',
  google:    '#4285f4',
  deepseek:  '#4B5EFC',
  groq:      '#f55036',
};

const CATEGORY_COLORS: Record<string, string> = {
  coding:      '#4285f4',
  analysis:    '#d97757',
  creative:    '#c65a3c',
  translation: '#10a37f',
  general:     '#a8a49b',
};

// ── Period ───────────────────────────────────────────────────────
// [2026-05-05 PM-46 Roy] 기간 정의 = rolling window (달력 단위 X).
// today=최근24h, yesterday=24~48h 전(어제 하루), week=최근7일, month=최근30일,
// year=최근365일, all=전체.
// '어제' 라벨에 (최근 N) 미부착 의도적 — 다른 칩의 "(최근 N)"은 "지금부터 N 단위
// 거슬러" 의미라 모호성 제거에 필요하지만, '어제'는 의미가 단일이므로 사족.
type Period = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'all';

// ── Copy ─────────────────────────────────────────────────────────
const copy = {
  ko: {
    title:        '대시보드',
    subtitle:     '당신이 AI를 어떻게 쓰는지 한눈에.',
    periods:      {
      today:     '오늘(최근 24시간)',
      yesterday: '어제',
      week:      '이번 주(최근 7일)',
      month:     '이번 달(최근 30일)',
      year:      '올해(최근 1년간)',
      all:       '전체',
    } as Record<Period, string>,
    chats:        '대화',
    messages:     '메시지',
    modelsUsed:   '사용한 모델',
    dailyAvg:     '일평균 메시지',
    whenLabel:    '사용 시간대',
    topModels:    '가장 많이 쓴 모델',
    categories:   '무엇에 가장 많이 쓰나요?',
    empty:        '아직 사용 기록이 없어요.',
    emptyHint:    '채팅을 시작하면 이곳에 통계가 쌓입니다.',
    cat: {
      coding:      '코딩',
      analysis:    '분석',
      creative:    '창작',
      translation: '번역',
      general:     '일반',
    } as Record<string, string>,
    weekdays: ['일', '월', '화', '수', '목', '금', '토'],
  },
  en: {
    title:        'Dashboard',
    subtitle:     'How you use AI at a glance.',
    periods:      {
      today:     'Today (24h)',
      yesterday: 'Yesterday',
      week:      'This week (7d)',
      month:     'This month (30d)',
      year:      'This year (365d)',
      all:       'All time',
    } as Record<Period, string>,
    chats:        'Chats',
    messages:     'Messages',
    modelsUsed:   'Models used',
    dailyAvg:     'Daily avg msgs',
    whenLabel:    'When you use Blend',
    topModels:    'Most used models',
    categories:   'What you use AI for',
    empty:        'No data yet.',
    emptyHint:    'Once you start chatting, your stats will appear here.',
    cat: {
      coding:      'Coding',
      analysis:    'Analysis',
      creative:    'Creative',
      translation: 'Translation',
      general:     'General',
    } as Record<string, string>,
    weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  },
} as const;

// ── Helpers ──────────────────────────────────────────────────────
// [2026-05-05 PM-46 Roy] cutoff(단일 lower bound) → range(start+end) 리팩터.
// yesterday는 24h~48h 전 구간이라 upper bound도 필요. month/year는 rolling window
// 변경(이전 "달력 단위" 폐기). 모든 period가 동일한 인터페이스로 필터됨.
const DAY_MS = 24 * 60 * 60 * 1000;
function periodRange(p: Period): { start: number; end: number } {
  const now = Date.now();
  if (p === 'today')     return { start: now -   1 * DAY_MS, end: now };
  if (p === 'yesterday') return { start: now -   2 * DAY_MS, end: now - 1 * DAY_MS };
  if (p === 'week')      return { start: now -   7 * DAY_MS, end: now };
  if (p === 'month')     return { start: now -  30 * DAY_MS, end: now };
  if (p === 'year')      return { start: now - 365 * DAY_MS, end: now };
  return { start: 0, end: now };
}

// [2026-05-05 PM-46 Roy] 일평균 분모 = 명목 period 일수.
// 이전엔 records 기반 active days 사용했는데 이 디바이스 활동일이라 KV 메시지 카드와
// 분모/분자 불일치 → 사용자 혼란("171건인데 왜 3?"). KPI는 모든 디바이스 합산이므로
// 분모도 명목 일수로 통일 → 171/7=24.4 직관적.
function periodDayCount(p: Period, recordsOldestTs: number | null): number {
  if (p === 'today' || p === 'yesterday') return 1;
  if (p === 'week')  return 7;
  if (p === 'month') return 30;
  if (p === 'year')  return 365;
  // all: 가장 오래된 record 시점부터 지금까지 일수. records 비어있으면 1 (div/0 회피).
  if (recordsOldestTs == null) return 1;
  return Math.max(1, Math.ceil((Date.now() - recordsOldestTs) / DAY_MS));
}

function modelDisplayName(id: string): string {
  const found = AVAILABLE_MODELS.find((m) => m.id === id)?.displayName;
  if (found) return found;
  // Fallback: humanize raw id (e.g. "deepseek-chat" → "Deepseek Chat")
  return id
    .split('-')
    .map((part) => /^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function modelProvider(id: string): string {
  const m = AVAILABLE_MODELS.find((x) => x.id === id);
  if (m) return m.provider;
  // Fallback inference
  const lc = id.toLowerCase();
  if (lc.startsWith('gpt') || lc.startsWith('o1') || lc.startsWith('o3') || lc.startsWith('o4')) return 'openai';
  if (lc.startsWith('claude'))   return 'anthropic';
  if (lc.startsWith('gemini') || lc.startsWith('gemma')) return 'google';
  if (lc.startsWith('deepseek')) return 'deepseek';
  if (lc.includes('llama') || lc.includes('mixtral')) return 'groq';
  return 'openai';
}

function categoryOfModel(id: string): keyof typeof CATEGORY_COLORS {
  // Heuristic mapping for category distribution (model-derived)
  const lc = id.toLowerCase();
  if (lc.includes('opus') || lc.includes('reasoner') || lc.startsWith('o1') || lc.startsWith('o3'))   return 'analysis';
  if (lc.includes('coder') || lc.includes('claude-sonnet') || lc.startsWith('gpt-4o')) return 'coding';
  if (lc.includes('haiku') || lc.includes('flash') || lc.includes('mini'))   return 'general';
  if (lc.includes('gemini'))                            return 'translation';
  return 'creative';
}

// ── Main view ────────────────────────────────────────────────────
export default function D1DashboardView({ lang }: { lang: 'ko' | 'en' | 'ph' }) {
  const t = lang === 'ko' ? copy.ko : copy.en;

  const records         = useUsageStore((s) => s.records);
  const loadFromStorage = useUsageStore((s) => s.loadFromStorage);

  // [2026-05-05 PM-42 Roy] Cloudflare KV summary 통합 — 모든 디바이스 합산.
  // 이전 dashboard는 records (이 디바이스 localStorage)만 사용 → 비용 절감 메뉴와
  // 데이터 불일치 (대시보드 5건 vs 비용절감 233건). 데이터 아키텍처 결함 정정.
  // KV에 시간대별/카테고리별 분포 없음 → KPI 카드만 KV 합산 사용, 패턴 분석은 records.
  const [kvSummary, setKvSummary] = useState<null | {
    yesterday: { totalCost: number; totalRequests: number };
    week: { totalCost: number; totalRequests: number; providers: Record<string, { cost: number; requests: number }> };
    month: { totalCost: number; totalRequests: number; providers?: Record<string, { cost: number; requests: number }> };
    all: { totalCost: number; totalRequests: number; providers: Record<string, { cost: number; requests: number }> };
  }>(null);

  useEffect(() => {
    loadFromStorage();
    // [2026-05-05 PM-46 Phase 3 Roy] 공통 util fetchUsageSummary 사용 → 자동 v2(WAE) 우선,
    // 실패 시 KV fallback. Billing 카드와 동일 함수 호출이라 데이터 일관성 자동 보장.
    fetchUsageSummary().then((data) => { if (data) setKvSummary(data); });
  }, [loadFromStorage]);

  // [2026-05-05 PM-46 Roy] 기본값 = '이번 달(최근 30일)' 유지. today/yesterday는 옵션 추가만.
  const [period, setPeriod] = useState<Period>('month');

  const filtered = useMemo(() => {
    const { start, end } = periodRange(period);
    return records.filter((r) => r.timestamp >= start && r.timestamp < end);
  }, [records, period]);

  const stats = useMemo(() => {
    // [2026-05-05 PM-42/46 Roy] 단일 데이터 통합 — 비용 절감 메뉴와 일치하는 KV 합산 사용.
    // 이전: 모든 KPI가 records (이 디바이스 localStorage)만 사용 → 비용 절감 233건인데
    // dashboard 5건 같은 데이터 불일치 = 데이터 아키텍처 결함.
    // 신규: KPI '메시지' / '사용 모델'은 KV summary 우선 (모든 디바이스 합산),
    //       '일평균'은 KV 메시지 / 명목 period 일수 (PM-46: 분모/분자 일관).
    //       sub 라벨에 데이터 출처 명시 — 사용자가 어떤 디바이스 기준인지 인지.
    //       PM-46: 대화 카드 제거 — chats는 chatId 기반(이 디바이스만 한정) + 사용자
    //       관심도 낮음.
    const models = new Set(filtered.map((r) => r.model).filter(Boolean));
    const recordsOldestTs = records.length > 0
      ? Math.min(...records.map((r) => r.timestamp))
      : null;

    // [2026-05-05 PM-46 Roy] KV 매핑:
    //   today      → KV에 today 버킷 없음 → records (이 디바이스만).
    //   yesterday  → KV.yesterday(달력 어제)로 KPI 카드 표시. 필터는 rolling 24~48h라
    //                완전 일치 X 이지만 ±수시간 차이로 사용자 인지 가능 범위. records-only
    //                fallback은 이 디바이스 한정이라 사용 적은 사용자에 "데이터 없음" 빈
    //                화면 → KV가 더 풍부.
    //   week/month → KV 동명 버킷.
    //   year/all   → KV.all (year 별도 버킷 없으므로 all로 fallback).
    const kvForPeriod = kvSummary
      ? (period === 'today'     ? null
      :  period === 'yesterday' ? kvSummary.yesterday
      :  period === 'week'      ? kvSummary.week
      :  period === 'month'     ? kvSummary.month
      :  /* year/all */           kvSummary.all)
      : null;
    const kvProviderRecord = (kvForPeriod && 'providers' in kvForPeriod) ? kvForPeriod.providers : undefined;
    const kvProviders = kvProviderRecord ? Object.keys(kvProviderRecord).length : null;

    // [2026-05-05 PM-46 Roy] 메시지 카드 vs AI 회사별 사용 분포 카드 숫자 불일치 회귀 fix.
    // 원인: KV 워커 incr()이 read-modify-write라 race lost update 발생 → 같은 trackUsage
    // 호출에서 total:requests와 provider:{p}:requests가 독립적으로 ±drift. 예: 171 vs 165.
    // 같은 KV 인프라 한계라 워커 단에서 atomic 보장 어려움(Durable Objects 도입 시 가능).
    // UI 단 해결: messages KPI를 Σprovider.requests로 통일 → 자동으로 분포 카드 합과 일치.
    // total:requests는 providers 비어있을 때 fallback으로만 사용.
    const kvProvidersSum = kvProviderRecord
      ? Object.values(kvProviderRecord).reduce((s, p) => s + (p as { requests: number }).requests, 0)
      : 0;
    const kvMessages = kvProvidersSum > 0
      ? kvProvidersSum
      : (kvForPeriod?.totalRequests ?? null);

    const messages = kvMessages !== null ? kvMessages : filtered.length;
    const days = periodDayCount(period, recordsOldestTs);
    return {
      messages,
      modelsUsed: kvProviders !== null ? kvProviders : models.size,
      dailyAvg: days > 0 ? Math.round((messages / days) * 10) / 10 : 0,
      periodDays: days,
      hasKv: kvMessages !== null,
    };
  }, [filtered, kvSummary, period, records]);

  // 7×24 heatmap
  const heatmap = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    let max = 0;
    for (const r of filtered) {
      const d = new Date(r.timestamp);
      const wd = d.getDay();
      const hr = d.getHours();
      grid[wd][hr]++;
      if (grid[wd][hr] > max) max = grid[wd][hr];
    }
    return { grid, max };
  }, [filtered]);

  // [2026-05-05 PM-44 Roy] AI 회사별 사용 분포 — KV providers (모든 디바이스 합산) 우선.
  // 이전엔 records (이 디바이스 4건만)로 집계 → 메시지 카드 171건과 모순. 데이터 일관성
  // 위반. 이제 KV providers count를 사용해 메시지 카드 합과 정확히 일치.
  // [2026-05-05 PM-46 Roy] fromKv 플래그 반환 → UI 단에서 제목/footer 조건 일관 처리.
  // 이전엔 stats.hasKv 글로벌 체크가 yesterday/today에서도 true라(totalRequests는 있음)
  // KV provider 분포 ≠ records 분포인데도 "AI 회사별 사용 분포 — 메시지 카드 합과 일치"
  // 잘못된 제목/footer 노출. fromKv로 분기.
  const topModels = useMemo<{ items: { id: string; count: number }[]; fromKv: boolean }>(() => {
    const kvForPeriod = kvSummary
      ? (period === 'today'     ? null
      :  period === 'yesterday' ? null  // KV.yesterday엔 providers 필드 없음
      :  period === 'week'      ? kvSummary.week
      :  period === 'month'     ? kvSummary.month
      :  /* year/all */           kvSummary.all)
      : null;
    const kvProviderRecord = (kvForPeriod && 'providers' in kvForPeriod) ? kvForPeriod.providers : undefined;
    if (kvProviderRecord && Object.keys(kvProviderRecord).length > 0) {
      const items = Object.entries(kvProviderRecord)
        .map(([provider, v]) => ({ id: provider, count: (v as { requests: number }).requests }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      return { items, fromKv: true };
    }
    // KV 없으면 records 기반 모델별 (이 디바이스만)
    const counts: Record<string, number> = {};
    for (const r of filtered) counts[r.model] = (counts[r.model] || 0) + 1;
    const items = Object.entries(counts)
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    return { items, fromKv: false };
  }, [filtered, kvSummary, period]);

  // [2026-05-05 PM-44 Roy] 카테고리 분석 (창작/일반/코딩 등)은 records 기반 — KV에 카테고리 없음.
  // 데이터 일관성을 위해: records 카운트가 메시지 카드 (KV 합산)와 너무 차이나면
  // 표시 안 함 (사용자 혼란 차단). records.length / messages 비율 < 30%면 숨김.
  const categories = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of filtered) {
      const c = categoryOfModel(r.model);
      counts[c] = (counts[c] || 0) + 1;
    }
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, [, n]) => s + n, 0);
    return { entries, total };
  }, [filtered]);

  // [2026-05-05 PM-46 Roy] empty 판정 = records AND KV 둘 다 없을 때만.
  // 이전엔 records만 보고 판단 → KV에 데이터 있는 어제/이번주에도 "아직 사용 기록이
  // 없어요" 빈 화면 표시되던 회귀. 이제 KPI는 KV로 표시하고 패턴 분석만 records 기반
  // 영역에서 자동 숨김.
  const isEmpty = filtered.length === 0 && stats.messages === 0;

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ background: tokens.bg, color: tokens.text, fontFamily: lang === 'ko' ? 'Pretendard, sans-serif' : 'Geist, sans-serif' }}
    >
      <div className="mx-auto w-full max-w-3xl px-6 py-12 md:py-16">

        <header className="mb-8">
          <h1 className="text-[32px] md:text-[40px] font-medium leading-[1.15] tracking-tight">
            {t.title}
          </h1>
          <p className="mt-3 text-[15px]" style={{ color: tokens.textDim }}>
            {t.subtitle}
          </p>
        </header>

        {/* Period chips */}
        <div className="mb-8 flex flex-wrap gap-2">
          {(['today', 'yesterday', 'week', 'month', 'year', 'all'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className="rounded-full px-3.5 py-1.5 text-[13px] transition-colors"
              style={{
                background: period === p ? tokens.accent : 'transparent',
                color: period === p ? '#fff' : tokens.textDim,
                border: period === p ? 'none' : `1px solid ${tokens.borderStrong}`,
              }}
            >
              {t.periods[p]}
            </button>
          ))}
        </div>

        {isEmpty ? (
          <div
            className="rounded-2xl border p-10 md:p-14 text-center"
            style={{ background: tokens.surface, borderColor: tokens.border }}
          >
            <div className="text-[16px]" style={{ color: tokens.text }}>{t.empty}</div>
            <div className="mt-2 text-[13px]" style={{ color: tokens.textDim }}>{t.emptyHint}</div>
          </div>
        ) : (
          <>
            {/* [2026-05-05 PM-42 Roy] 데이터 출처 명시 — 사용자가 어떤 디바이스 기준인지
                즉시 인지. KV 사용 시 "모든 디바이스 합산" / 미사용 시 "이 디바이스" 안내. */}
            <div className="mb-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px]"
                 style={{ background: tokens.surfaceAlt, color: tokens.textDim }}>
              <span aria-hidden>{stats.hasKv ? '☁' : '💻'}</span>
              <span>
                {stats.hasKv
                  ? (lang === 'ko' ? '메시지/모델 = 모든 디바이스 합산 (Cloudflare KV)'
                     : lang === 'ph' ? 'Messages/Models = lahat ng devices (KV)'
                     : 'Messages/Models = all devices combined (Cloudflare KV)')
                  : (lang === 'ko' ? '이 디바이스 기록만 (KV 미연결)'
                     : lang === 'ph' ? 'Device na ito lang (walang KV)'
                     : 'This device only (KV not connected)')}
              </span>
            </div>

            {/* [2026-05-05 PM-46 Roy] KPI 3카드 — 대화 카드 제거 (chatId는 이 디바이스만이라
                KV 메시지와 비교 불가, 사용자 혼란). 일평균은 KV 메시지 / 명목 period 일수
                로 통일 (이전: filtered/activeDays = 이 디바이스 한정 분모) → 분모/분자 일관. */}
            <div className="mb-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <KpiCard
                label={t.messages}
                value={stats.messages}
                sub={stats.hasKv
                  ? (lang === 'ko' ? `${t.periods[period]} · 모든 디바이스`
                    : lang === 'ph' ? `${t.periods[period]} · lahat ng devices`
                    : `${t.periods[period]} · all devices`)
                  : t.periods[period]}
              />
              <KpiCard
                label={t.modelsUsed}
                value={stats.modelsUsed}
                sub={stats.hasKv
                  ? (lang === 'ko' ? `${t.periods[period]} · 모든 디바이스`
                    : lang === 'ph' ? `${t.periods[period]} · lahat ng devices`
                    : `${t.periods[period]} · all devices`)
                  : t.periods[period]}
              />
              <KpiCard
                label={t.dailyAvg}
                value={stats.dailyAvg}
                sub={lang === 'ko'
                  ? `${stats.messages}건 ÷ ${stats.periodDays}일`
                  : lang === 'ph'
                  ? `${stats.messages} msgs ÷ ${stats.periodDays}d`
                  : `${stats.messages} msgs ÷ ${stats.periodDays}d`}
              />
            </div>

            {/* [PM-42] 패턴 분석 카드 (heatmap/top models/categories)는 records 기반 — KV에 분포 없음.
                [2026-05-05 PM-46 Roy] filtered.length > 0 가드 — 어제처럼 이 디바이스에
                records 0건일 때 패턴 분석 영역 자체를 숨김. 빈 그리드/도넛 회피. */}
            {filtered.length > 0 && (
              <>
                <p className="mb-3 text-[11.5px]" style={{ color: tokens.textFaint }}>
                  {lang === 'ko' ? '* 아래 패턴 분석은 이 디바이스 기록만 (KV에 시간/모델별 분포 없음)'
                    : lang === 'ph' ? '* Pattern analysis sa baba — device na ito lang'
                    : '* Pattern analysis below — this device only'}
                </p>

                {/* Heatmap */}
                <Card title={t.whenLabel}>
                  <Heatmap grid={heatmap.grid} max={heatmap.max} weekdayLabels={t.weekdays} />
              {/* [2026-05-05 PM-46 Roy] sparse-data 안내 — records가 KV 총합 대비
                  현저히 적으면 "과거 메시지는 추적 누락됨" 명시. PM-46 이전 chat-api는
                  usage 데이터 없는 provider(Gemini stream 등) 메시지를 skip → records가
                  비어 히트맵 거의 빈 그리드. 신규 메시지부터 정상 기록됨을 안내. */}
              {stats.hasKv && stats.messages >= 10 && filtered.length < stats.messages * 0.3 && (
                <p className="mt-3 text-[11px]" style={{ color: tokens.textFaint }}>
                  {lang === 'ko'
                    ? `* 이 디바이스에 ${filtered.length}건 / 전체 ${stats.messages}건. 과거 메시지 일부는 시간대 분포 추적 누락(PM-46 이전 회귀). 신규 메시지부터 정확히 기록됩니다.`
                    : lang === 'ph'
                    ? `* ${filtered.length} / ${stats.messages} sa device na ito. Ilang lumang mensahe walang time data — magsisimula ang tamang tracking sa bagong messages.`
                    : `* ${filtered.length} of ${stats.messages} on this device. Some past messages lack time data (pre-PM-46 regression). Future messages tracked correctly.`}
                </p>
              )}
            </Card>

            {/* [2026-05-05 PM-44/46 Roy] AI 회사별 사용 분포 — fromKv 분기.
                fromKv=true: 모든 디바이스 합산 + 메시지 KPI(=Σproviders)와 정확히 일치.
                fromKv=false: 이 디바이스 records 기반 모델별 (이전 동작). */}
            {topModels.items.length > 0 && (
              <Card title={
                topModels.fromKv
                  ? (lang === 'ko' ? 'AI 회사별 사용 분포'
                    : lang === 'ph' ? 'Sa AI company sukat'
                    : 'Usage by provider')
                  : t.topModels
              }>
                <ul className="space-y-2.5">
                  {topModels.items.map(({ id, count }) => {
                    const total = topModels.items.reduce((s, m) => s + m.count, 0);
                    const pct = total > 0 ? (count / total) * 100 : 0;
                    const color = BRAND_COLORS[topModels.fromKv ? id : modelProvider(id)] || tokens.accent;
                    const displayName = topModels.fromKv ? id : modelDisplayName(id);
                    return (
                      <li key={id}>
                        <div className="flex items-baseline justify-between text-[13px] mb-1">
                          <span style={{ color: tokens.text }}>{displayName}</span>
                          <span style={{ color: tokens.textDim }}>{count} · {pct.toFixed(0)}%</span>
                        </div>
                        <div className="h-1.5 rounded-full" style={{ background: tokens.surfaceAlt }}>
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {topModels.fromKv && (
                  <p className="mt-3 text-[11px]" style={{ color: tokens.textFaint }}>
                    {lang === 'ko' ? '* 모든 디바이스 합산 (Cloudflare KV) — 메시지 카드 합과 일치.'
                      : lang === 'ph' ? '* Lahat ng devices (Cloudflare KV) — tugma sa Messages card.'
                      : '* All devices (Cloudflare KV) — matches Messages card total.'}
                  </p>
                )}
              </Card>
            )}

            {/* [PM-44] 카테고리 분포 — records 기반. 메시지 카드 합과 차이 크면 사용자 혼란
                방지 위해 records 비율 명시. records.length / messages 비율 표시. */}
            {categories.total > 0 && (
              <Card title={
                lang === 'ko' ? '용도별 분포 (이 디바이스)'
                : lang === 'ph' ? 'Sa kategoriya (device na ito)'
                : 'By category (this device)'
              }>
                <div className="flex flex-col md:flex-row items-center gap-6">
                  <Donut entries={categories.entries} total={categories.total} />
                  <ul className="flex-1 space-y-2">
                    {categories.entries.map(([cat, count]) => {
                      const pct = (count / categories.total) * 100;
                      const color = CATEGORY_COLORS[cat] ?? tokens.accent;
                      return (
                        <li key={cat} className="flex items-center justify-between text-[13px]">
                          <span className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                            <span style={{ color: tokens.text }}>{t.cat[cat] ?? cat}</span>
                          </span>
                          <span style={{ color: tokens.textDim }}>
                            {count} · {pct.toFixed(0)}%
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                {/* [PM-44] 데이터 일관성 — categories.total은 records (이 디바이스) 합.
                    메시지 카드 (KV 합산)과 차이 명시 → 사용자 혼란 차단. */}
                {stats.hasKv && stats.messages !== categories.total && (
                  <p className="mt-3 text-[11px]" style={{ color: tokens.textFaint }}>
                    {lang === 'ko'
                      ? `* 이 디바이스 ${categories.total}건 분석. 전체 메시지 ${stats.messages}건 중 분류는 이 디바이스 기록만 가능 (KV에 카테고리 메타 없음).`
                      : lang === 'ph'
                      ? `* ${categories.total} mga record sa device na ito. Sa ${stats.messages} mensahe sa lahat — kategoriya ng device na ito lang.`
                      : `* ${categories.total} records on this device. Of ${stats.messages} total messages — categories from this device only (KV lacks category meta).`}
                  </p>
                )}
              </Card>
            )}
              </>
            )}
            {/* [2026-05-05 PM-46 Roy] filtered 비어있을 때 패턴 분석 자리에 안내 노트.
                KV에는 데이터 있어도 이 디바이스에 records 0건이면 시간대/모델 분포 표시
                불가. 사용자가 "왜 KPI는 있는데 그래프는 비었지?" 헷갈리지 않게 명시. */}
            {filtered.length === 0 && stats.messages > 0 && (
              <p className="mb-3 text-[12px]" style={{ color: tokens.textFaint }}>
                {lang === 'ko'
                  ? `* 이 기간에 이 디바이스 활동 기록 없음 — 시간대/모델 분포 표시 불가 (다른 디바이스 사용 분량은 위 KPI에 반영됨).`
                  : lang === 'ph'
                  ? `* Walang aktibidad sa device na ito sa panahong ito — walang time/model graph (KPI sa itaas mula sa ibang devices).`
                  : `* No activity from this device in this period — time/model distribution unavailable (other devices' usage shown in KPI above).`}
              </p>
            )}
          </>
        )}

      </div>
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="mb-4 rounded-2xl border p-6 md:p-8"
      style={{ background: tokens.surface, borderColor: tokens.border }}
    >
      <div className="mb-4 text-[13px]" style={{ color: tokens.textDim }}>{title}</div>
      {children}
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div
      className="rounded-2xl border p-4 md:p-5"
      style={{ background: tokens.surface, borderColor: tokens.border }}
    >
      <div className="text-[12px]" style={{ color: tokens.textDim }}>{label}</div>
      <div className="mt-1.5 text-[28px] md:text-[32px] font-medium leading-none tracking-tight">
        {value}
      </div>
      <div className="mt-2 text-[11px]" style={{ color: tokens.textFaint }}>{sub}</div>
    </div>
  );
}

function Heatmap({
  grid, max, weekdayLabels,
}: {
  grid: number[][];
  max: number;
  weekdayLabels: readonly string[];
}) {
  const cell = 14;  // px
  const gap  = 2;
  const labelW = 22;
  const W = labelW + 24 * (cell + gap);
  const H = 7 * (cell + gap);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + 14}`} width={W} height={H + 14}>
        {weekdayLabels.map((w, wd) => (
          <text
            key={w}
            x={0}
            y={wd * (cell + gap) + cell - 2}
            fontSize={10}
            fill={tokens.textFaint}
          >
            {w}
          </text>
        ))}
        {grid.map((row, wd) =>
          row.map((count, hr) => {
            const x = labelW + hr * (cell + gap);
            const y = wd * (cell + gap);
            // [2026-05-05 PM-46 Roy] sqrt scaling + min 0.22 — 카운트 분산 클 때 시인성 보장.
            // 이전: linear count/max + min 0.06 → max=100, count=1이면 opacity=0.06 (거의
            // 보이지 않음). sqrt 변환으로 작은 값도 visible 하게. min 0.22로 zero 셀(0.05)
            // 와 명확히 구분.
            const ratio = max > 0 ? count / max : 0;
            const opacity = count > 0 ? Math.max(0.22, Math.sqrt(ratio)) : 0;
            return (
              <rect
                key={`${wd}-${hr}`}
                x={x}
                y={y}
                width={cell}
                height={cell}
                rx={2}
                fill={tokens.accent}
                fillOpacity={count > 0 ? opacity : 0.05}
              >
                <title>{`${weekdayLabels[wd]} ${hr}:00 — ${count}`}</title>
              </rect>
            );
          })
        )}
        {[0, 6, 12, 18].map((h) => (
          <text
            key={h}
            x={labelW + h * (cell + gap)}
            y={H + 10}
            fontSize={9}
            fill={tokens.textFaint}
          >
            {String(h).padStart(2, '0')}
          </text>
        ))}
      </svg>
    </div>
  );
}

function Donut({
  entries, total,
}: {
  entries: [string, number][];
  total: number;
}) {
  const size = 140;
  const radius = 56;
  const stroke = 22;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={radius} fill="none" stroke={tokens.surfaceAlt} strokeWidth={stroke} />
      {entries.map(([cat, count]) => {
        const fraction = count / total;
        const dash = fraction * circumference;
        const color = CATEGORY_COLORS[cat] ?? tokens.accent;
        const el = (
          <circle
            key={cat}
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        );
        offset += dash;
        return el;
      })}
      <text
        x={cx}
        y={cy + 4}
        textAnchor="middle"
        fontSize={14}
        fill={tokens.text}
      >
        {total}
      </text>
    </svg>
  );
}
