'use client';

/**
 * D1BillingView — Design1 Billing view
 * "이번 달 얼마 썼나?" — 사용량 관리, 한도 설정. 이성적·관리적.
 *
 * Self-contained. 누적 절약은 CostSavings(별도 페이지)로 분리됨.
 */

import { useEffect, useMemo, useState } from 'react';
import { useUsageStore } from '@/stores/usage-store';

// ── Design tokens (same as chat-view-design1) ───────────────────
const tokens = {
  bg:           '#fafaf9',
  surface:      '#ffffff',
  surfaceAlt:   '#f6f5f3',
  text:         '#0a0a0a',
  textDim:      '#6b6862',
  textFaint:    '#a8a49b',
  accent:       '#c65a3c',
  accentSoft:   'rgba(198, 90, 60, 0.08)',
  border:       'rgba(10, 10, 10, 0.06)',
  borderStrong: 'rgba(10, 10, 10, 0.12)',
} as const;

const BRAND_COLORS: Record<string, string> = {
  openai:    '#10a37f',
  anthropic: '#d97757',
  google:    '#4285f4',
  deepseek:  '#4B5EFC',
  groq:      '#f55036',
};

// ── Constants ────────────────────────────────────────────────────
const KRW_PER_USD = 1370;

// 구독 비교 (USD/월) — 한국 기준 표시 가격
const SUBSCRIPTIONS = [
  { id: 'chatgpt',  ko: 'ChatGPT Plus',     en: 'ChatGPT Plus',    usd: 20 },
  { id: 'claude',   ko: 'Claude Pro',       en: 'Claude Pro',      usd: 20 },
  { id: 'gemini',   ko: 'Gemini Advanced',  en: 'Gemini Advanced', usd: 20 },
] as const;

const SUB_TOTAL_USD = SUBSCRIPTIONS.reduce((s, x) => s + x.usd, 0); // 60

const LIMIT_STORAGE_KEY = 'd1:billing-limit';

type SpendingLimit = {
  dailyUsd: number;     // 0 = disabled. Internal storage in USD.
  monthlyUsd: number;   // 0 = disabled
  notify80: boolean;
  autoStop: boolean;
};

const DEFAULT_LIMIT: SpendingLimit = {
  dailyUsd: 2,          // $2/day 기본값 (KO: ≈ ₩2,740)
  monthlyUsd: 0,
  notify80: true,
  autoStop: false,
};

// ── Copy ─────────────────────────────────────────────────────────
const copy = {
  ko: {
    head:          '모든 AI를 하나의 키로.',
    sub:           '하나로, 더 싸게, 더 스마트하게.',
    thisMonth:     '이번 달',
    spent:         '사용',
    ifSubscribed:  '구독 시',
    sumLabel:      '합계',
    diffLabel:     '차이',
    last30:        '최근 30일',
    breakdown:     '모델별 사용',
    dailyAvg:      '일평균',
    highestDay:    '가장 많이 쓴 날',
    spendingLimit: '비용 한도',
    dailyLimit:    '일일 한도',
    monthlyLimit:  '월간 한도',
    notSet:        '없음',
    set:           '설정',
    cancel:        '취소',
    save:          '저장',
    notify80:      '한도 80% 도달 시 알림',
    autoStop:      '한도 초과 시 자동 정지',
    empty:         '아직 사용 기록이 없어요.',
    emptyHint:     '채팅을 시작하면 이곳에 사용량이 쌓입니다.',
    today:         '오늘',
  },
  en: {
    head:          'Every AI, with one key.',
    sub:           'One AI app — cheaper and smarter.',
    thisMonth:     'This month',
    spent:         'spent',
    ifSubscribed:  'If subscribed',
    sumLabel:      'Total',
    diffLabel:     'Difference',
    last30:        'Last 30 days',
    breakdown:     'By model',
    dailyAvg:      'Daily average',
    highestDay:    'Highest day',
    spendingLimit: 'Spending limit',
    dailyLimit:    'Daily limit',
    monthlyLimit:  'Monthly limit',
    notSet:        'None',
    set:           'Set',
    cancel:        'Cancel',
    save:          'Save',
    notify80:      'Notify at 80%',
    autoStop:      'Auto-stop when exceeded',
    empty:         'No usage yet.',
    emptyHint:     'Once you start chatting, your usage will appear here.',
    today:         'Today',
  },
} as const;

// ── Format helpers ───────────────────────────────────────────────
function fmtKrw(usd: number): string {
  const krw = Math.round(usd * KRW_PER_USD);
  if (krw === 0) return '₩0';
  if (krw < 1) return '<₩1';
  return `₩${krw.toLocaleString('ko-KR')}`;
}

function fmtUsd(usd: number): string {
  if (usd === 0) return '$0';
  if (usd < 0.01) return '<$0.01';
  if (usd < 1) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(2)}`;
}

function fmtMoney(usd: number, lang: 'ko' | 'en'): string {
  return lang === 'ko' ? fmtKrw(usd) : fmtUsd(usd);
}

function providerOf(modelId: string): string {
  const id = modelId.toLowerCase();
  if (id.startsWith('gpt') || id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4') || id.includes('openai')) return 'openai';
  if (id.startsWith('claude')) return 'anthropic';
  if (id.startsWith('gemini')) return 'google';
  if (id.startsWith('deepseek')) return 'deepseek';
  if (id.includes('llama') || id.includes('mixtral') || id.includes('groq')) return 'groq';
  return 'openai';
}

function shortDateLabel(iso: string, lang: 'ko' | 'en'): string {
  const d = new Date(iso + 'T00:00:00');
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return lang === 'ko' ? `${m}월 ${day}일` : `${m}/${day}`;
}

// ── SVG line chart ───────────────────────────────────────────────
function SVGLineChart({
  data,
  lang,
}: {
  data: { date: string; cost: number }[];
  lang: 'ko' | 'en';
}) {
  const W = 600;
  const H = 180;
  const PAD = { top: 16, right: 16, bottom: 28, left: 16 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const max = Math.max(...data.map((d) => d.cost), 0.0001);
  const xStep = data.length > 1 ? chartW / (data.length - 1) : 0;

  const points = data.map((d, i) => {
    const x = PAD.left + i * xStep;
    const y = PAD.top + chartH - (d.cost / max) * chartH;
    return { x, y, ...d };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${PAD.left + (data.length - 1) * xStep} ${PAD.top + chartH} L ${PAD.left} ${PAD.top + chartH} Z`;

  const firstLabel = data[0] && shortDateLabel(data[0].date, lang);
  const lastLabel  = data.length > 0 && shortDateLabel(data[data.length - 1].date, lang);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
      <path d={areaPath} fill={tokens.accentSoft} />
      <path d={linePath} stroke={tokens.accent} strokeWidth={1.5} fill="none" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={1.5} fill={tokens.accent} />
      ))}
      <text x={PAD.left} y={H - 8} fontSize={11} fill={tokens.textFaint}>{firstLabel}</text>
      <text x={W - PAD.right} y={H - 8} fontSize={11} fill={tokens.textFaint} textAnchor="end">{lastLabel}</text>
    </svg>
  );
}

// ── Main view ────────────────────────────────────────────────────
export default function D1BillingView({ lang }: { lang: 'ko' | 'en' }) {
  const t = copy[lang];

  // ── Usage data ────────────────────────────────────────────────
  const records         = useUsageStore((s) => s.records);
  const getThisMonth    = useUsageStore((s) => s.getThisMonthCost);
  const getDaily        = useUsageStore((s) => s.getCostByDay);
  const getByModel      = useUsageStore((s) => s.getCostByModel);
  const loadFromStorage = useUsageStore((s) => s.loadFromStorage);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  const monthCostUsd  = getThisMonth();
  const dailyHistory  = useMemo(() => getDaily(30), [records, getDaily]);
  const byModel       = useMemo(() => getByModel(), [records, getByModel]);

  const dailyAvgUsd = dailyHistory.length > 0
    ? dailyHistory.reduce((s, d) => s + d.cost, 0) / dailyHistory.length
    : 0;

  const highestDay = useMemo(() => {
    let best: { date: string; cost: number } | null = null;
    for (const d of dailyHistory) {
      if (!best || d.cost > best.cost) best = d;
    }
    return best && best.cost > 0 ? best : null;
  }, [dailyHistory]);

  const modelEntries = useMemo(() => {
    const arr = Object.entries(byModel)
      .map(([model, usd]) => ({ model, usd }))
      .sort((a, b) => b.usd - a.usd);
    const total = arr.reduce((s, x) => s + x.usd, 0);
    return { items: arr.slice(0, 5), total };
  }, [byModel]);

  const subTotalDisplay = lang === 'ko' ? SUB_TOTAL_USD * KRW_PER_USD : SUB_TOTAL_USD;
  const monthDisplay    = lang === 'ko' ? monthCostUsd * KRW_PER_USD : monthCostUsd;
  const diffUsd         = SUB_TOTAL_USD - monthCostUsd;
  const hasUsage        = records.length > 0 && monthCostUsd > 0;

  // ── Spending limit (localStorage) ────────────────────────────
  const [limit, setLimit] = useState<SpendingLimit>(DEFAULT_LIMIT);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(LIMIT_STORAGE_KEY);
      if (raw) setLimit({ ...DEFAULT_LIMIT, ...JSON.parse(raw) });
    } catch {}
  }, []);

  function saveLimit(next: SpendingLimit) {
    setLimit(next);
    try { localStorage.setItem(LIMIT_STORAGE_KEY, JSON.stringify(next)); } catch {}
  }

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ background: tokens.bg, color: tokens.text, fontFamily: lang === 'ko' ? 'Pretendard, sans-serif' : 'Geist, sans-serif' }}
    >
      <div className="mx-auto w-full max-w-3xl px-6 py-12 md:py-16">

        {/* ══ Hero ══ */}
        <header className="mb-12 md:mb-16">
          <h1
            className="text-[32px] md:text-[40px] font-medium leading-[1.15] tracking-tight"
            style={{ color: tokens.text }}
          >
            {t.head}
          </h1>
          <p
            className="mt-3 text-[15px] md:text-[16px]"
            style={{ color: tokens.textDim }}
          >
            {t.sub}
          </p>
        </header>

        {!hasUsage ? (
          <EmptyState lang={lang} />
        ) : (
          <>
            {/* ══ Section 1 — Usage summary ══ */}
            <section className="mb-12">
              <div
                className="rounded-2xl border p-8 md:p-10"
                style={{ background: tokens.surface, borderColor: tokens.border }}
              >
                <div className="mb-6 text-[13px]" style={{ color: tokens.textDim }}>
                  {t.thisMonth}
                </div>

                <div className="flex items-baseline gap-3">
                  <span
                    className="text-[40px] md:text-[56px] font-medium leading-none tracking-tight"
                    style={{ color: tokens.text }}
                  >
                    {fmtMoney(monthCostUsd, lang)}
                  </span>
                  <span className="text-[14px]" style={{ color: tokens.textDim }}>
                    {t.spent}
                  </span>
                </div>

                <div className="mt-10 mb-4 text-[13px]" style={{ color: tokens.textFaint }}>
                  ── {t.ifSubscribed} ──
                </div>

                <ul className="space-y-2.5">
                  {SUBSCRIPTIONS.map((s) => (
                    <li key={s.id} className="flex items-center justify-between text-[14px]">
                      <span style={{ color: tokens.textDim }}>{lang === 'ko' ? s.ko : s.en}</span>
                      <span style={{ color: tokens.text }}>
                        {fmtMoney(s.usd, lang)}
                      </span>
                    </li>
                  ))}
                </ul>

                <div
                  className="mt-4 flex items-center justify-between border-t pt-4 text-[14px]"
                  style={{ borderColor: tokens.border }}
                >
                  <span style={{ color: tokens.textDim }}>{t.sumLabel}</span>
                  <span style={{ color: tokens.text }}>{fmtMoney(SUB_TOTAL_USD, lang)}</span>
                </div>

                <div className="mt-6 flex items-center justify-between">
                  <span className="text-[13px]" style={{ color: tokens.textDim }}>
                    {t.diffLabel}
                  </span>
                  <span
                    className="text-[18px] font-medium"
                    style={{ color: tokens.accent }}
                  >
                    {fmtMoney(Math.max(diffUsd, 0), lang)}
                  </span>
                </div>
              </div>
            </section>

            {/* ══ Section 2 — Trends ══ */}
            <section className="mb-12">
              <div
                className="rounded-2xl border p-6 md:p-8"
                style={{ background: tokens.surface, borderColor: tokens.border }}
              >
                <div className="mb-4 text-[13px]" style={{ color: tokens.textDim }}>
                  {t.last30}
                </div>
                <SVGLineChart data={dailyHistory} lang={lang} />
              </div>

              {modelEntries.items.length > 0 && (
                <div
                  className="mt-4 rounded-2xl border p-6 md:p-8"
                  style={{ background: tokens.surface, borderColor: tokens.border }}
                >
                  <div className="mb-4 text-[13px]" style={{ color: tokens.textDim }}>
                    {t.breakdown}
                  </div>
                  <ul className="space-y-3">
                    {modelEntries.items.map(({ model, usd }) => {
                      const pct = modelEntries.total > 0 ? (usd / modelEntries.total) * 100 : 0;
                      const color = BRAND_COLORS[providerOf(model)] || tokens.accent;
                      return (
                        <li key={model}>
                          <div className="flex items-center justify-between text-[13px] mb-1.5">
                            <span style={{ color: tokens.text }}>{model}</span>
                            <span style={{ color: tokens.textDim }}>
                              {fmtMoney(usd, lang)} · {pct.toFixed(0)}%
                            </span>
                          </div>
                          <div
                            className="h-1.5 rounded-full overflow-hidden"
                            style={{ background: tokens.surfaceAlt }}
                          >
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, background: color }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div
                  className="rounded-2xl border p-6"
                  style={{ background: tokens.surface, borderColor: tokens.border }}
                >
                  <div className="text-[13px]" style={{ color: tokens.textDim }}>{t.dailyAvg}</div>
                  <div className="mt-2 text-[24px] font-medium" style={{ color: tokens.text }}>
                    {fmtMoney(dailyAvgUsd, lang)}
                  </div>
                </div>
                <div
                  className="rounded-2xl border p-6"
                  style={{ background: tokens.surface, borderColor: tokens.border }}
                >
                  <div className="text-[13px]" style={{ color: tokens.textDim }}>{t.highestDay}</div>
                  <div className="mt-2 text-[24px] font-medium" style={{ color: tokens.text }}>
                    {highestDay ? fmtMoney(highestDay.cost, lang) : '—'}
                  </div>
                  {highestDay && (
                    <div className="mt-1 text-[12px]" style={{ color: tokens.textFaint }}>
                      {shortDateLabel(highestDay.date, lang)}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </>
        )}

        {/* ══ Section 3 — Spending limit (always visible) ══ */}
        <section>
          <div
            className="rounded-2xl border p-6 md:p-8"
            style={{ background: tokens.surface, borderColor: tokens.border }}
          >
            <div className="mb-6 text-[13px]" style={{ color: tokens.textDim }}>
              {t.spendingLimit}
            </div>

            <LimitRow
              label={t.dailyLimit}
              valueUsd={limit.dailyUsd}
              lang={lang}
              onSave={(v) => saveLimit({ ...limit, dailyUsd: v })}
              t={t}
            />
            <LimitRow
              label={t.monthlyLimit}
              valueUsd={limit.monthlyUsd}
              lang={lang}
              onSave={(v) => saveLimit({ ...limit, monthlyUsd: v })}
              t={t}
            />

            <div className="mt-6 space-y-3 border-t pt-6" style={{ borderColor: tokens.border }}>
              <ToggleRow
                label={t.notify80}
                checked={limit.notify80}
                onChange={(v) => saveLimit({ ...limit, notify80: v })}
              />
              <ToggleRow
                label={t.autoStop}
                checked={limit.autoStop}
                onChange={(v) => saveLimit({ ...limit, autoStop: v })}
              />
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────

function EmptyState({ lang }: { lang: 'ko' | 'en' }) {
  const t = copy[lang];
  return (
    <div
      className="rounded-2xl border p-10 md:p-14 text-center"
      style={{ background: tokens.surface, borderColor: tokens.border }}
    >
      <div className="text-[16px]" style={{ color: tokens.text }}>{t.empty}</div>
      <div className="mt-2 text-[13px]" style={{ color: tokens.textDim }}>{t.emptyHint}</div>
    </div>
  );
}

function LimitRow({
  label, valueUsd, lang, onSave, t,
}: {
  label: string;
  valueUsd: number;
  lang: 'ko' | 'en';
  onSave: (usd: number) => void;
  t: typeof copy[keyof typeof copy];
}) {
  // Display draft in user-facing currency (KO: KRW, EN: USD)
  const draftFromValue = (usd: number): string => {
    if (usd <= 0) return '';
    return lang === 'ko' ? String(Math.round(usd * KRW_PER_USD)) : String(usd);
  };

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(draftFromValue(valueUsd));

  function commit() {
    const cleaned = draft.replace(/[^\d.]/g, '');
    const n = parseFloat(cleaned);
    if (!Number.isFinite(n) || n <= 0) {
      onSave(0);
    } else {
      const usd = lang === 'ko' ? n / KRW_PER_USD : n;
      onSave(usd);
    }
    setEditing(false);
  }

  function cancel() {
    setEditing(false);
    setDraft(draftFromValue(valueUsd));
  }

  const displayLabel = valueUsd > 0
    ? (lang === 'ko'
        ? `₩${Math.round(valueUsd * KRW_PER_USD).toLocaleString('ko-KR')}`
        : `$${valueUsd.toFixed(2).replace(/\.00$/, '')}`)
    : t.notSet;

  return (
    <div
      className="flex items-center justify-between py-3 border-b last:border-0"
      style={{ borderColor: tokens.border }}
    >
      <span className="text-[14px]" style={{ color: tokens.text }}>{label}</span>
      {editing ? (
        <div className="flex items-center gap-2">
          <span className="text-[13px]" style={{ color: tokens.textDim }}>
            {lang === 'ko' ? '₩' : '$'}
          </span>
          <input
            type="text"
            inputMode={lang === 'ko' ? 'numeric' : 'decimal'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') cancel();
            }}
            autoFocus
            className="w-28 rounded-md border px-2 py-1 text-[13px] text-right outline-none focus:border-current"
            style={{ borderColor: tokens.borderStrong, color: tokens.text, background: tokens.bg }}
          />
          <button
            onClick={commit}
            className="rounded-md px-2.5 py-1 text-[12px] transition-colors"
            style={{ background: tokens.accent, color: '#fff' }}
          >
            {t.save}
          </button>
          <button
            onClick={cancel}
            className="text-[12px] transition-colors"
            style={{ color: tokens.textDim }}
          >
            {t.cancel}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="text-[14px]" style={{ color: valueUsd > 0 ? tokens.text : tokens.textFaint }}>
            {displayLabel}
          </span>
          <button
            onClick={() => { setDraft(draftFromValue(valueUsd)); setEditing(true); }}
            className="text-[12px] transition-colors hover:underline"
            style={{ color: tokens.accent }}
          >
            {t.set}
          </button>
        </div>
      )}
    </div>
  );
}

function ToggleRow({
  label, checked, onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-[14px]" style={{ color: tokens.text }}>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className="relative h-5 w-9 rounded-full transition-colors"
        style={{ background: checked ? tokens.accent : tokens.borderStrong }}
        aria-pressed={checked}
      >
        <span
          className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform"
          style={{ transform: checked ? 'translateX(18px)' : 'translateX(2px)' }}
        />
      </button>
    </label>
  );
}
