// [2026-05-05 Roy PM-30] Currency 단일 source of truth.
//
// 정책 (Roy PM-30 결정):
//   1) 모든 가격의 base 단위는 USD ($).
//   2) 화면 표시는 lang에 따라 단일 통화만 — 혼합 표시 금지:
//      - 'ko' → KRW (₩) only
//      - 'en' → USD ($) only
//      - 'ph' → PHP (₱) only
//   3) 환율은 매월 1일 xe.com 기준으로 고정, 그 달 말일까지 유지.
//      운영자가 매월 1일 새 rate 추가 → 자동 적용.
//
// 갱신 절차 (매월 1일):
//   1. https://www.xe.com/currencytables/?from=USD&date=YYYY-MM-01 방문
//   2. KRW + PHP 값 확인
//   3. MONTHLY_FX_RATES 배열에 새 entry 추가 (effectiveFrom = 'YYYY-MM-01')
//   4. commit → vercel deploy
//
// 미래 자동화 가능: 3-hour cron이 xe.com (또는 free FX API) 호출 →
// next month rate prefetch → 자동 PR. 현재는 수동.

export type CurrencyLang = 'ko' | 'en' | 'ph' | string;

export interface FxRate {
  /** 효력 시작일 (YYYY-MM-01). 이 날짜부터 다음 entry 시작일까지 유효. */
  effectiveFrom: string;
  /** 1 USD = N KRW */
  krwPerUsd: number;
  /** 1 USD = N PHP */
  phpPerUsd: number;
  /** 갱신 source (보통 'xe.com'). */
  source: string;
}

/**
 * 매월 1일 xe.com 기준 환율 — 최신을 배열 끝에 append.
 * 코드는 "현재 날짜 ≥ effectiveFrom" 중 가장 최신을 사용.
 *
 * [2026-05-01 PM-30] xe.com:
 *   1 USD = 1469.74 KRW
 *   1 USD = 61.23 PHP
 */
export const MONTHLY_FX_RATES: FxRate[] = [
  { effectiveFrom: '2026-05-01', krwPerUsd: 1469.74, phpPerUsd: 61.23, source: 'xe.com' },
];

/**
 * 현재 날짜 (또는 주어진 날짜)에 적용되는 환율 반환.
 * effectiveFrom <= now 중 가장 최신을 사용. 미래 entry는 무시.
 */
export function getCurrentFxRates(now: Date = new Date()): FxRate {
  const today = now.toISOString().slice(0, 10); // 'YYYY-MM-DD'
  // effective ≤ today 인 entry 중 마지막을 사용
  let best: FxRate | undefined;
  for (const rate of MONTHLY_FX_RATES) {
    if (rate.effectiveFrom <= today) best = rate;
  }
  // 안전장치 — 빈 배열이거나 모두 미래면 첫 entry 사용
  return best ?? MONTHLY_FX_RATES[0];
}

/**
 * USD → 표시 통화 변환. lang에 따라 단일 통화만 반환.
 *
 * 표시 규칙 (Roy PM-30):
 *   - 'ko' → ₩X (정수, 소수 없음, **올림**)
 *   - 'en' → $X (소수 있으면 .XX 까지, 정수면 소수 없음)
 *   - 'ph' → ₱X (정수, 소수 없음, **올림**)
 *
 * [2026-05-05 Roy 추가] KRW/PHP 변환 시 소수점 없애고 올림(ceiling) — "마지막 자리는
 * 반올림하여 높이자" 정책. 이유: 미세 환차로 가격이 낮아 보이는 것 방지.
 *
 * Examples (xe.com 2026-05-01: 1 USD = 1469.74 KRW, 61.23 PHP):
 *   formatPrice(9, 'ko')   → '₩13,228'  (9 × 1469.74 = 13227.66 → ceil 13228)
 *   formatPrice(9, 'en')   → '$9'
 *   formatPrice(9, 'ph')   → '₱552'     (9 × 61.23 = 551.07 → ceil 552)
 *   formatPrice(6.5, 'ko') → '₩9,554'   (6.5 × 1469.74 = 9553.31 → ceil 9554)
 *   formatPrice(6.5, 'en') → '$6.50'
 *   formatPrice(39, 'ph')  → '₱2,388'   (39 × 61.23 = 2387.97 → ceil 2388)
 */
export function formatPrice(usd: number, lang: CurrencyLang, opts?: { noSymbol?: boolean }): string {
  const fx = getCurrentFxRates();
  const noSymbol = opts?.noSymbol ?? false;

  if (lang === 'ko') {
    const krw = Math.ceil(usd * fx.krwPerUsd); // [PM-30] 올림
    const formatted = krw.toLocaleString('ko-KR');
    return noSymbol ? formatted : `₩${formatted}`;
  }

  if (lang === 'ph') {
    const php = Math.ceil(usd * fx.phpPerUsd); // [PM-30] 올림
    const formatted = php.toLocaleString('en-PH');
    return noSymbol ? formatted : `₱${formatted}`;
  }

  // Default 'en' / unknown lang → USD (반올림 OK — base 통화)
  // 소수가 있으면 .XX 까지, 정수면 소수점 없음
  const isInt = Math.abs(usd - Math.round(usd)) < 0.005;
  const formatted = isInt ? Math.round(usd).toString() : usd.toFixed(2);
  return noSymbol ? formatted : `$${formatted}`;
}

/**
 * "/월" 같은 suffix 포함 변환. 라벨은 lang별로:
 *   ko → '/월', en → '/mo', ph → '/buwan'
 */
export function formatPricePerMonth(usd: number, lang: CurrencyLang): string {
  const price = formatPrice(usd, lang);
  const suffix = lang === 'ko' ? '/월' : lang === 'ph' ? '/buwan' : '/mo';
  return `${price}${suffix}`;
}

/** 현재 환율 source 표시용 (UI footer 등): "xe.com 2026-05-01 기준" */
export function getCurrentFxLabel(lang: CurrencyLang): string {
  const fx = getCurrentFxRates();
  if (lang === 'ko') return `환율 ${fx.source} ${fx.effectiveFrom} 기준`;
  if (lang === 'ph') return `Exchange rate ${fx.source} as of ${fx.effectiveFrom}`;
  return `FX from ${fx.source}, effective ${fx.effectiveFrom}`;
}
