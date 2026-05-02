'use client';

/**
 * D1BillingView — Design1 Billing view
 * "이번 달 얼마 썼나?" — 사용량 관리, 한도 설정. 이성적·관리적.
 *
 * Self-contained. 누적 절약은 CostSavings(별도 페이지)로 분리됨.
 */

import { useEffect, useMemo, useState } from 'react';
import { useUsageStore } from '@/stores/usage-store';
import { useLicenseStore } from '@/stores/license-store';

// ── Design tokens (same as chat-view-design1) ───────────────────
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

// ── [2026-04-26] Pricing v2 plans (Tori 명세) ────────────────────
type PlanId = 'free' | 'pro' | 'lifetime';
type BillingCycle = 'monthly' | 'yearly';

const PRICING = {
  pro: {
    monthlyKrw: 12420,
    yearlyKrw:  124200, // 10x = 2개월 무료
  },
  lifetime: {
    onceKrw: 40020,
  },
} as const;

// ── Copy ─────────────────────────────────────────────────────────
const copy = {
  ko: {
    head:          '모든 AI를 하나의 키로.',
    sub:           '하나로, 더 싸게, 더 스마트하게.',
    // Pricing v2
    plansHead:     '요금제',
    plansSub:      '필요한 만큼만, 평생 한 번, 또는 매달 — 골라쓰세요.',
    monthly:       '월간',
    yearly:        '연간',
    yearlyBadge:   '2개월 무료',
    perMonth:      '/월',
    perYear:       '/년',
    once:          '1회 결제',
    free:          '무료',
    plan_free:     '무료',
    plan_pro:      'Pro',
    plan_lifetime: 'Lifetime',
    plan_free_desc: 'API 키 BYOK · 핵심 기능 무제한.',
    plan_pro_desc:  '체험 키 + 우선 신모델 + 고급 RAG.',
    plan_lifetime_desc: 'Pro의 모든 기능을 평생.',
    plan_free_features: [
      '내 API 키로 모든 AI 무제한',
      '회의 분석 · 문서 RAG',
      '데이터 소스 연동',
    ],
    plan_pro_features: [
      'Free의 모든 기능',
      '키 없이도 일일 무료 체험',
      '신모델 우선 적용',
      '고급 RAG · 임베딩 검색',
      '우선 응대',
    ],
    plan_lifetime_features: [
      'Pro의 모든 기능',
      '평생 라이센스 (1회 결제)',
      '미래 신기능 자동 포함',
    ],
    cta_current:    '현재 플랜',
    cta_choose:     '선택하기',
    cta_upgrade:    '업그레이드',
    cta_lifetime:   '평생 구매',
    payTitle:       '결제 준비 중',
    payDesc:        '결제 시스템(Toss / Xendit / 카드)을 곧 연결해요. 출시 알림을 받으시려면 아래 버튼을 눌러주세요.',
    payNotify:      '출시 알림 받기',
    payClose:       '닫기',
    thisMonth:     '이번 달',
    spent:         '사용',
    // v3 비교 라벨: "만약, Blend 없이 매달 ₩82,200"
    ifSubscribedPrefix:    '만약, ',
    ifSubscribedHighlight: 'Blend',
    ifSubscribed:          ' 없이 매달 ',  // highlight와 amount 사이 텍스트
    ifSubscribedTrailing:  '',             // amount 뒤에 붙는 꼬리 (KO: 없음)
    // v3 절약 영역 (top + savings number + bottom)
    savingsTopPrefix:  (n: number) => `${n}일간 `,
    savingsHighlight:  'Blend',
    savingsTopSuffix:  (_n: number) => ' 덕분에',
    savedLabel:        (_n: number) => '절약',
    sumLabel:      '합계',
    last30:        '최근 30일',
    breakdown:     '모델별 사용',
    dailyAvg:      '일평균',
    highestDay:    '가장 많이 쓴 날',
    spendingLimit: '비용 한도',
    dailyLimit:    '일일 한도',
    monthlyLimit:  '월간 한도',
    notSet:        '없음',
    set:           '설정',
    change:        '변경',
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
    plansHead:     'Plans',
    plansSub:      'Pay-as-you-go, once forever, or monthly — pick what fits.',
    monthly:       'Monthly',
    yearly:        'Yearly',
    yearlyBadge:   '2 months free',
    perMonth:      '/mo',
    perYear:       '/yr',
    once:          'One-time',
    free:          'Free',
    plan_free:     'Free',
    plan_pro:      'Pro',
    plan_lifetime: 'Lifetime',
    plan_free_desc: 'BYOK · unlimited core features.',
    plan_pro_desc:  'Trial key + priority new models + advanced RAG.',
    plan_lifetime_desc: 'Everything in Pro, forever.',
    plan_free_features: [
      'Unlimited AI with your own keys',
      'Meeting analysis · document RAG',
      'Data source connectors',
    ],
    plan_pro_features: [
      'All Free features',
      'Daily free trial without a key',
      'Priority access to new models',
      'Advanced RAG · embedding search',
      'Priority support',
    ],
    plan_lifetime_features: [
      'All Pro features',
      'Lifetime license (one-time)',
      'Future features included',
    ],
    cta_current:    'Current plan',
    cta_choose:     'Choose',
    cta_upgrade:    'Upgrade',
    cta_lifetime:   'Get Lifetime',
    payTitle:       'Payment coming soon',
    payDesc:        'Toss / Xendit / Card checkout will be wired up shortly. Tap below to get a launch notification.',
    payNotify:      'Notify me at launch',
    payClose:       'Close',
    thisMonth:     'This month',
    spent:         'spent',
    // v3 비교 라벨: "If you paid for each — $60.00/month"
    ifSubscribedPrefix:    'If you paid for each — ',
    ifSubscribedHighlight: '',
    ifSubscribed:          '',           // 비교 라벨 highlight와 amount 사이 텍스트 없음
    ifSubscribedTrailing:  '/month',     // amount 뒤에 붙는 꼬리
    // v3 절약 영역 (영어는 "Saved with Blend" / "$60.00" / "in N days")
    savingsTopPrefix:  (_n: number) => 'Saved with ',
    savingsHighlight:  'Blend',
    savingsTopSuffix:  (_n: number) => '',
    savedLabel:        (n: number) => `in ${n} day${n === 1 ? '' : 's'}`,
    sumLabel:      'Total',
    last30:        'Last 30 days',
    breakdown:     'By model',
    dailyAvg:      'Daily average',
    highestDay:    'Highest day',
    spendingLimit: 'Spending limit',
    dailyLimit:    'Daily limit',
    monthlyLimit:  'Monthly limit',
    notSet:        'None',
    set:           'Set',
    change:        'Change',
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
// [2026-04-26] F-3 — mode='pricing' (Billing 메뉴) / 'savings' (Cost Savings 메뉴)
export default function D1BillingView({
  lang,
  mode = 'pricing',
}: {
  lang: 'ko' | 'en';
  mode?: 'pricing' | 'savings';
}) {
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

  const hasUsage = records.length > 0 && monthCostUsd > 0;

  // v3 — 사용 일수 + 절약액 계산 (Tori 명세)
  const daysSince = useMemo(() => {
    if (records.length === 0) return 0;
    const earliest = records.reduce((min, r) => Math.min(min, r.timestamp), records[0].timestamp);
    const diffMs = Date.now() - earliest;
    return Math.max(1, Math.floor(diffMs / 86400000));
  }, [records]);

  // 구독 시 일할 환산 — actualSpent 차감 = 절약액
  const wouldHavePaidUsd = (SUB_TOTAL_USD / 30) * daysSince;
  const savingsUsd       = Math.max(0, wouldHavePaidUsd - monthCostUsd);
  // 절약 영역 표시 조건: 사용 기록 존재 + 사용액이 구독료 이하 + 절약액이 의미 있는 수준
  const showSavings      = hasUsage && monthCostUsd <= SUB_TOTAL_USD && savingsUsd > 0 && daysSince >= 1;

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

  // [2026-04-26] Pricing v2 상태
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [payPlan, setPayPlan] = useState<PlanId | null>(null);

  // [2026-04-26] F-2 — 라이센스 store에서 현재 활성 플랜 조회
  const loadLicense  = useLicenseStore((s) => s.loadFromStorage);
  const getActivePlan = useLicenseStore((s) => s.getActivePlan);
  useEffect(() => { loadLicense(); }, [loadLicense]);
  const activePlan = getActivePlan();

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ background: tokens.bg, color: tokens.text, fontFamily: lang === 'ko' ? 'Pretendard, sans-serif' : 'Geist, sans-serif' }}
    >
      <div className="mx-auto w-full max-w-3xl px-6 py-12 md:py-16">

        {/* ══ Hero ══ */}
        <header className="mb-10 md:mb-12">
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

        {/* ══ [2026-04-26] Pricing v2 — Free / Pro / Lifetime ══ */}
        {mode === 'pricing' && (
          <PricingSection
            lang={lang}
            t={t}
            billingCycle={billingCycle}
            setBillingCycle={setBillingCycle}
            activePlan={activePlan}
            onChoose={(p) => setPayPlan(p)}
          />
        )}

        {mode === 'savings' && !hasUsage && (
          <EmptyState lang={lang} />
        )}
        {mode === 'savings' && hasUsage && (
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

                {/* v3 — 절약 영역: 잡스식 데이터 강조 (큰 숫자, accent) */}
                {showSavings && (
                  <>
                    <div className="mt-8 h-px" style={{ background: tokens.border }} />
                    <div className="mt-8">
                      <div className="text-[14px]" style={{ color: tokens.textDim }}>
                        {t.savingsTopPrefix(daysSince)}
                        <span style={{ color: tokens.accent, fontWeight: 500 }}>
                          {t.savingsHighlight}
                        </span>
                        {t.savingsTopSuffix(daysSince)}
                      </div>
                      <div
                        className="mt-2 text-[36px] md:text-[48px] font-medium leading-none tracking-tight"
                        style={{ color: tokens.accent }}
                      >
                        {fmtMoney(savingsUsd, lang)}
                      </div>
                      <div className="mt-2 text-[14px]" style={{ color: tokens.textDim }}>
                        {t.savedLabel(daysSince)}
                      </div>
                    </div>
                  </>
                )}

                {/* v3 비교 라벨 — "만약, Blend 없이 매달 ₩82,200" / "If you paid for each — $60.00/month" */}
                <div className="mt-10 mb-5 flex items-center gap-3">
                  <span className="h-px flex-1" style={{ background: tokens.border }} />
                  <span
                    className="text-[14px] whitespace-nowrap"
                    style={{ color: tokens.textDim, fontWeight: 400 }}
                  >
                    {t.ifSubscribedPrefix}
                    {t.ifSubscribedHighlight && (
                      <span style={{ color: tokens.accent, fontWeight: 500 }}>
                        {t.ifSubscribedHighlight}
                      </span>
                    )}
                    {t.ifSubscribed}
                    <span style={{ color: tokens.text, fontWeight: 500 }}>
                      {fmtMoney(SUB_TOTAL_USD, lang)}
                    </span>
                    {t.ifSubscribedTrailing}
                  </span>
                  <span className="h-px flex-1" style={{ background: tokens.border }} />
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
                {/* v3 — '차이' 행 제거: 절약액(₩82,135)은 메인 영역에서 강조됨, 중복 정보 제거 */}
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

        {/* ══ Section 3 — Spending limit (savings 모드에서만) ══ */}
        {mode === 'savings' && (
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
        )}

      </div>

      {/* [2026-04-26] Pricing v2 — 결제 stub 모달 */}
      {payPlan && (
        <PaymentStubModal
          plan={payPlan}
          billingCycle={billingCycle}
          lang={lang}
          t={t}
          onClose={() => setPayPlan(null)}
        />
      )}
    </div>
  );
}

// ── [2026-04-26] PricingSection ──────────────────────────────────
function PricingSection({
  lang, t, billingCycle, setBillingCycle, activePlan, onChoose,
}: {
  lang: 'ko' | 'en';
  t: typeof copy[keyof typeof copy];
  billingCycle: BillingCycle;
  setBillingCycle: (c: BillingCycle) => void;
  activePlan: PlanId;
  onChoose: (plan: PlanId) => void;
}) {
  const fmtKrwInline = (n: number) => `₩${n.toLocaleString('ko-KR')}`;
  const fmtUsdInline = (krw: number) => `$${(krw / KRW_PER_USD).toFixed(0)}`;
  const money = (krw: number) => (lang === 'ko' ? fmtKrwInline(krw) : fmtUsdInline(krw));

  const proPriceKrw = billingCycle === 'monthly' ? PRICING.pro.monthlyKrw : PRICING.pro.yearlyKrw;
  const proSuffix   = billingCycle === 'monthly' ? t.perMonth : t.perYear;

  // [2026-04-26] F-2 — 현재 플랜 vs 카드 플랜 매칭 시 "현재 플랜" 표시
  const ctaFor = (plan: PlanId, defaultLabel: string): { label: string; disabled: boolean } => {
    if (activePlan === plan) return { label: t.cta_current, disabled: true };
    // lifetime 보유자는 다른 카드 모두 "현재 플랜" (downgrade 의미 없음)
    if (activePlan === 'lifetime') return { label: t.cta_current, disabled: true };
    return { label: defaultLabel, disabled: false };
  };
  const proCta      = ctaFor('pro', t.cta_upgrade);
  const lifetimeCta = ctaFor('lifetime', t.cta_lifetime);

  return (
    <section className="mb-12 md:mb-14">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h2 className="text-[22px] md:text-[24px] font-medium tracking-tight" style={{ color: tokens.text }}>
            {t.plansHead}
          </h2>
          <p className="mt-1 text-[13px]" style={{ color: tokens.textDim }}>
            {t.plansSub}
          </p>
        </div>
        <CycleToggle billingCycle={billingCycle} setBillingCycle={setBillingCycle} t={t} />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <PlanCard
          plan="free"
          name={t.plan_free}
          desc={t.plan_free_desc}
          priceLabel={t.free}
          priceSuffix=""
          features={t.plan_free_features}
          cta={t.cta_current}
          ctaDisabled
          onChoose={onChoose}
        />
        <PlanCard
          plan="pro"
          name={t.plan_pro}
          desc={t.plan_pro_desc}
          priceLabel={money(proPriceKrw)}
          priceSuffix={proSuffix}
          features={t.plan_pro_features}
          cta={proCta.label}
          ctaDisabled={proCta.disabled}
          highlight
          onChoose={onChoose}
        />
        <PlanCard
          plan="lifetime"
          name={t.plan_lifetime}
          desc={t.plan_lifetime_desc}
          priceLabel={money(PRICING.lifetime.onceKrw)}
          priceSuffix={` · ${t.once}`}
          features={t.plan_lifetime_features}
          cta={lifetimeCta.label}
          ctaDisabled={lifetimeCta.disabled}
          onChoose={onChoose}
        />
      </div>
    </section>
  );
}

function CycleToggle({
  billingCycle, setBillingCycle, t,
}: {
  billingCycle: BillingCycle;
  setBillingCycle: (c: BillingCycle) => void;
  t: typeof copy[keyof typeof copy];
}) {
  return (
    <div
      className="inline-flex items-center rounded-full border p-0.5 text-[12px]"
      style={{ borderColor: tokens.border, background: tokens.surface }}
    >
      {(['monthly', 'yearly'] as const).map((c) => {
        const active = billingCycle === c;
        return (
          <button
            key={c}
            type="button"
            onClick={() => setBillingCycle(c)}
            className="relative rounded-full px-3 py-1.5 transition-colors"
            style={{
              background: active ? tokens.accent : 'transparent',
              color: active ? '#fff' : tokens.textDim,
              fontWeight: active ? 600 : 400,
            }}
          >
            {c === 'monthly' ? t.monthly : t.yearly}
            {c === 'yearly' && !active && (
              <span
                className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]"
                style={{ background: tokens.accentSoft, color: tokens.accent, fontWeight: 600 }}
              >
                {t.yearlyBadge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function PlanCard({
  plan, name, desc, priceLabel, priceSuffix, features, cta, ctaDisabled, highlight, onChoose,
}: {
  plan: PlanId;
  name: string;
  desc: string;
  priceLabel: string;
  priceSuffix: string;
  features: readonly string[];
  cta: string;
  ctaDisabled?: boolean;
  highlight?: boolean;
  onChoose: (plan: PlanId) => void;
}) {
  return (
    <div
      className="flex flex-col rounded-2xl border p-6"
      style={{
        background: highlight ? tokens.accentSoft : tokens.surface,
        borderColor: highlight ? tokens.accent : tokens.border,
        boxShadow: highlight ? '0 8px 24px rgba(0,0,0,0.06)' : 'none',
      }}
    >
      <div className="mb-1 text-[14px] font-semibold" style={{ color: tokens.text }}>
        {name}
      </div>
      <p className="mb-5 text-[12.5px]" style={{ color: tokens.textDim }}>
        {desc}
      </p>
      <div className="mb-5 flex items-baseline gap-1.5">
        <span className="text-[28px] font-medium tracking-tight" style={{ color: tokens.text }}>
          {priceLabel}
        </span>
        {priceSuffix && (
          <span className="text-[13px]" style={{ color: tokens.textFaint }}>
            {priceSuffix}
          </span>
        )}
      </div>
      <ul className="mb-6 flex-1 space-y-2 text-[13px]" style={{ color: tokens.text }}>
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2">
            <span style={{ color: tokens.accent }}>•</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={ctaDisabled}
        onClick={() => !ctaDisabled && onChoose(plan)}
        className="w-full rounded-xl px-3 py-2.5 text-[13px] font-medium transition-opacity disabled:opacity-50"
        style={{
          background: highlight ? tokens.accent : tokens.text,
          color: highlight ? '#fff' : tokens.bg,
          cursor: ctaDisabled ? 'default' : 'pointer',
        }}
      >
        {cta}
      </button>
    </div>
  );
}

function PaymentStubModal({
  plan, billingCycle, lang, t, onClose,
}: {
  plan: PlanId;
  billingCycle: BillingCycle;
  lang: 'ko' | 'en';
  t: typeof copy[keyof typeof copy];
  onClose: () => void;
}) {
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const planName = plan === 'pro' ? t.plan_pro : plan === 'lifetime' ? t.plan_lifetime : t.plan_free;
  const priceKrw = plan === 'lifetime'
    ? PRICING.lifetime.onceKrw
    : billingCycle === 'monthly' ? PRICING.pro.monthlyKrw : PRICING.pro.yearlyKrw;
  const priceLabel = lang === 'ko'
    ? `₩${priceKrw.toLocaleString('ko-KR')}`
    : `$${(priceKrw / KRW_PER_USD).toFixed(0)}`;
  const suffix = plan === 'lifetime' ? t.once : (billingCycle === 'monthly' ? t.perMonth : t.perYear);

  // [2026-04-26] F-1 — Toss Payments 결제 활성 여부 (ENV로 제어)
  const tossClientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? '';
  const tossEnabled = tossClientKey.length > 0;

  async function handleTossPay() {
    setPayError(null);
    setPaying(true);
    try {
      const { loadTossPayments } = await import('@tosspayments/payment-sdk');
      const tossPayments = await loadTossPayments(tossClientKey);
      const orderId = `blend-${plan}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const orderName = `Blend ${planName} (${plan === 'lifetime' ? 'Lifetime' : billingCycle === 'monthly' ? 'Monthly' : 'Yearly'})`;
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      await tossPayments.requestPayment('카드', {
        amount: priceKrw,
        orderId,
        orderName,
        successUrl: `${origin}/${lang}/payment/success`,
        failUrl: `${origin}/${lang}/payment/fail`,
      });
      // requestPayment는 redirect되므로 보통 여기까지 도달하지 않음
    } catch (e) {
      setPayError((e as Error)?.message ?? 'Toss payment failed');
      setPaying(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.32)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl"
        style={{ background: tokens.surface, color: tokens.text, boxShadow: '0 24px 60px rgba(0,0,0,0.18)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5">
          <div className="mb-1 text-[12px] uppercase tracking-[0.08em]" style={{ color: tokens.accent }}>
            {planName}
          </div>
          <h3 className="text-[20px] font-semibold tracking-tight" style={{ color: tokens.text }}>
            {priceLabel}
            <span className="ml-1 text-[13px]" style={{ color: tokens.textFaint }}>{suffix}</span>
          </h3>
          {tossEnabled ? (
            <>
              <h4 className="mt-4 text-[14px] font-medium" style={{ color: tokens.text }}>
                {lang === 'ko' ? '카드로 결제' : 'Pay with card'}
              </h4>
              <p className="mt-2 text-[13px] leading-[1.55]" style={{ color: tokens.textDim }}>
                {lang === 'ko'
                  ? 'Toss Payments 안전 결제 페이지로 이동해요. 카드 정보는 Blend 서버에 저장되지 않아요.'
                  : 'You will be redirected to the secure Toss Payments page. Your card details never touch our server.'}
              </p>
              {payError && (
                <p className="mt-3 text-[12px]" style={{ color: '#dc2626' }}>{payError}</p>
              )}
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  disabled={paying}
                  onClick={handleTossPay}
                  className="flex-1 rounded-xl px-3 py-2.5 text-[13px] font-medium disabled:opacity-50"
                  style={{ background: tokens.accent, color: '#fff' }}
                >
                  {paying
                    ? (lang === 'ko' ? '결제 페이지로 이동 중…' : 'Redirecting…')
                    : `${priceLabel} ${lang === 'ko' ? '결제' : 'Pay'}`}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={paying}
                  className="rounded-xl px-3 py-2.5 text-[13px] font-medium disabled:opacity-50"
                  style={{ background: tokens.surfaceAlt, color: tokens.text }}
                >
                  {t.payClose}
                </button>
              </div>
            </>
          ) : (
            <>
              <h4 className="mt-4 text-[14px] font-medium" style={{ color: tokens.text }}>
                {t.payTitle}
              </h4>
              <p className="mt-2 text-[13px] leading-[1.55]" style={{ color: tokens.textDim }}>
                {t.payDesc}
              </p>
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = `mailto:hello@blend.ai?subject=${encodeURIComponent('Blend ' + planName + ' launch')}`;
                  }}
                  className="flex-1 rounded-xl px-3 py-2.5 text-[13px] font-medium"
                  style={{ background: tokens.accent, color: '#fff' }}
                >
                  {t.payNotify}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl px-3 py-2.5 text-[13px] font-medium"
                  style={{ background: tokens.surfaceAlt, color: tokens.text }}
                >
                  {t.payClose}
                </button>
              </div>
            </>
          )}
        </div>
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
    // Reject inputs containing minus sign (preserve user intent: negative = invalid)
    if (/-/.test(draft.trim())) {
      onSave(0);
      setEditing(false);
      return;
    }
    const cleaned = draft.replace(/[^\d.]/g, '');
    const n = parseFloat(cleaned);
    if (!Number.isFinite(n) || n <= 0) {
      onSave(0);
    } else {
      const usd = lang === 'ko' ? n / KRW_PER_USD : n;
      // Sanity cap: $10,000/day (≈ ₩13.7M/day) — clearly above any realistic limit
      const capped = Math.min(usd, 10000);
      onSave(capped);
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
            {/* [2026-05-02 Roy] 이미 설정된 값이면 '변경', 미설정이면 '설정' —
                'set'과 're-set'을 시각적으로 구분 (이전엔 똑같이 [설정]만 노출). */}
            {valueUsd > 0 ? t.change : t.set}
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
        role="switch"
        aria-checked={checked}
        aria-label={label}
      >
        <span
          className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform"
          style={{ transform: checked ? 'translateX(18px)' : 'translateX(2px)' }}
        />
      </button>
    </label>
  );
}
