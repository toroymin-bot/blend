'use client';

/**
 * D1DashboardView — Design1 Dashboard view
 * "당신이 AI를 어떻게 쓰는지 한눈에."
 *
 * [2026-05-05 PM-46 Phase 5 Roy] WAE 전용. 모든 KPI/패턴 분석은 Cloudflare Workers
 * Analytics Engine에서 fetch. localStorage records는 cost-limit enforcement 외 사용 X.
 */

import { useEffect, useMemo, useState } from 'react';
import { AVAILABLE_MODELS } from '@/data/available-models';
import { fetchUsageSummary, fetchUsageGrid, type UsageSummary, type UsageGridCell } from '@/lib/usage-summary';

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
// [2026-05-05 PM-46 Phase 5 Roy] period → KST 날짜 범위 변환. WAE의 blob4가 KST date
// string이므로 from/to를 'YYYY-MM-DD' 형식으로 만들어 endpoint에 전달.
function kstToday(): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}
function kstDateOffset(daysAgo: number): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function periodDateRange(p: Period): { from: string; to: string } {
  const today = kstToday();
  if (p === 'today')     return { from: today, to: today };
  if (p === 'yesterday') return { from: kstDateOffset(1), to: kstDateOffset(1) };
  if (p === 'week')      return { from: kstDateOffset(6), to: today };
  if (p === 'month')     return { from: kstDateOffset(29), to: today };
  if (p === 'year')      return { from: kstDateOffset(364), to: today };
  // all: WAE 90일 자연 만료 — 90일 전부터 오늘까지로 충분
  return { from: kstDateOffset(89), to: today };
}

// 일평균 분모 = 명목 period 일수. KPI 메시지(WAE 합산)와 분모/분자 같은 소스로 통일.
function periodDayCount(p: Period): number {
  if (p === 'today' || p === 'yesterday') return 1;
  if (p === 'week')  return 7;
  if (p === 'month') return 30;
  if (p === 'year')  return 365;
  return 90; // all = WAE 보유 90일
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

  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [grid, setGrid]       = useState<UsageGridCell[]>([]);
  // [2026-05-05 PM-46 Phase 5 Roy] period 변경 시 grid도 새로 fetch (이전 records 의존
  // 제거). period에 해당하는 KST 날짜 범위로 WAE에서 일×시간 분포 가져옴.
  const [period, setPeriod] = useState<Period>('month');

  useEffect(() => {
    fetchUsageSummary().then((data) => setSummary(data));
  }, []);

  useEffect(() => {
    const { from, to } = periodDateRange(period);
    fetchUsageGrid(from, to).then((g) => setGrid(g));
  }, [period]);

  // 선택 period에 해당하는 WAE 집계.
  const periodData = useMemo(() => {
    if (!summary) return null;
    if (period === 'today') {
      // 오늘은 v2에 별도 버킷 없음 → grid에서 합산 (오늘 KST의 모든 시간 합)
      const today = kstToday();
      const todayCells = grid.filter((c) => c.date === today);
      const totalRequests = todayCells.reduce((s, c) => s + c.requests, 0);
      return totalRequests > 0 ? {
        totalCost: 0, totalRequests, totalTokens: 0,
        providers: {}, models: {},
      } : null;
    }
    if (period === 'yesterday') return summary.yesterday;
    if (period === 'week')      return summary.week;
    if (period === 'month')     return summary.month;
    return summary.all; // year/all
  }, [summary, period, grid]);

  const stats = useMemo(() => {
    const messages = periodData?.totalRequests ?? 0;
    const days = periodDayCount(period);
    const providers = periodData?.providers ?? {};
    const modelsCount = periodData?.models ? Object.keys(periodData.models).length : Object.keys(providers).length;
    return {
      messages,
      modelsUsed: modelsCount,
      dailyAvg: days > 0 ? Math.round((messages / days) * 10) / 10 : 0,
      periodDays: days,
    };
  }, [periodData, period]);

  // 7×24 heatmap — WAE grid(date×hour)를 day-of-week로 그룹.
  const heatmap = useMemo(() => {
    const out: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    let max = 0;
    for (const cell of grid) {
      const wd = new Date(cell.date + 'T00:00:00+09:00').getDay();
      const hr = parseInt(cell.hour, 10);
      if (Number.isNaN(hr) || hr < 0 || hr > 23) continue;
      out[wd][hr] += cell.requests;
      if (out[wd][hr] > max) max = out[wd][hr];
    }
    return { grid: out, max };
  }, [grid]);

  // AI 회사별 사용 분포 — providers 직접 사용 (race 없음, 메시지 KPI와 정확 일치)
  const topModels = useMemo(() => {
    const providers = periodData?.providers ?? {};
    return Object.entries(providers)
      .map(([provider, v]) => ({ id: provider, count: v.requests }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [periodData]);

  // 카테고리 분포 — period의 모델별 사용 횟수에 model→category heuristic 적용
  const categories = useMemo(() => {
    const models = periodData?.models;
    if (!models) return { entries: [] as [string, number][], total: 0 };
    const counts: Record<string, number> = {};
    for (const [modelId, v] of Object.entries(models)) {
      const c = categoryOfModel(modelId);
      counts[c] = (counts[c] || 0) + v.requests;
    }
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, [, n]) => s + n, 0);
    return { entries, total };
  }, [periodData]);

  // empty 판정 — WAE에 해당 period 메시지 0이면 빈 상태
  const isEmpty = stats.messages === 0;

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
            {/* [2026-05-05 PM-46 Phase 5 Roy] 모든 데이터 = WAE 단일 소스 (모든 디바이스 합산).
                KV 잔재 라벨 제거. 사용자에 "어디서 온 숫자인지" 단순/명확. */}
            <div className="mb-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px]"
                 style={{ background: tokens.surfaceAlt, color: tokens.textDim }}>
              <span aria-hidden>☁</span>
              <span>
                {lang === 'ko' ? '모든 디바이스 합산 (Mac · iPhone · PC)'
                  : lang === 'ph' ? 'Lahat ng devices (Mac · iPhone · PC)'
                  : 'All devices combined (Mac · iPhone · PC)'}
              </span>
            </div>

            {/* KPI 3카드 — 모두 WAE에서 가져옴, 동일 소스라 자동 일관성. */}
            <div className="mb-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <KpiCard label={t.messages}    value={stats.messages}   sub={t.periods[period]} />
              <KpiCard label={t.modelsUsed}  value={stats.modelsUsed} sub={t.periods[period]} />
              <KpiCard
                label={t.dailyAvg}
                value={stats.dailyAvg}
                sub={lang === 'ko'
                  ? `${stats.messages}건 ÷ ${stats.periodDays}일`
                  : `${stats.messages} msgs ÷ ${stats.periodDays}d`}
              />
            </div>

            {/* Heatmap — WAE grid 기반. 시간 분포가 비면 안내 표시 (period 내 활동 없음). */}
            <Card title={t.whenLabel}>
              <Heatmap grid={heatmap.grid} max={heatmap.max} weekdayLabels={t.weekdays} />
              {heatmap.max === 0 && (
                <p className="mt-3 text-[11px]" style={{ color: tokens.textFaint }}>
                  {lang === 'ko' ? '* 이 기간에 활동 없음.'
                    : lang === 'ph' ? '* Walang aktibidad sa panahong ito.'
                    : '* No activity in this period.'}
                </p>
              )}
            </Card>

            {/* AI 회사별 사용 분포 — WAE providers 직접. 메시지 KPI 합과 정확 일치. */}
            {topModels.length > 0 && (
              <Card title={
                lang === 'ko' ? 'AI 회사별 사용 분포'
                  : lang === 'ph' ? 'Sa AI company sukat'
                  : 'Usage by provider'
              }>
                <ul className="space-y-2.5">
                  {topModels.map(({ id, count }) => {
                    const total = topModels.reduce((s, m) => s + m.count, 0);
                    const pct = total > 0 ? (count / total) * 100 : 0;
                    const color = BRAND_COLORS[id] || tokens.accent;
                    return (
                      <li key={id}>
                        <div className="flex items-baseline justify-between text-[13px] mb-1">
                          <span style={{ color: tokens.text }}>{id}</span>
                          <span style={{ color: tokens.textDim }}>{count} · {pct.toFixed(0)}%</span>
                        </div>
                        <div className="h-1.5 rounded-full" style={{ background: tokens.surfaceAlt }}>
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}

            {/* 카테고리 분포 — WAE models의 모델 ID에 categoryOfModel heuristic 적용. */}
            {categories.total > 0 && (
              <Card title={
                lang === 'ko' ? '용도별 분포'
                : lang === 'ph' ? 'Sa kategoriya'
                : 'By category'
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
              </Card>
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
