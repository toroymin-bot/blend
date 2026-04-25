'use client';

/**
 * D1CostSavingsView — Design1 CostSavings view
 * "Blend 사용 후 ₩X 절약했습니다."
 *
 * Self-contained. useUsageStore.records 단일 소스 + 시작일 추론.
 */

import { useEffect, useMemo, useState } from 'react';
import { useUsageStore } from '@/stores/usage-store';
import { AVAILABLE_MODELS } from '@/data/available-models';

// ── Tokens ───────────────────────────────────────────────────────
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
const BASELINE_KEY = 'd1:savings-baseline';

type Baseline = '3services' | '5services';

const BASELINES: Record<Baseline, { usdPerMonth: number; labelKo: string; labelEn: string }> = {
  '3services': { usdPerMonth: 60, labelKo: '3개 (ChatGPT + Claude + Gemini)', labelEn: '3 services' },
  '5services': { usdPerMonth: 90, labelKo: '5개 (+ Perplexity + Midjourney)',  labelEn: '5 services' },
};

const MIN_DAYS_FOR_DATA = 7;

// ── Copy ─────────────────────────────────────────────────────────
const copy = {
  ko: {
    title:        '절약',
    heroLabel:    'Blend 사용 후',
    heroAction:   '절약했습니다',
    sinceFmt:     (d: string, n: number) => `${d}부터 (${n}일)`,
    comparison:   '비교',
    actual:       '실제 사용액',
    ifSubs:       '구독 시',
    diff:         '차이',
    comparedTo:   '비교 기준',
    changeBase:   '기준 변경 ▼',
    daily:        '일별 절약 추이',
    byModel:      '모델별 기여',
    other:        '기타',
    empty:        '아직 충분한 사용 기록이 없어요',
    emptyHint:    `${MIN_DAYS_FOR_DATA}일 이상 사용하면 절약 통계가 표시됩니다.`,
  },
  en: {
    title:        'Savings',
    heroLabel:    'Since using Blend',
    heroAction:   'saved',
    sinceFmt:     (d: string, n: number) => `Since ${d} (${n} days)`,
    comparison:   'Comparison',
    actual:       'Actual usage',
    ifSubs:       'If subscribed',
    diff:         'Difference',
    comparedTo:   'Compared to',
    changeBase:   'Change ▼',
    daily:        'Daily savings trend',
    byModel:      'By model',
    other:        'Other',
    empty:        'Not enough usage data yet',
    emptyHint:    `${MIN_DAYS_FOR_DATA}+ days of usage required for savings stats.`,
  },
} as const;

// ── Helpers ──────────────────────────────────────────────────────
function fmtKrw(usd: number): string {
  const krw = Math.round(usd * KRW_PER_USD);
  if (krw === 0) return '₩0';
  if (krw < 1)   return '<₩1';
  return `₩${krw.toLocaleString('ko-KR')}`;
}

function fmtUsd(usd: number): string {
  if (usd === 0) return '$0';
  return `$${usd.toFixed(2)}`;
}

function fmtMoney(usd: number, lang: 'ko' | 'en'): string {
  return lang === 'ko' ? fmtKrw(usd) : fmtUsd(usd);
}

function fmtDateShort(ts: number, lang: 'ko' | 'en'): string {
  const d = new Date(ts);
  if (lang === 'ko') {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function modelDisplayName(id: string): string {
  return AVAILABLE_MODELS.find((m) => m.id === id)?.displayName ?? id;
}

function modelProvider(id: string): string {
  const m = AVAILABLE_MODELS.find((x) => x.id === id);
  if (m) return m.provider;
  const lc = id.toLowerCase();
  if (lc.startsWith('claude'))   return 'anthropic';
  if (lc.startsWith('gemini') || lc.startsWith('gemma')) return 'google';
  if (lc.startsWith('deepseek')) return 'deepseek';
  if (lc.includes('llama'))      return 'groq';
  return 'openai';
}

// ── Main view ────────────────────────────────────────────────────
export default function D1CostSavingsView({ lang }: { lang: 'ko' | 'en' }) {
  const t = copy[lang];

  const records         = useUsageStore((s) => s.records);
  const loadFromStorage = useUsageStore((s) => s.loadFromStorage);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  const [baseline, setBaseline] = useState<Baseline>('3services');
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(BASELINE_KEY);
    if (stored === '3services' || stored === '5services') setBaseline(stored);
  }, []);

  function saveBaseline(b: Baseline) {
    setBaseline(b);
    setPickerOpen(false);
    try { localStorage.setItem(BASELINE_KEY, b); } catch {}
  }

  const stats = useMemo(() => {
    if (records.length === 0) return null;
    const sorted = [...records].sort((a, b) => a.timestamp - b.timestamp);
    const startTs = sorted[0].timestamp;
    const days = Math.max(1, Math.ceil((Date.now() - startTs) / 86400000));

    const actualUsd = sorted.reduce((s, r) => s + r.cost, 0);
    const subUsd    = (BASELINES[baseline].usdPerMonth / 30) * days;
    const savedUsd  = Math.max(0, subUsd - actualUsd);

    // Model breakdown — savings proportional to usage cost share
    const totalCost = actualUsd > 0 ? actualUsd : 1;
    const byModel: Record<string, number> = {};
    for (const r of sorted) byModel[r.model] = (byModel[r.model] || 0) + r.cost;
    const modelEntries = Object.entries(byModel)
      .map(([id, costShare]) => ({ id, savedUsd: (costShare / totalCost) * savedUsd, costShare }))
      .sort((a, b) => b.savedUsd - a.savedUsd);
    const top = modelEntries.slice(0, 4);
    const others = modelEntries.slice(4);
    const otherSaved = others.reduce((s, x) => s + x.savedUsd, 0);

    // Daily cumulative line
    const cumulative: { date: string; saved: number }[] = [];
    let acc = 0;
    const byDay: Record<string, number> = {};
    for (const r of sorted) {
      const d = new Date(r.timestamp);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      byDay[key] = (byDay[key] || 0) + r.cost;
    }
    const sortedKeys = Object.keys(byDay).sort();
    const subPerDay = BASELINES[baseline].usdPerMonth / 30;
    for (const k of sortedKeys) {
      const dayActual = byDay[k];
      acc += Math.max(0, subPerDay - dayActual);
      cumulative.push({ date: k, saved: acc });
    }

    return {
      startTs,
      days,
      actualUsd,
      subUsd,
      savedUsd,
      top,
      otherSaved,
      cumulative,
    };
  }, [records, baseline]);

  if (!stats || stats.days < MIN_DAYS_FOR_DATA) {
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
          </header>
          <div
            className="rounded-2xl border p-10 md:p-14 text-center"
            style={{ background: tokens.surface, borderColor: tokens.border }}
          >
            <div className="text-[16px]" style={{ color: tokens.text }}>{t.empty}</div>
            <div className="mt-2 text-[13px]" style={{ color: tokens.textDim }}>{t.emptyHint}</div>
          </div>
        </div>
      </div>
    );
  }

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
        </header>

        {/* Hero */}
        <section className="mb-10">
          <div
            className="rounded-2xl border p-8 md:p-12"
            style={{ background: tokens.surface, borderColor: tokens.border }}
          >
            <div className="text-[14px]" style={{ color: tokens.textDim }}>
              {t.heroLabel}
            </div>
            <div
              className="mt-4 text-[48px] md:text-[64px] font-medium leading-none tracking-tight"
              style={{ color: tokens.text }}
            >
              {fmtMoney(stats.savedUsd, lang)}
            </div>
            <div className="mt-3 text-[16px]" style={{ color: tokens.textDim }}>
              {t.heroAction}
            </div>
            <div className="mt-2 text-[12px]" style={{ color: tokens.textFaint }}>
              {t.sinceFmt(fmtDateShort(stats.startTs, lang), stats.days)}
            </div>
          </div>
        </section>

        {/* Comparison */}
        <section className="mb-10">
          <div
            className="rounded-2xl border p-6 md:p-8"
            style={{ background: tokens.surface, borderColor: tokens.border }}
          >
            <h2 className="mb-4 text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: tokens.textFaint }}>
              {t.comparison}
            </h2>

            <div className="space-y-2.5 text-[14px]">
              <div className="flex items-center justify-between">
                <span style={{ color: tokens.textDim }}>{t.actual}</span>
                <span style={{ color: tokens.text }}>{fmtMoney(stats.actualUsd, lang)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: tokens.textDim }}>{t.ifSubs}</span>
                <span style={{ color: tokens.text }}>{fmtMoney(stats.subUsd, lang)}</span>
              </div>
              <div className="border-t pt-2.5 flex items-center justify-between" style={{ borderColor: tokens.border }}>
                <span style={{ color: tokens.textDim }}>{t.diff}</span>
                <span className="text-[18px] font-medium" style={{ color: tokens.accent }}>
                  {fmtMoney(stats.savedUsd, lang)}
                </span>
              </div>
            </div>

            <div className="mt-5 relative text-[12px]" style={{ color: tokens.textFaint }}>
              <span>{t.comparedTo}: </span>
              <span style={{ color: tokens.textDim }}>
                {lang === 'ko' ? BASELINES[baseline].labelKo : BASELINES[baseline].labelEn}
              </span>
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                className="ml-2 transition-opacity hover:opacity-80"
                style={{ color: tokens.accent }}
              >
                {t.changeBase}
              </button>
              {pickerOpen && (
                <div
                  className="absolute left-0 mt-2 z-10 min-w-[280px] rounded-lg border p-1 shadow-md"
                  style={{ background: tokens.surface, borderColor: tokens.borderStrong }}
                >
                  {(['3services', '5services'] as Baseline[]).map((b) => (
                    <button
                      key={b}
                      onClick={() => saveBaseline(b)}
                      className="block w-full rounded px-3 py-2 text-left text-[13px] hover:bg-black/5"
                      style={{ color: baseline === b ? tokens.accent : tokens.text }}
                    >
                      {lang === 'ko' ? BASELINES[b].labelKo : BASELINES[b].labelEn}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Daily cumulative chart */}
        <section className="mb-10">
          <div
            className="rounded-2xl border p-6 md:p-8"
            style={{ background: tokens.surface, borderColor: tokens.border }}
          >
            <h2 className="mb-4 text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: tokens.textFaint }}>
              {t.daily}
            </h2>
            <CumulativeChart data={stats.cumulative} lang={lang} />
          </div>
        </section>

        {/* By model */}
        <section className="mb-10">
          <div
            className="rounded-2xl border p-6 md:p-8"
            style={{ background: tokens.surface, borderColor: tokens.border }}
          >
            <h2 className="mb-4 text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: tokens.textFaint }}>
              {t.byModel}
            </h2>
            <ul className="space-y-3">
              {stats.top.map(({ id, savedUsd }) => {
                const max = stats.top[0].savedUsd || 1;
                const pct = (savedUsd / max) * 100;
                const color = BRAND_COLORS[modelProvider(id)] || tokens.accent;
                return (
                  <li key={id}>
                    <div className="flex items-baseline justify-between text-[13px] mb-1">
                      <span style={{ color: tokens.text }}>{modelDisplayName(id)}</span>
                      <span style={{ color: tokens.textDim }}>{fmtMoney(savedUsd, lang)}</span>
                    </div>
                    <div className="h-1.5 rounded-full" style={{ background: tokens.surfaceAlt }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </li>
                );
              })}
              {stats.otherSaved > 0 && (
                <li>
                  <div className="flex items-baseline justify-between text-[13px]">
                    <span style={{ color: tokens.textDim }}>{t.other}</span>
                    <span style={{ color: tokens.textDim }}>{fmtMoney(stats.otherSaved, lang)}</span>
                  </div>
                </li>
              )}
            </ul>
          </div>
        </section>

      </div>
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────

function CumulativeChart({
  data, lang,
}: {
  data: { date: string; saved: number }[];
  lang: 'ko' | 'en';
}) {
  const W = 600;
  const H = 180;
  const PAD = { top: 16, right: 16, bottom: 28, left: 16 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const max = Math.max(...data.map((d) => d.saved), 0.0001);
  const xStep = data.length > 1 ? chartW / (data.length - 1) : 0;

  const points = data.map((d, i) => ({
    x: PAD.left + i * xStep,
    y: PAD.top + chartH - (d.saved / max) * chartH,
    ...d,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${PAD.left + (data.length - 1) * xStep} ${PAD.top + chartH} L ${PAD.left} ${PAD.top + chartH} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
      <path d={areaPath} fill={tokens.accentSoft} />
      <path d={linePath} stroke={tokens.accent} strokeWidth={1.5} fill="none" />
      <text x={PAD.left} y={H - 8} fontSize={11} fill={tokens.textFaint}>
        {data[0] && shortLabel(data[0].date, lang)}
      </text>
      <text x={W - PAD.right} y={H - 8} fontSize={11} fill={tokens.textFaint} textAnchor="end">
        {data[data.length - 1] && shortLabel(data[data.length - 1].date, lang)}
      </text>
    </svg>
  );
}

function shortLabel(iso: string, lang: 'ko' | 'en'): string {
  const d = new Date(iso + 'T00:00:00');
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return lang === 'ko' ? `${m}월 ${day}일` : `${m}/${day}`;
}
