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
type Period = 'week' | 'month' | 'year' | 'all';

// ── Copy ─────────────────────────────────────────────────────────
const copy = {
  ko: {
    title:        '대시보드',
    subtitle:     '당신이 AI를 어떻게 쓰는지 한눈에.',
    periods:      { week: '이번 주', month: '이번 달', year: '올해', all: '전체' } as Record<Period, string>,
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
    periods:      { week: 'This week', month: 'This month', year: 'This year', all: 'All time' } as Record<Period, string>,
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
function periodCutoff(p: Period): number {
  const now = new Date();
  if (p === 'week')  { const d = new Date(now); d.setDate(d.getDate() - 7);    return d.getTime(); }
  if (p === 'month') return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  if (p === 'year')  return new Date(now.getFullYear(), 0, 1).getTime();
  return 0;
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
    // [PM-42] KV 통합 fetch — billing-view와 동일 endpoint, 일관성 보장.
    const counterUrl = process.env.NEXT_PUBLIC_BLEND_COUNTER_URL;
    if (counterUrl) {
      fetch(`${counterUrl}/usage-summary`)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => { if (data) setKvSummary(data); })
        .catch(() => {});
    }
  }, [loadFromStorage]);

  const [period, setPeriod] = useState<Period>('month');

  const filtered = useMemo(() => {
    const cutoff = periodCutoff(period);
    return records.filter((r) => r.timestamp >= cutoff);
  }, [records, period]);

  const stats = useMemo(() => {
    // [2026-05-05 PM-42 Roy] 단일 데이터 통합 — 비용 절감 메뉴와 일치하는 KV 합산 사용.
    // 이전: 모든 KPI가 records (이 디바이스 localStorage)만 사용 → 비용 절감 233건인데
    // dashboard 5건 같은 데이터 불일치 = 데이터 아키텍처 결함.
    // 신규: KPI '메시지' / '사용 모델'은 KV summary 우선 (모든 디바이스 합산),
    //       '대화' / 일평균은 records (KV에 chat 단위 / day 단위 분포 없음, 이 디바이스).
    //       sub 라벨에 데이터 출처 명시 — 사용자가 어떤 디바이스 기준인지 인지.
    const chats = new Set(filtered.map((r) => r.chatId).filter(Boolean));
    const models = new Set(filtered.map((r) => r.model).filter(Boolean));
    const activeDays = new Set(filtered.map((r) => new Date(r.timestamp).toDateString()));
    const activeDayCount = activeDays.size;

    // KV summary에서 period 매칭 — 'year'은 KV month 누적 가까움, 정확 없으면 'all' fallback.
    const kvForPeriod = kvSummary
      ? (period === 'week'   ? kvSummary.week
      :  period === 'month'  ? kvSummary.month
      :  /* year/all */        kvSummary.all)
      : null;
    const kvMessages = kvForPeriod?.totalRequests ?? null;
    const kvProviderRecord = (kvForPeriod && 'providers' in kvForPeriod) ? kvForPeriod.providers : undefined;
    const kvProviders = kvProviderRecord ? Object.keys(kvProviderRecord).length : null;

    return {
      chats: chats.size,
      messages: kvMessages !== null ? kvMessages : filtered.length,
      modelsUsed: kvProviders !== null ? kvProviders : models.size,
      dailyAvg: activeDayCount > 0
        ? Math.round((filtered.length / activeDayCount) * 10) / 10
        : 0,
      activeDayCount,
      hasKv: kvMessages !== null,
    };
  }, [filtered, kvSummary, period]);

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

  const topModels = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of filtered) counts[r.model] = (counts[r.model] || 0) + 1;
    return Object.entries(counts)
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [filtered]);

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

  const isEmpty = filtered.length === 0;

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
          {(['week', 'month', 'year', 'all'] as Period[]).map((p) => (
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

            {/* KPI cards */}
            <div className="mb-8 grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* [PM-40] dailyAvg sub 라벨 — 명목 period 대신 실제 활동일 표시.
                  [PM-42] messages/modelsUsed는 KV 합산, chats/dailyAvg는 records (이 디바이스). */}
              <KpiCard
                label={t.chats}
                value={stats.chats}
                sub={lang === 'ko' ? `${t.periods[period]} · 이 디바이스`
                  : lang === 'ph' ? `${t.periods[period]} · device na ito`
                  : `${t.periods[period]} · this device`}
              />
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
                  ? `${stats.activeDayCount}일 활동 · 이 디바이스`
                  : lang === 'ph'
                  ? `${stats.activeDayCount} active days · device na ito`
                  : `${stats.activeDayCount} active days · this device`}
              />
            </div>

            {/* [PM-42] 패턴 분석 카드 (heatmap/top models/categories)는 records 기반 — KV에 분포 없음.
                작은 안내 라벨 추가. */}
            <p className="mb-3 text-[11.5px]" style={{ color: tokens.textFaint }}>
              {lang === 'ko' ? '* 아래 패턴 분석은 이 디바이스 기록만 (KV에 시간/모델별 분포 없음)'
                : lang === 'ph' ? '* Pattern analysis sa baba — device na ito lang'
                : '* Pattern analysis below — this device only'}
            </p>

            {/* Heatmap */}
            <Card title={t.whenLabel}>
              <Heatmap grid={heatmap.grid} max={heatmap.max} weekdayLabels={t.weekdays} />
            </Card>

            {/* Top models */}
            {topModels.length > 0 && (
              <Card title={t.topModels}>
                <ul className="space-y-2.5">
                  {topModels.map(({ id, count }) => {
                    const max = topModels[0].count;
                    const pct = max > 0 ? (count / max) * 100 : 0;
                    const color = BRAND_COLORS[modelProvider(id)] || tokens.accent;
                    return (
                      <li key={id}>
                        <div className="flex items-baseline justify-between text-[13px] mb-1">
                          <span style={{ color: tokens.text }}>{modelDisplayName(id)}</span>
                          <span style={{ color: tokens.textDim }}>{count}</span>
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

            {/* Categories donut */}
            {categories.total > 0 && (
              <Card title={t.categories}>
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
            const opacity = max > 0 ? Math.max(0.06, count / max) : 0;
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
