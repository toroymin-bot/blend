'use client';

/**
 * D1BillingView — Design1 Billing view
 * "이번 달 얼마 썼나?" — 사용량 관리, 한도 설정. 이성적·관리적.
 *
 * Self-contained. 누적 절약은 CostSavings(별도 페이지)로 분리됨.
 */

import { useEffect, useMemo, useState } from 'react';
import { useLicenseStore } from '@/stores/license-store';
import { fetchUsageSummary, fetchUsageDaily, type UsageSummary, type UsageDaily } from '@/lib/usage-summary';

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
// [2026-05-05 PM-30 Roy] KRW_PER_USD 하드코딩 제거 — getCurrentFxRates() 사용.
// 매월 1일 xe.com 기준으로 src/lib/currency.ts MONTHLY_FX_RATES에서 갱신.

// 구독 비교 (USD/월) — 비교 baseline은 USD가 source of truth
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

// [2026-05-05 PM-31 Roy] PRICING USD source of truth — 3-tier 할인 구조:
//   - 월간: $8 (정가)
//   - 6개월: $8 × 6 × 0.80 = $38.40 → ceil $39 (20% 할인)
//   - 연간: $8 × 12 × 0.70 = $67.20 → ceil $68 (30% 할인)
// KRW/PHP는 getCurrentFxRates()로 화면 표시 시점에 변환 (xe.com 매월 1일 기준).
const PRICING = {
  pro: {
    monthlyUsd: 8,
    yearlyUsd:  68, // $96 × 0.70 = $67.20 → ceil
  },
  lifetime: {
    onceUsd: 39,    // $48 × 0.80 = $38.40 → ceil — 6개월 1회 결제
  },
  /** 할인율 — 카드 badge / 카피에 노출 */
  discount: {
    yearlyPct:    30,
    semiYearlyPct: 20,
  },
} as const;

// ── Copy ─────────────────────────────────────────────────────────
const copy = {
  ko: {
    head:          '모든 AI를 하나의 키로.',
    sub:           '한달에 커피 한 잔 비용으로. 매일 모든 AI를.',
    // [2026-05-05 Roy PM-29] Savings 모드 hero — 가격 가치 전면.
    savingsHead:    '한 달에 커피 한 잔. 매일 모든 AI를.',
    savingsHeadCta: '쓴 만큼만 내세요',
    savingsHeadSuffix: '.',
    // [2026-05-05 Roy PM-29~31] Savings 상단 플랜 카드 — billing 페이지로 유도.
    // PM-31: 가격 string 제거 → SavingsPlanCard에서 fmtMoney(usd, lang)로 동적 변환.
    // perMo는 effective monthly (6개월 가격 ÷ 6) — 동적 계산.
    savingsPlanTitle: '플랜',
    savingsPlanSemiName: 'Smarter — 6개월',
    savingsPlanSemiBadge: '추천',
    savingsPlanMonthName: '월간',
    savingsPlanFootnote: '* AI 사용료는 원가 그대로 (마진 0%)',
    savingsPlanGoTitle: '결제 페이지로 이동',
    savingsPlanPerMoSuffix: '/월',
    savingsPlanDiscountFmt: (pct: number) => `${pct}% 할인`,
    // Pricing v2
    plansHead:     '요금제',
    plansSub:      '필요한 만큼만, 평생 한 번, 또는 매달 — 골라쓰세요.',
    monthly:       '월간',
    yearly:        '연간',
    yearlyBadge:   '30% 할인',
    perMonth:      '/월',
    perYear:       '/년',
    once:          '1회 결제',
    free:          '무료',
    plan_free:     '무료',
    plan_pro:      'Pro',
    plan_lifetime: 'Smarter - 6개월',
    // [2026-05-05 PM-31 Roy] plan 설명 짧게 — 카드 한 줄 요약.
    plan_free_desc: '키만 있으면 무제한.',
    plan_pro_desc:  '유연하게, 매달.',
    plan_lifetime_desc: '20% 절약 · 인기.',
    // [2026-05-05 PM-31 Roy] 연간 요금제 신규 — 30% 할인.
    plan_yearly: 'Smarter - 1년',
    plan_yearly_desc: '30% 절약 · 베스트.',
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
      '6개월 이용권 (1회 결제 · 20% 할인)',
      '미래 신기능 자동 포함',
    ],
    plan_yearly_features: [
      'Pro의 모든 기능',
      '1년 이용권 (1회 결제 · 30% 할인)',
      '미래 신기능 자동 포함',
    ],
    cta_yearly_prefix: '1년 구매 — ',
    cta_current:    '현재 플랜',
    cta_choose:     '선택하기',
    cta_upgrade:    '업그레이드',
    // PM-31: 가격 string 제거 — 호출 시 fmtMoney(lifetime price, lang)로 lang별 변환.
    cta_lifetime_prefix: '6개월 구매 — ',
    payTitle:       '결제 준비 중',
    payDesc:        '결제 시스템(Toss / Xendit / 카드)을 곧 연결해요. 출시 알림을 받으시려면 아래 버튼을 눌러주세요.',
    payNotify:      '출시 알림 받기',
    payClose:       '닫기',
    thisMonth:     '이번 달',
    spent:         '사용',
    // v3 비교 라벨: "만약, Blend가 없었다면 매달 ₩82,200"
    ifSubscribedPrefix:    '만약, ',
    ifSubscribedHighlight: 'Blend',
    ifSubscribed:          '가 없었다면 매달 ',  // highlight와 amount 사이 텍스트
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
    spendingLimit: 'Blend 자체 한도',
    spendingLimitSub: '여기서 정한 금액을 넘으면 Blend가 모든 AI 호출을 멈춰요.',
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
    // [2026-05-03 Roy] AI 회사 콘솔 직접 한도 설정 카드 — Blend 자체 한도와 별개로,
    // 사용자가 OpenAI/Anthropic 등 원천에서 결제 한도를 직접 잠그도록 안내.
    // 스티브 잡스 식: 강한 한 줄 명제 + 짧은 설명 + 1-탭 액션.
    providerLimitTitle:    'AI 회사에서 직접 한도 설정',
    providerLimitHeadline: '한 번만 잠그면, 평생 안전합니다.',
    providerLimitDesc:     'Blend의 한도는 이 브라우저 안에서만 작동해요. 원천(각 AI 회사 콘솔)에서 한도를 직접 정해두면 — 어떤 디바이스, 어떤 키, 어떤 상황에서도 그 금액을 절대 넘지 않습니다.',
    providerLimitOpen:     '한도 설정 열기',
  },
  en: {
    head:          'Every AI, with one key.',
    sub:           'One coffee a month. Every AI, every day.',
    // [2026-05-05 Roy PM-29] Savings hero copy.
    savingsHead:    'One coffee a month. Every AI, every day.',
    savingsHeadCta: 'Pay only for what you use',
    savingsHeadSuffix: '.',
    savingsPlanTitle: 'Plans',
    savingsPlanSemiName: 'Smarter — 6 months',
    savingsPlanSemiBadge: 'Recommended',
    savingsPlanMonthName: 'Monthly',
    savingsPlanFootnote: '* AI usage billed at cost (0% markup)',
    savingsPlanGoTitle: 'Go to checkout',
    savingsPlanPerMoSuffix: '/mo',
    savingsPlanDiscountFmt: (pct: number) => `${pct}% off`,
    plansHead:     'Plans',
    plansSub:      'Pay-as-you-go, once forever, or monthly — pick what fits.',
    monthly:       'Monthly',
    yearly:        'Yearly',
    yearlyBadge:   '30% off',
    perMonth:      '/mo',
    perYear:       '/yr',
    once:          'One-time',
    free:          'Free',
    plan_free:     'Free',
    plan_pro:      'Pro',
    plan_lifetime: 'Smarter - 6 Months',
    plan_free_desc: 'Bring your key. Go unlimited.',
    plan_pro_desc:  'Flexible. Monthly.',
    plan_lifetime_desc: '20% off · Popular.',
    plan_yearly: 'Smarter - 1 Year',
    plan_yearly_desc: '30% off · Best value.',
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
      '6-month access (one-time · 20% off)',
      'Future features included',
    ],
    plan_yearly_features: [
      'All Pro features',
      '1-year access (one-time · 30% off)',
      'Future features included',
    ],
    cta_yearly_prefix: 'Get 1-Year Access — ',
    cta_current:    'Current plan',
    cta_choose:     'Choose',
    cta_upgrade:    'Upgrade',
    cta_lifetime_prefix: 'Get 6-Month Access — ',
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
    spendingLimit: 'Blend-side spending limit',
    spendingLimitSub: 'Cross this and Blend stops every AI call — instantly.',
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
    providerLimitTitle:    'Set a hard limit at the source',
    providerLimitHeadline: 'Lock it once. Stay safe forever.',
    providerLimitDesc:     'Blend\'s limit only works in this browser. Cap your spend at the source — every device, every key, every situation will respect it.',
    providerLimitOpen:     'Open limit settings',
  },
  // [2026-05-04 Roy #17 후속] Filipino/Tagalog — design1 billing UI 따갈로그 적용.
  // 기술 용어 (API key, subscription, BYOK 등)는 영어 — Taglish 자연스러움.
  ph: {
    head:          'Lahat ng AI, sa iisang key.',
    sub:           'Isang kape kada buwan. Lahat ng AI araw-araw.',
    // [2026-05-05 Roy PM-29] Savings hero (Filipino).
    savingsHead:    'Isang kape kada buwan. Lahat ng AI araw-araw.',
    savingsHeadCta: 'Bayaran lamang ang ginagamit',
    savingsHeadSuffix: '.',
    savingsPlanTitle: 'Mga Plan',
    savingsPlanSemiName: 'Smarter — 6 buwan',
    savingsPlanSemiBadge: 'Inirerekomenda',
    savingsPlanMonthName: 'Buwanan',
    savingsPlanFootnote: '* AI usage sa presyo lang (0% markup)',
    savingsPlanGoTitle: 'Pumunta sa checkout',
    savingsPlanPerMoSuffix: '/buwan',
    savingsPlanDiscountFmt: (pct: number) => `${pct}% off`,
    plansHead:     'Mga Plan',
    plansSub:      'Pay-as-you-go, isang beses, o buwanan — pumili ng akma.',
    monthly:       'Buwanan',
    yearly:        'Taunan',
    yearlyBadge:   '30% off',
    perMonth:      '/buwan',
    perYear:       '/taon',
    once:          'Isang beses na bayad',
    free:          'Libre',
    plan_free:     'Libre',
    plan_pro:      'Pro',
    plan_lifetime: 'Smarter - 6 Buwan',
    plan_free_desc: 'Dalhin ang key mo. Walang limit.',
    plan_pro_desc:  'Flexible. Buwanan.',
    plan_lifetime_desc: '20% off · Popular.',
    plan_yearly: 'Smarter - 1 Taon',
    plan_yearly_desc: '30% off · Pinakasulit.',
    plan_free_features: [
      'Walang limit na AI gamit ang sarili mong keys',
      'Pagsusuri ng meeting · document RAG',
      'Data source connectors',
    ],
    plan_pro_features: [
      'Lahat ng Free features',
      'Araw-araw na free trial nang walang key',
      'Priority access sa bagong models',
      'Advanced RAG · embedding search',
      'Priority support',
    ],
    plan_lifetime_features: [
      'Lahat ng Pro features',
      '6-buwang access (isang beses · 20% off)',
      'Future features kasama na',
    ],
    plan_yearly_features: [
      'Lahat ng Pro features',
      '1-taong access (isang beses · 30% off)',
      'Future features kasama na',
    ],
    cta_yearly_prefix: 'Kumuha ng 1-Taon — ',
    cta_current:    'Kasalukuyang plan',
    cta_choose:     'Piliin',
    cta_upgrade:    'Mag-upgrade',
    cta_lifetime_prefix: 'Kumuha ng 6-Buwan — ',
    payTitle:       'Malapit nang magkaroon ng payment',
    payDesc:        'Malapit nang ikonekta ang Toss / Xendit / Card checkout. I-tap sa baba para makatanggap ng launch notification.',
    payNotify:      'Abisuhan ako sa launch',
    payClose:       'Isara',
    thisMonth:     'Buwang ito',
    spent:         'nagastos',
    ifSubscribedPrefix:    'Kung nagbabayad ka sa bawat isa — ',
    ifSubscribedHighlight: '',
    ifSubscribed:          '',
    ifSubscribedTrailing:  '/buwan',
    savingsTopPrefix:  (_n: number) => 'Naitipid sa ',
    savingsHighlight:  'Blend',
    savingsTopSuffix:  (_n: number) => '',
    savedLabel:        (n: number) => `sa ${n} araw`,
    sumLabel:      'Total',
    last30:        'Huling 30 araw',
    breakdown:     'Kada model',
    dailyAvg:      'Araw-araw na average',
    highestDay:    'Pinakamataas na araw',
    spendingLimit: 'Spending limit ng Blend',
    spendingLimitSub: 'Kapag lumampas ang gastos sa halagang ito, ititigil ng Blend ang lahat ng AI calls.',
    dailyLimit:    'Araw-araw na Limit',
    monthlyLimit:  'Buwanang Limit',
    notSet:        'Wala',
    set:           'I-set',
    change:        'Baguhin',
    cancel:        'Kanselahin',
    save:          'I-save',
    notify80:      'Abisuhan kapag 80% ng limit',
    autoStop:      'Awtomatikong itigil kapag lumampas',
    empty:         'Wala pang usage.',
    emptyHint:     'Kapag nag-umpisa kang mag-chat, lalabas dito ang usage mo.',
    today:         'Ngayon',
    providerLimitTitle:    'Mag-set ng hard limit sa source',
    providerLimitHeadline: 'I-lock minsan. Ligtas habambuhay.',
    providerLimitDesc:     'Sa browser na ito lang gumagana ang limit ng Blend. I-cap ang gastos sa source (AI company console) — bawat device, bawat key, bawat sitwasyon ay susunod doon.',
    providerLimitOpen:     'Buksan ang limit settings',
  },
} as const;

// ── Format helpers ───────────────────────────────────────────────
// [2026-05-05 Roy PM-30] 단일 통화 표시. lang에 따라 ₩ / $ / ₱ 중 하나만.
// 환율은 src/lib/currency.ts MONTHLY_FX_RATES (xe.com 매월 1일 기준).
import { getCurrentFxRates } from '@/lib/currency';

function fmtKrw(usd: number): string {
  const fx = getCurrentFxRates();
  const krw = Math.ceil(usd * fx.krwPerUsd);
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

function fmtPhp(usd: number): string {
  const fx = getCurrentFxRates();
  const php = Math.ceil(usd * fx.phpPerUsd);
  if (php === 0) return '₱0';
  if (php < 1) return '<₱1';
  return `₱${php.toLocaleString('en-PH')}`;
}

/**
 * [2026-05-05 PM-30 Roy] 단일 통화 표시 — 혼합 표시 ($ (₱)) 금지.
 * isPh 파라미터는 backward-compat 유지하되 무시 (lang === 'ph'면 항상 PHP만).
 */
function fmtMoney(usd: number, lang: 'ko' | 'en' | 'ph', _isPh?: boolean): string {
  if (lang === 'ko') return fmtKrw(usd);
  if (lang === 'ph') return fmtPhp(usd);
  return fmtUsd(usd);
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

function shortDateLabel(iso: string, lang: 'ko' | 'en' | 'ph'): string {
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
  lang: 'ko' | 'en' | 'ph';
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
  lang: rawLang,
  mode = 'pricing',
}: {
  lang: 'ko' | 'en' | 'ph';
  mode?: 'pricing' | 'savings';
}) {
  // [2026-05-05 PM-32 Roy] CRITICAL FIX — 이전 PM-27 시대 coerce (`rawLang === 'ph' ? 'en'`)이
  // PM-30/PM-31 currency 통합 후에도 잔존해 ph 페이지의 모든 fmtMoney(usd, lang) 호출이
  // 'en'으로 들어가 $ 표시되던 버그. 이제 design1 컴포넌트들이 ph 직접 받도록 PM-28에서
  // 확장됐으므로 coerce 불필요. lang === rawLang.
  const lang: 'ko' | 'en' | 'ph' = rawLang;
  const isPh = rawLang === 'ph';
  // copy lookup은 rawLang 사용 — copy.ph가 직접 매칭돼 따갈로그 카피 노출.
  const t = copy[rawLang];

  // ── Usage data (PM-46 Phase 5: WAE 단일 소스) ─────────────────────
  // [2026-05-05 Roy] localStorage useUsageStore 의존 모두 제거. 모든 사용량 데이터는
  // Cloudflare WAE에서 fetch (모든 디바이스 합산, race lost 없음). cost-limit
  // enforcement는 chat-api에서 records 그대로 사용 (다른 모듈) — 이 view는 read-only.
  const [kvSummary, setKvSummary] = useState<UsageSummary | null>(null);
  const [dailyHistory, setDailyHistory] = useState<UsageDaily[]>([]);

  useEffect(() => {
    fetchUsageSummary().then((data) => setKvSummary(data));
    fetchUsageDaily(30).then((data) => setDailyHistory(data));
  }, []);

  // 월간 비용 = WAE month 합산 (모든 디바이스)
  const monthCostUsd = kvSummary?.month?.totalCost ?? 0;

  // 모델별 비용 = WAE month.models
  const modelEntries = useMemo(() => {
    const models = kvSummary?.month?.models ?? {};
    const arr = Object.entries(models)
      .map(([model, v]) => ({ model, usd: v.cost }))
      .sort((a, b) => b.usd - a.usd);
    const total = arr.reduce((s, x) => s + x.usd, 0);
    return { items: arr.slice(0, 5), total };
  }, [kvSummary]);

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

  // [2026-05-05 PM-46 Phase 5 Roy] hasUsage 판정 = WAE 합산 기준. records 0건이라도
  // 다른 디바이스에서 사용했으면 표시.
  const hasUsage = (kvSummary?.month?.totalRequests ?? 0) > 0 && monthCostUsd >= 0;

  // 사용 일수 = dailyHistory에서 비용 발생일 카운트. 절약액 계산용 (구독 일할 환산).
  const daysSince = useMemo(() => {
    const activeDays = dailyHistory.filter((d) => d.requests > 0).length;
    return Math.max(0, activeDays);
  }, [dailyHistory]);

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
        {/* [2026-05-05 Roy PM-29] mode='savings' 헤더는 "한 달에 커피 한 잔. 매일 모든 AI를. [쓴 만큼만 내세요]." */}
        <header className="mb-10 md:mb-12">
          {mode === 'savings' ? (
            <>
              <h1
                className="text-[32px] md:text-[40px] font-medium leading-[1.15] tracking-tight"
                style={{ color: tokens.text }}
              >
                {t.savingsHead}{' '}
                <span style={{ color: tokens.accent }}>
                  {t.savingsHeadCta}
                </span>
                {t.savingsHeadSuffix}
              </h1>
            </>
          ) : (
            <>
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
            </>
          )}
        </header>

        {/* [2026-05-05 Roy PM-29] Savings 모드 — 최상단 플랜 카드 (billing 페이지로 유도) */}
        {mode === 'savings' && (
          <SavingsPlanCard t={t} lang={lang} />
        )}

        {/* ══ [2026-04-26] Pricing v2 — Free / Pro / Lifetime ══ */}
        {mode === 'pricing' && (
          <PricingSection
            lang={lang}
            isPh={isPh}
            t={t}
            billingCycle={billingCycle}
            setBillingCycle={setBillingCycle}
            activePlan={activePlan}
            onChoose={(p, cycle) => {
              if (cycle) setBillingCycle(cycle);
              setPayPlan(p);
            }}
          />
        )}

        {mode === 'savings' && !hasUsage && (
          <EmptyState lang={lang} />
        )}

        {/* [2026-05-05 PM-46 Phase 5 Roy] 모든 디바이스 통합 뷰 — WAE 단일 소스.
            KV/localStorage 잔재 라벨 제거. 모든 카드가 동일 소스라 자동 일관성. */}
        {mode === 'savings' && kvSummary && kvSummary.all.totalCost > 0 && (
          <section className="mb-12">
            <div
              className="rounded-2xl border p-6 md:p-8"
              style={{ background: tokens.surface, borderColor: tokens.border }}
            >
              <div className="mb-6 flex items-center gap-2">
                <span className="text-[13px]" style={{ color: tokens.textDim }}>
                  {lang === 'ko' ? '모든 디바이스 합산 (Mac · iPhone · PC)' : 'All devices combined (Mac · iPhone · PC)'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <KvCol label={lang === 'ko' ? '어제(최근 24시간)' : 'Yesterday (24h)'}    cost={kvSummary.yesterday.totalCost} reqs={kvSummary.yesterday.totalRequests} lang={lang} isPh={isPh} />
                <KvCol label={lang === 'ko' ? '이번 주(최근 7일)' : 'This week (7d)'}    cost={kvSummary.week.totalCost}      reqs={kvSummary.week.totalRequests}      lang={lang} isPh={isPh} />
                <KvCol label={lang === 'ko' ? '전체 누적' : 'All time'}    cost={kvSummary.all.totalCost}       reqs={kvSummary.all.totalRequests}       lang={lang} isPh={isPh} />
              </div>
              {Object.keys(kvSummary.all.providers).length > 0 && (
                <div className="mt-5 pt-4 border-t text-[13px]" style={{ borderColor: tokens.border, color: tokens.textDim }}>
                  <div className="mb-2">{lang === 'ko' ? 'AI 회사별 (전체 누적)' : 'By provider (all time)'}</div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                    {Object.entries(kvSummary.all.providers)
                      .sort((a, b) => b[1].cost - a[1].cost)
                      .map(([p, v]) => (
                        <span key={p}>
                          <span style={{ background: BRAND_COLORS[p] ?? tokens.accent, display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginRight: 6 }} />
                          {p}: {fmtMoney(v.cost, lang, isPh)} · {v.requests}{lang === 'ko' ? '건' : ' requests'}
                        </span>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </section>
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
                    {fmtMoney(monthCostUsd, lang, isPh)}
                  </span>
                  <span className="text-[14px]" style={{ color: tokens.textDim }}>
                    {t.spent}
                  </span>
                </div>

                {/* [2026-05-02 Roy] 절약 강조 — 'Blend' / '절약' 둘 다 눈에 띄게.
                    이전: 작은 회색 텍스트로 묻혔음. 신규: top label 키우고 Blend
                    bold + accent, 금액 옆에 '절약' 인라인으로 큰 글자. */}
                {showSavings && (
                  <>
                    <div className="mt-8 h-px" style={{ background: tokens.border }} />
                    <div className="mt-8">
                      <div className="text-[15px] md:text-[16px]" style={{ color: tokens.textDim }}>
                        {t.savingsTopPrefix(daysSince)}
                        <span style={{ color: tokens.accent, fontWeight: 700 }}>
                          {t.savingsHighlight}
                        </span>
                        {t.savingsTopSuffix(daysSince)}
                      </div>
                      <div className="mt-2 flex items-baseline gap-2 flex-wrap">
                        <span
                          className="text-[36px] md:text-[48px] font-medium leading-none tracking-tight"
                          style={{ color: tokens.accent }}
                        >
                          {fmtMoney(savingsUsd, lang, isPh)}
                        </span>
                        <span
                          className="text-[20px] md:text-[24px] font-medium"
                          style={{ color: tokens.text }}
                        >
                          {t.savedLabel(daysSince)}
                        </span>
                      </div>
                    </div>
                  </>
                )}

                {/* v3 비교 라벨 — "만약, Blend가 없었다면 매달 ₩82,200" / "If you paid for each — $60.00/month" */}
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
                      {fmtMoney(SUB_TOTAL_USD, lang, isPh)}
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
                        {fmtMoney(s.usd, lang, isPh)}
                      </span>
                    </li>
                  ))}
                </ul>

                <div
                  className="mt-4 flex items-center justify-between border-t pt-4 text-[14px]"
                  style={{ borderColor: tokens.border }}
                >
                  <span style={{ color: tokens.textDim }}>{t.sumLabel}</span>
                  <span style={{ color: tokens.text }}>{fmtMoney(SUB_TOTAL_USD, lang, isPh)}</span>
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
                              {fmtMoney(usd, lang, isPh)} · {pct.toFixed(0)}%
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
                    {fmtMoney(dailyAvgUsd, lang, isPh)}
                  </div>
                </div>
                <div
                  className="rounded-2xl border p-6"
                  style={{ background: tokens.surface, borderColor: tokens.border }}
                >
                  <div className="text-[13px]" style={{ color: tokens.textDim }}>{t.highestDay}</div>
                  <div className="mt-2 text-[24px] font-medium" style={{ color: tokens.text }}>
                    {highestDay ? fmtMoney(highestDay.cost, lang, isPh) : '—'}
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
        <section className="mb-12">
          <div
            className="rounded-2xl border p-6 md:p-8"
            style={{ background: tokens.surface, borderColor: tokens.border }}
          >
            {/* [2026-05-03 Roy] 헤더 + 1줄 부제 — 'Blend 자체 한도'임을 명시.
                (다음 카드: AI 회사 콘솔 직접 한도와 구분) */}
            <div className="mb-1 text-[15px] font-medium" style={{ color: tokens.text }}>
              {t.spendingLimit}
            </div>
            {(t as { spendingLimitSub?: string }).spendingLimitSub && (
              <div className="mb-6 text-[13px]" style={{ color: tokens.textDim }}>
                {(t as { spendingLimitSub?: string }).spendingLimitSub}
              </div>
            )}

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

        {/* [2026-05-03 Roy] ══ Section 4 — AI 회사별 직접 한도 설정 ══
            Blend 자체 한도(Section 3)는 브라우저 안에서만 작동. 사용자가 OpenAI/
            Anthropic/Google/DeepSeek/Groq 콘솔에서 결제 한도를 직접 잠그도록
            안내. 강력한 명제(잡스 식) + 짧은 설명 + 1-탭 액션. */}
        {mode === 'savings' && (
          <ProviderLimitsSection lang={lang} t={t as Record<string, unknown> & typeof copy.ko} />
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
// [2026-05-05 PM-31 Roy] PricingSection — 4 카드 구조:
//   Free / Pro 월간 / Smarter 6개월 (20% off) / Smarter 1년 (30% off)
// Cycle 토글 폐기 — 각 카드가 cycle 고유. lifetime/yearly는 1회 결제.
function PricingSection({
  lang, isPh, t, billingCycle, setBillingCycle, activePlan, onChoose,
}: {
  lang: 'ko' | 'en' | 'ph';
  isPh: boolean;
  t: typeof copy[keyof typeof copy];
  billingCycle: BillingCycle;
  setBillingCycle: (c: BillingCycle) => void;
  activePlan: PlanId;
  onChoose: (plan: PlanId, cycle?: BillingCycle) => void;
}) {
  void isPh;
  void billingCycle;
  void setBillingCycle;
  const money = (usd: number) => fmtMoney(usd, lang);

  const ctaFor = (plan: PlanId, defaultLabel: string): { label: string; disabled: boolean } => {
    if (activePlan === plan) return { label: t.cta_current, disabled: true };
    if (activePlan === 'lifetime') return { label: t.cta_current, disabled: true };
    return { label: defaultLabel, disabled: false };
  };
  const proCta      = ctaFor('pro', t.cta_upgrade);
  const lifetimeCta = ctaFor('lifetime', `${t.cta_lifetime_prefix}${fmtMoney(PRICING.lifetime.onceUsd, lang)}`);
  // [PM-31] yearly는 'pro' planId + 'yearly' cycle 조합.
  const yearlyCta   = ctaFor('pro', `${t.cta_yearly_prefix}${fmtMoney(PRICING.pro.yearlyUsd, lang)}`);

  return (
    <section className="mb-12 md:mb-14">
      <div className="mb-5">
        <h2 className="text-[22px] md:text-[24px] font-medium tracking-tight" style={{ color: tokens.text }}>
          {t.plansHead}
        </h2>
        <p className="mt-1 text-[13px]" style={{ color: tokens.textDim }}>
          {t.plansSub}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        {/* [2026-05-05 PM-34 Roy] 4 카드 파란 그라데이션 — Free 흰색 / Pro 아주 아주 연한 /
            Smarter 6개월 아주 연한 / Smarter 1년 연한 (점점 진해짐). */}
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
          priceLabel={money(PRICING.pro.monthlyUsd)}
          priceSuffix={t.perMonth}
          features={t.plan_pro_features}
          cta={proCta.label}
          ctaDisabled={proCta.disabled}
          bgTint="pro"
          onChoose={(p) => onChoose(p, 'monthly')}
        />
        <PlanCard
          plan="lifetime"
          name={t.plan_lifetime}
          desc={t.plan_lifetime_desc}
          priceLabel={money(PRICING.lifetime.onceUsd)}
          priceSuffix={` · ${t.once}`}
          features={t.plan_lifetime_features}
          cta={lifetimeCta.label}
          ctaDisabled={lifetimeCta.disabled}
          highlight
          bgTint="semi"
          onChoose={onChoose}
        />
        <PlanCard
          plan="pro"
          name={t.plan_yearly}
          desc={t.plan_yearly_desc}
          priceLabel={money(PRICING.pro.yearlyUsd)}
          priceSuffix={` · ${t.once}`}
          features={t.plan_yearly_features}
          cta={yearlyCta.label}
          ctaDisabled={yearlyCta.disabled}
          bgTint="yearly"
          onChoose={(p) => onChoose(p, 'yearly')}
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

// [2026-05-05 PM-41 Roy] 요금제 카드 주황 그라데이션 — Pro / 6개월 / 1년 점점 진해짐.
// (이전 PM-34는 파랑 → Roy 결정으로 주황으로 변경. Anthropic accent 톤 #d97757 기반.)
// 무료 카드는 흰색 그대로 (현재 플랜 표시).
const PLAN_BG_TINTS = {
  pro:    '#fdf6f1', // 아주 아주 아주 연한 주황 (4% 톤)
  semi:   '#fbe6d4', // 아주 아주 연한 주황 (12% 톤) — Smarter 6개월
  yearly: '#f6c89c', // 아주 연한 주황 (24% 톤) — Smarter 1년
} as const;
type PlanBgTint = keyof typeof PLAN_BG_TINTS;

function PlanCard({
  plan, name, desc, priceLabel, priceSuffix, features, cta, ctaDisabled, highlight, onChoose,
  bgTint,
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
  bgTint?: PlanBgTint;
}) {
  const bg = bgTint ? PLAN_BG_TINTS[bgTint] : tokens.surface;
  // [PM-41] highlight (6개월 추천 카드)는 주황 border + shadow로 강조 — 주황 그라데이션 통일.
  const borderColor = highlight ? '#d97757' : tokens.border;
  return (
    <div
      className="flex flex-col rounded-2xl border p-6"
      style={{
        background: bg,
        borderColor,
        boxShadow: highlight ? '0 8px 24px rgba(217, 119, 87, 0.16)' : 'none',
      }}
    >
      <div className="mb-1 text-[14px] font-semibold" style={{ color: tokens.text }}>
        {/* [2026-05-05 PM-41 Roy] 'Smarter' 강조 — 주황 그라데이션 통일 (이전 #2563eb 파랑 →
            #a04f2f Anthropic brick tone). 가독성 + 시각 일관성. */}
        {name.startsWith('Smarter') ? (
          <>
            <span style={{ color: '#a04f2f', fontWeight: 700 }}>Smarter</span>
            <span>{name.slice('Smarter'.length)}</span>
          </>
        ) : (
          name
        )}
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
  lang: 'ko' | 'en' | 'ph';
  t: typeof copy[keyof typeof copy];
  onClose: () => void;
}) {
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  // [2026-05-05 PM-31 Roy] yearly cycle은 'pro' planId + yearly = Smarter 1년 (1회 결제).
  const isYearlyOneTime = plan === 'pro' && billingCycle === 'yearly';
  const planName = isYearlyOneTime
    ? t.plan_yearly
    : plan === 'pro' ? t.plan_pro : plan === 'lifetime' ? t.plan_lifetime : t.plan_free;
  // [2026-05-05 PM-30 Roy] USD 기반. 화면 표시는 lang에 따라 단일 통화.
  const priceUsd = plan === 'lifetime'
    ? PRICING.lifetime.onceUsd
    : billingCycle === 'monthly' ? PRICING.pro.monthlyUsd : PRICING.pro.yearlyUsd;
  const priceLabel = fmtMoney(priceUsd, lang);
  // Toss Payments는 KRW 결제 — 표시 통화와 별개로 KRW로 환산 (xe.com 매월 1일 기준).
  const priceKrwForToss = Math.ceil(priceUsd * getCurrentFxRates().krwPerUsd);
  // suffix: lifetime/yearly 1회 결제는 t.once, monthly만 t.perMonth.
  const suffix = (plan === 'lifetime' || isYearlyOneTime)
    ? t.once
    : t.perMonth;

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
        amount: priceKrwForToss,
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

// [2026-05-03 Roy] AI 회사 콘솔 직접 한도 설정 카드.
// 디자인 의도(Steve Jobs 식): 강력한 한 줄 명제 + 1줄 설명 + 5개 프로바이더 행
// 각각 1-탭 [열기 ↗] 액션. 사용자가 인지하고(왜 필요한지) 행동(클릭)할 수 있게.
const PROVIDER_LIMIT_LINKS: Array<{ id: string; name: string; brand: string; url: string; hint_ko: string; hint_en: string }> = [
  { id: 'openai',    name: 'OpenAI',         brand: '#10A37F', url: 'https://platform.openai.com/settings/organization/limits',         hint_ko: 'GPT · DALL-E · gpt-image',     hint_en: 'GPT · DALL-E · gpt-image' },
  { id: 'anthropic', name: 'Anthropic',      brand: '#C65A3C', url: 'https://console.anthropic.com/settings/limits',                    hint_ko: 'Claude (Opus · Sonnet · Haiku)', hint_en: 'Claude (Opus · Sonnet · Haiku)' },
  { id: 'google',    name: 'Google AI',      brand: '#4285F4', url: 'https://console.cloud.google.com/billing/budgets',                 hint_ko: 'Gemini · Imagen',              hint_en: 'Gemini · Imagen' },
  { id: 'deepseek',  name: 'DeepSeek',       brand: '#5B6CFF', url: 'https://platform.deepseek.com/usage',                              hint_ko: 'DeepSeek V/R 시리즈',           hint_en: 'DeepSeek V/R series' },
  { id: 'groq',      name: 'Groq',           brand: '#F55036', url: 'https://console.groq.com/settings/limits',                         hint_ko: 'Llama · Mixtral 고속',          hint_en: 'Llama · Mixtral fast' },
];

function ProviderLimitsSection({ lang, t }: { lang: 'ko' | 'en' | 'ph'; t: Record<string, unknown> & typeof copy.ko }) {
  const headline = (t.providerLimitHeadline as string) ?? '';
  const desc     = (t.providerLimitDesc as string) ?? '';
  const title    = (t.providerLimitTitle as string) ?? '';
  const openLbl  = (t.providerLimitOpen as string) ?? 'Open';
  return (
    <section className="mb-12">
      <div
        className="rounded-2xl border p-6 md:p-8"
        style={{ background: tokens.surface, borderColor: tokens.border }}
      >
        <div className="mb-1 text-[15px] font-medium" style={{ color: tokens.text }}>
          {title}
        </div>
        {/* Steve Jobs 식: 큰 한 줄 명제. accent 컬러로 시선 끌기. */}
        <div
          className="mb-3 text-[22px] md:text-[26px] font-medium leading-tight tracking-[-0.01em]"
          style={{ color: tokens.text }}
        >
          {headline}
        </div>
        <div className="mb-6 text-[13px] leading-relaxed" style={{ color: tokens.textDim }}>
          {desc}
        </div>

        <div className="flex flex-col">
          {PROVIDER_LIMIT_LINKS.map((p, i) => (
            <a
              key={p.id}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-3 py-3.5 transition-colors hover:bg-black/[0.02]"
              style={{
                borderTop: i === 0 ? `1px solid ${tokens.border}` : undefined,
                borderBottom: `1px solid ${tokens.border}`,
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="inline-block shrink-0 rounded-full"
                  style={{ background: p.brand, width: 10, height: 10 }}
                />
                <div className="min-w-0">
                  <div className="text-[14px] font-medium truncate" style={{ color: tokens.text }}>
                    {p.name}
                  </div>
                  <div className="text-[12px] truncate" style={{ color: tokens.textFaint }}>
                    {lang === 'ko' ? p.hint_ko : p.hint_en}
                  </div>
                </div>
              </div>
              <span
                className="shrink-0 inline-flex items-center gap-1 text-[13px] font-medium whitespace-nowrap"
                style={{ color: tokens.accent }}
              >
                {openLbl}
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M7 17L17 7" />
                  <path d="M8 7h9v9" />
                </svg>
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

// [2026-05-02 Roy] KV 통합 뷰 컬럼 — 어제/이번주/전체 누적 표시.
function KvCol({ label, cost, reqs, lang, isPh = false }: { label: string; cost: number; reqs: number; lang: 'ko' | 'en' | 'ph'; isPh?: boolean }) {
  // [2026-05-02 Roy] 라벨/건수 텍스트를 '이번 달' 헤더(13px)와 통일.
  // 이전: label 12px / reqs 11px → 너무 작음, 가독성 낮음.
  // [2026-05-05 PM-30 Roy] 단일 통화 표시 — fmtMoney가 lang별 ₩/$/₱ 처리.
  // isPh prop은 무시 (backward compat). 작은 cost (< $0.01)는 fmtUsd가 '<$0.01'로 처리.
  void isPh;
  const priceText = fmtMoney(cost, lang);
  return (
    <div>
      <div className="text-[13px] mb-1" style={{ color: tokens.textDim }}>{label}</div>
      <div className="text-[20px] font-medium" style={{ color: tokens.text }}>
        {priceText}
      </div>
      <div className="text-[13px]" style={{ color: tokens.textFaint }}>
        {reqs}{lang === 'ko' ? '건' : ' requests'}
      </div>
    </div>
  );
}

// ── [2026-05-05 Roy PM-29] Savings 메뉴 최상단 플랜 카드 ───────────────
// 6개월 $39 ($6.50/월) [추천] / 월간 $9 — 화살표 클릭 시 billing 메뉴 이동.
// AI 사용료는 원가 그대로 (마진 0%) footnote.
// [2026-05-05 PM-31 Roy] SavingsPlanCard — PRICING USD에서 동적 가격 + lang 단일 통화.
// 이전 PM-29: 카피에 '$39' / '$9' / '$6.50/월' 하드코딩 → ph 페이지에 $ 노출 원인.
// 6개월 카드: 가격 + 월 단가 (= 6개월 가격 ÷ 6, ceil) + 할인 % badge.
function SavingsPlanCard({ t, lang }: {
  t: typeof copy.ko | typeof copy.en | typeof copy.ph;
  lang: 'ko' | 'en' | 'ph';
}) {
  const goBilling = () => {
    window.dispatchEvent(new CustomEvent('d1:nav-to', { detail: { view: 'billing' } }));
  };
  // 6개월 가격은 1회 결제 — 월 단가는 표시용 effective rate (정확 환율 기반 ceil).
  // 6개월 USD → effective monthly USD → fmtMoney로 lang 변환.
  const semiTotalUsd  = PRICING.lifetime.onceUsd;
  const semiPerMoUsd  = semiTotalUsd / 6;
  const monthlyUsd    = PRICING.pro.monthlyUsd;
  const semiPriceLabel  = fmtMoney(semiTotalUsd, lang);
  const semiPerMoLabel  = fmtMoney(semiPerMoUsd, lang);
  const monthlyLabel    = fmtMoney(monthlyUsd, lang);
  const discountLabel   = t.savingsPlanDiscountFmt(PRICING.discount.semiYearlyPct);
  return (
    <section className="mb-10">
      <div
        className="rounded-2xl border p-6 md:p-8"
        style={{ background: tokens.surface, borderColor: tokens.border }}
      >
        <div className="text-[13px] mb-5" style={{ color: tokens.textDim }}>
          {t.savingsPlanTitle}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Smarter — 6개월 (추천 + 할인 %) */}
          <button
            type="button"
            onClick={goBilling}
            title={t.savingsPlanGoTitle}
            className="group relative flex items-center justify-between rounded-xl border p-5 text-left transition-all hover:-translate-y-0.5"
            style={{
              background: tokens.surfaceAlt,
              borderColor: tokens.accent,
              borderWidth: 1.5,
            }}
          >
            <span
              className="absolute -top-2 left-4 flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ background: tokens.accent, color: '#fff' }}
            >
              {t.savingsPlanSemiBadge}
              <span style={{ opacity: 0.85 }}>· {discountLabel}</span>
            </span>
            <div className="flex flex-col gap-1">
              <span className="text-[13px]" style={{ color: tokens.textDim }}>
                {t.savingsPlanSemiName}
              </span>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-[28px] md:text-[32px] font-semibold leading-none" style={{ color: tokens.text }}>
                  {semiPriceLabel}
                </span>
                <span className="text-[13px]" style={{ color: tokens.textDim }}>
                  ({semiPerMoLabel}{t.savingsPlanPerMoSuffix})
                </span>
              </div>
            </div>
            {/* [2026-05-05 PM-45 Roy] 잡스 스타일 — 채워진 pill 안에 chevron.
                Smarter 카드는 accent (#d97757) 채워진 원, hover 시 살짝 슬라이드. */}
            <span
              aria-hidden
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200 group-hover:translate-x-0.5 group-hover:scale-105"
              style={{ background: '#d97757', color: '#fff' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </span>
          </button>

          {/* 월간 */}
          <button
            type="button"
            onClick={goBilling}
            title={t.savingsPlanGoTitle}
            className="group flex items-center justify-between rounded-xl border p-5 text-left transition-all hover:-translate-y-0.5"
            style={{ background: tokens.surfaceAlt, borderColor: tokens.border }}
          >
            <div className="flex flex-col gap-1">
              <span className="text-[13px]" style={{ color: tokens.textDim }}>
                {t.savingsPlanMonthName}
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-[28px] md:text-[32px] font-semibold leading-none" style={{ color: tokens.text }}>
                  {monthlyLabel}
                </span>
                <span className="text-[13px]" style={{ color: tokens.textDim }}>
                  {t.savingsPlanPerMoSuffix}
                </span>
              </div>
            </div>
            {/* [2026-05-05 PM-45 Roy] 잡스 스타일 — outlined pill (월간 카드).
                옅은 border + chevron, hover 시 살짝 슬라이드. Smarter와 hierarchy 차이. */}
            <span
              aria-hidden
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all duration-200 group-hover:translate-x-0.5 group-hover:bg-black/[0.04]"
              style={{ borderColor: tokens.borderStrong, color: tokens.text }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </span>
          </button>
        </div>
        <div className="mt-4 text-[12px]" style={{ color: tokens.textFaint }}>
          {t.savingsPlanFootnote}
        </div>
      </div>
    </section>
  );
}

function EmptyState({ lang }: { lang: 'ko' | 'en' | 'ph' }) {
  const t = lang === 'ko' ? copy.ko : lang === 'ph' ? copy.ph : copy.en;
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
  lang: 'ko' | 'en' | 'ph';
  onSave: (usd: number) => void;
  t: typeof copy[keyof typeof copy];
}) {
  // [2026-05-05 PM-30 Roy] 표시 통화는 lang에 따라 KRW / USD / PHP 단일.
  // 입력 받을 때도 같은 통화로 받음 → USD로 변환해 저장.
  const fxKrwPerUsd = getCurrentFxRates().krwPerUsd;
  const fxPhpPerUsd = getCurrentFxRates().phpPerUsd;

  const draftFromValue = (usd: number): string => {
    if (usd <= 0) return '';
    if (lang === 'ko') return String(Math.round(usd * fxKrwPerUsd));
    if (lang === 'ph') return String(Math.round(usd * fxPhpPerUsd));
    return String(usd);
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
      const usd = lang === 'ko' ? n / fxKrwPerUsd : lang === 'ph' ? n / fxPhpPerUsd : n;
      // Sanity cap: $10,000/day — clearly above any realistic limit
      const capped = Math.min(usd, 10000);
      onSave(capped);
    }
    setEditing(false);
  }

  function cancel() {
    setEditing(false);
    setDraft(draftFromValue(valueUsd));
  }

  const displayLabel = valueUsd > 0 ? fmtMoney(valueUsd, lang) : t.notSet;

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
