// [2026-05-05 PM-46 Phase 5 Roy] 비즈니스 인사이트 엔진.
// "흩어진 점들에서 선과 면을" — 단순 숫자 노출 X, AI가 의미 추출.
//
// 각 generator: 데이터 받아 결과 string | null. null이면 해당 인사이트 skip
// (데이터 부족, 의미 없음 등). Daily/Weekly/Monthly 모두 재사용.

import type { UsageDetailed, MonthSummary } from '../types';

// 환율 — Phase 5 currency module과 동기화 (xe.com 매월 1일 갱신)
const KRW_PER_USD = 1469.74;

// 외부 산업 평균 — typical AI chat per-message cost benchmark (대략).
const INDUSTRY_AVG_COST_PER_MSG_USD = 0.005; // ~₩7

// 구독 플랜 — Smarter monthly $8 (PM-31 가격). break-even 비교용.
const SUBSCRIPTION_PRICE_USD = 8;

const PROVIDER_LABEL: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  deepseek: 'DeepSeek',
  groq: 'Groq',
};

// ═══════ 유틸 ═══════
export function fmtKrw(usd: number): string {
  if (usd <= 0) return '₩0';
  return `₩${Math.ceil(usd * KRW_PER_USD).toLocaleString('ko-KR')}`;
}
export function fmtUsd(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd < 0.01) return '<$0.01';
  return `$${usd.toFixed(2)}`;
}
export function fmtPct(ratio: number, fixed = 1): string {
  return `${(ratio * 100).toFixed(fixed)}%`;
}
export function fmtDelta(curr: number, prev: number): { text: string; arrow: string; pct: number } {
  if (prev === 0) {
    return curr > 0
      ? { text: '신규', arrow: '🆕', pct: Infinity }
      : { text: '동일', arrow: '–', pct: 0 };
  }
  const pct = ((curr - prev) / prev);
  const arrow = pct > 0.05 ? '↑' : (pct < -0.05 ? '↓' : '–');
  const sign = pct > 0 ? '+' : '';
  return { text: `${sign}${(pct * 100).toFixed(1)}%`, arrow, pct };
}

export function providerLabel(p: string): string {
  return PROVIDER_LABEL[p] ?? p;
}

// ═══════ 1. 성장 속도 ═══════
// today vs yesterday vs 7-day baseline. 가속/안정/둔화 판단.
export function insightGrowth(
  today: UsageDetailed,
  yesterday: UsageDetailed | null,
  weekAvgRequests: number | null,
): string | null {
  if (today.totalRequests === 0) return null;
  if (!yesterday && weekAvgRequests === null) return null;

  const parts: string[] = [];
  if (yesterday) {
    const d = fmtDelta(today.totalRequests, yesterday.totalRequests);
    parts.push(`어제 대비 ${d.arrow} ${d.text}`);
  }
  if (weekAvgRequests !== null && weekAvgRequests > 0) {
    const d = fmtDelta(today.totalRequests, weekAvgRequests);
    parts.push(`7일 평균 대비 ${d.arrow} ${d.text}`);
  }
  if (parts.length === 0) return null;

  // 추세 판단
  let trend = '';
  if (yesterday && weekAvgRequests !== null && weekAvgRequests > 0) {
    const dToday = (today.totalRequests - weekAvgRequests) / weekAvgRequests;
    const dYesterday = (yesterday.totalRequests - weekAvgRequests) / weekAvgRequests;
    if (dToday > 0.2 && dToday > dYesterday) trend = ' (📈 가속)';
    else if (dToday < -0.2 && dToday < dYesterday) trend = ' (📉 둔화)';
    else trend = ' (➡️ 안정)';
  }
  return `📊 성장: ${parts.join(' · ')}${trend}`;
}

// ═══════ 2. 메시지당 비용 효율 ═══════
export function insightCostPerMsg(today: UsageDetailed): string | null {
  if (today.totalRequests === 0) return null;
  const cpm = today.totalCost / today.totalRequests;
  const ratio = cpm / INDUSTRY_AVG_COST_PER_MSG_USD;

  let verdict: string;
  if (ratio < 0.5) verdict = '✅ 산업 평균 대비 매우 효율적';
  else if (ratio < 1.0) verdict = '✅ 산업 평균보다 저렴';
  else if (ratio < 1.5) verdict = '➡️ 산업 평균 수준';
  else verdict = '⚠️ 산업 평균보다 비쌈 — 모델 mix 점검 권장';

  return `💵 메시지당 비용: ${fmtKrw(cpm)} (산업 평균 ~${fmtKrw(INDUSTRY_AVG_COST_PER_MSG_USD)}). ${verdict}`;
}

// ═══════ 3. Provider 집중도 (HHI) ═══════
// HHI = Σ(share^2). 0~1 사이. < 0.15 다양화 / 0.15~0.25 보통 / > 0.25 집중
export function insightConcentration(today: UsageDetailed): string | null {
  if (today.totalRequests === 0) return null;
  const total = today.totalRequests;
  const shares = Object.values(today.providers).map((v) => v.requests / total);
  if (shares.length === 0) return null;
  const hhi = shares.reduce((s, x) => s + x * x, 0);

  // 최대 비중 provider 찾기
  const sorted = Object.entries(today.providers)
    .map(([p, v]) => ({ p, share: v.requests / total }))
    .sort((a, b) => b.share - a.share);
  const top = sorted[0];

  let msg: string;
  if (hhi < 0.25) {
    msg = `다양화 양호 (HHI ${hhi.toFixed(2)})`;
  } else if (hhi < 0.40) {
    msg = `${providerLabel(top.p)}에 ${fmtPct(top.share, 0)} 의존 — 보통`;
  } else {
    msg = `⚠️ ${providerLabel(top.p)}에 ${fmtPct(top.share, 0)} 의존 — 가격 정책 변경 시 충격 클 수 있음`;
  }
  return `🔀 Provider 분산: ${msg}`;
}

// ═══════ 4. 모델 비용 효율 ═══════
// 가장 비싼 메시지 단가 모델 vs 가장 싼 모델 비교, 절약 잠재력 추정.
export function insightModelEfficiency(today: UsageDetailed): string | null {
  const models = Object.entries(today.models)
    .filter(([, v]) => v.requests > 0)
    .map(([m, v]) => ({ m, cpm: v.cost / v.requests, count: v.requests, total: v.cost }))
    .sort((a, b) => b.cpm - a.cpm);
  if (models.length < 2) return null;

  const expensive = models[0];
  const cheap = models[models.length - 1];
  if (expensive.cpm <= cheap.cpm * 1.5) return null; // 차이 적으면 skip

  // 비싼 모델을 싼 모델로 옮기면 절약액
  const potentialSaving = (expensive.cpm - cheap.cpm) * expensive.count;
  if (potentialSaving < 0.005) return null; // ₩7 미만이면 의미 없음

  return `💡 ${expensive.m}(₩${Math.ceil(expensive.cpm * KRW_PER_USD * 100) / 100}/msg) ↔ ${cheap.m}(₩${Math.ceil(cheap.cpm * KRW_PER_USD * 100) / 100}/msg). 단순 작업은 ${cheap.m}으로 옮기면 일 ${fmtKrw(potentialSaving)} 절약 잠재.`;
}

// ═══════ 5. 시간 패턴 + 글로벌 유입 기회 ═══════
export function insightTimePattern(today: UsageDetailed): string | null {
  const hourly = today.hourly ?? [];
  if (hourly.length === 0 || today.totalRequests === 0) return null;

  // 새벽 0-6시 사용 비율
  const dawn = hourly
    .filter((h) => parseInt(h.hour, 10) < 6)
    .reduce((s, h) => s + h.requests, 0);
  const dawnPct = dawn / today.totalRequests;

  // 활동 시간대 (5건 이상인 시간)
  const activeHours = hourly.filter((h) => h.requests >= Math.max(2, today.totalRequests * 0.05));
  const activeRange = activeHours.length > 0
    ? `${activeHours[0].hour}~${activeHours[activeHours.length - 1].hour}시`
    : '';

  if (dawnPct < 0.05 && today.totalRequests >= 20) {
    return `🌍 새벽 0~6시 활동 ${fmtPct(dawnPct, 0)} — 글로벌 사용자(미주/유럽) 미개척 시장. 영문 마케팅 강화 시 활동량 +20~40% 잠재.`;
  }
  if (activeRange) {
    return `⏰ 활동 시간대: ${activeRange} 집중. 새벽 ${fmtPct(dawnPct, 0)}.`;
  }
  return null;
}

// ═══════ 6. 구독 가치 비교 ═══════
// 오늘 BYOK로 ₩X 썼다면, 구독 모델($8/월 = ~₩12K) 대비 어떤지.
export function insightSubscriptionValue(today: UsageDetailed): string | null {
  if (today.totalRequests === 0) return null;
  const dailyKrw = today.totalCost * KRW_PER_USD;
  const subDailyKrw = (SUBSCRIPTION_PRICE_USD * KRW_PER_USD) / 30;

  if (dailyKrw < subDailyKrw * 0.3) {
    return `🎯 오늘 사용 ${fmtKrw(today.totalCost)} ≪ 구독 일할 ${fmtKrw(SUBSCRIPTION_PRICE_USD / 30)}. BYOK 사용자에게 매우 절약 — 마케팅 포인트.`;
  }
  if (dailyKrw > subDailyKrw * 1.5) {
    return `📌 오늘 사용 ${fmtKrw(today.totalCost)} > 구독 일할 ${fmtKrw(SUBSCRIPTION_PRICE_USD / 30)}. 헤비 유저에게 구독이 더 저렴 — 업그레이드 권유 시점.`;
  }
  return null;
}

// ═══════ 7. 월말 비용 추정 ═══════
export function insightMonthProjection(
  today: UsageDetailed,
  monthSoFar: MonthSummary | null,
): string | null {
  if (!monthSoFar || monthSoFar.totalRequests === 0) return null;

  // 오늘이 이번 달 며칠째인지 — date 'YYYY-MM-DD'에서 day 추출
  const dayOfMonth = parseInt(today.date.slice(8, 10), 10);
  if (dayOfMonth < 1 || dayOfMonth > 31) return null;

  const projectedCost = monthSoFar.totalCost * (30 / dayOfMonth);
  const projectedRequests = Math.round(monthSoFar.totalRequests * (30 / dayOfMonth));

  return `🔮 월말 추정: 메시지 ${projectedRequests.toLocaleString('ko-KR')}건 · 비용 ${fmtKrw(projectedCost)} (현재 ${dayOfMonth}일차 기준).`;
}

// ═══════ 8. 이상 감지 (spike/anomaly) ═══════
// 오늘 vs 7일 평균 비교 — 급증/급감 시 경고.
export function insightAnomaly(
  today: UsageDetailed,
  weekAvgRequests: number | null,
  weekAvgCost: number | null,
): string | null {
  if (today.totalRequests === 0) return null;
  if (weekAvgRequests === null || weekAvgCost === null || weekAvgRequests < 5) return null;

  const reqRatio = today.totalRequests / weekAvgRequests;
  const costRatio = weekAvgCost > 0 ? today.totalCost / weekAvgCost : 0;

  // 메시지 평이한데 비용만 폭증 = 비싼 모델 사용 증가
  if (reqRatio < 1.3 && costRatio > 2) {
    return `🚨 비용 이상: 메시지는 평소 수준인데 비용 ${costRatio.toFixed(1)}배 증가. 비싼 모델 사용 증가 의심 — 모델 분포 확인 필요.`;
  }
  // 트래픽 급증
  if (reqRatio > 3) {
    return `🚀 트래픽 급증: 7일 평균의 ${reqRatio.toFixed(1)}배. 캠페인 효과 / 신규 가입 / 봇 트래픽 점검.`;
  }
  // 트래픽 급감
  if (reqRatio < 0.3 && weekAvgRequests >= 20) {
    return `⚠️ 트래픽 급감: 7일 평균의 ${(reqRatio * 100).toFixed(0)}%. 서비스 장애 / 사용자 이탈 / 휴일 효과 확인.`;
  }
  return null;
}

// ═══════ 9. 국가별 분포 인사이트 ═══════
// 국가별 메시지 수 분포 → 글로벌 진입 신호 / 단일 국가 의존 위험.
const COUNTRY_LABEL: Record<string, string> = {
  KR: '🇰🇷 한국', US: '🇺🇸 미국', PH: '🇵🇭 필리핀', JP: '🇯🇵 일본',
  CN: '🇨🇳 중국', VN: '🇻🇳 베트남', IN: '🇮🇳 인도', GB: '🇬🇧 영국',
  DE: '🇩🇪 독일', FR: '🇫🇷 프랑스', SG: '🇸🇬 싱가포르', TW: '🇹🇼 대만',
  XX: '🌐 미상',
};
export function countryFlag(code: string): string {
  return COUNTRY_LABEL[code.toUpperCase()] ?? `🌐 ${code}`;
}
export function insightCountry(
  countries: Array<{ code: string; requests: number }>,
  totalRequests: number,
): string | null {
  if (countries.length === 0 || totalRequests === 0) return null;
  const sorted = [...countries].sort((a, b) => b.requests - a.requests);
  const top = sorted[0];
  const topShare = top.requests / totalRequests;

  if (sorted.length === 1) {
    return `🌍 국가: ${countryFlag(top.code)} 단독 ${fmtPct(topShare, 0)} — 단일 시장.`;
  }
  if (topShare > 0.85) {
    return `🌍 국가: ${countryFlag(top.code)} ${fmtPct(topShare, 0)} 의존 — 글로벌 확장 기회.`;
  }
  // top 3 보여주기
  const top3 = sorted.slice(0, 3).map((c) => `${countryFlag(c.code)} ${fmtPct(c.requests / totalRequests, 0)}`).join(', ');
  return `🌍 국가 분포: ${top3}`;
}

// ═══════ 10. OS별 분포 인사이트 ═══════
const OS_LABEL: Record<string, string> = {
  macos: '🍎 macOS', ios: '📱 iOS', windows: '🪟 Windows',
  android: '🤖 Android', linux: '🐧 Linux', other: '❓ 기타',
};
export function osLabel(os: string): string {
  return OS_LABEL[os.toLowerCase()] ?? os;
}
export function insightOs(
  oses: Array<{ os: string; requests: number }>,
  totalRequests: number,
): string | null {
  if (oses.length === 0 || totalRequests === 0) return null;
  const sorted = [...oses].sort((a, b) => b.requests - a.requests);
  const desktop = oses.filter((o) => ['macos', 'windows', 'linux'].includes(o.os.toLowerCase())).reduce((s, o) => s + o.requests, 0);
  const mobile = oses.filter((o) => ['ios', 'android'].includes(o.os.toLowerCase())).reduce((s, o) => s + o.requests, 0);

  const desktopPct = desktop / totalRequests;
  const mobilePct = mobile / totalRequests;

  if (mobilePct > 0.6) {
    return `📱 모바일 중심: 모바일 ${fmtPct(mobilePct, 0)} / 데스크톱 ${fmtPct(desktopPct, 0)}. 짧은 메시지 / 음성 입력 UX 최적화 필요.`;
  }
  if (desktopPct > 0.85) {
    return `💻 데스크톱 중심 ${fmtPct(desktopPct, 0)}. 모바일 PWA / iOS 앱 침투 시 사용자 +2~3x 잠재.`;
  }
  const top = sorted.slice(0, 3).map((o) => `${osLabel(o.os)} ${fmtPct(o.requests / totalRequests, 0)}`).join(', ');
  return `🖥️ OS: ${top}`;
}

// ═══════ 11. 코호트 리텐션 인사이트 ═══════
// KV에서 firstVisit + active 데이터를 받아 D+1, D+7, D+30 리텐션 계산.
export interface CohortRetention {
  cohortDate: string;       // 가입일 'YYYY-MM-DD'
  cohortSize: number;       // 가입자 수
  d1Active: number;         // 다음날 활성
  d7Active: number;         // 7일 뒤 활성
  d30Active: number;        // 30일 뒤 활성
}
export function insightRetention(cohorts: CohortRetention[]): string | null {
  if (cohorts.length === 0) return null;

  // 충분히 시간이 지난 코호트만 평균 (D+30 측정 가능 = 가입 30일+ 경과)
  const totalSize = cohorts.reduce((s, c) => s + c.cohortSize, 0);
  if (totalSize < 5) return null; // 표본 부족

  const d1 = cohorts.reduce((s, c) => s + c.d1Active, 0) / totalSize;
  const d7 = cohorts.reduce((s, c) => s + c.d7Active, 0) / totalSize;
  const d30 = cohorts.reduce((s, c) => s + c.d30Active, 0) / totalSize;

  let verdict = '';
  if (d7 < 0.20) verdict = ' ⚠️ D+7 < 20% — onboarding 강화 필요.';
  else if (d30 > 0.40) verdict = ' ✅ 강력한 리텐션 (sticky product).';

  return `🔁 리텐션: D+1 ${fmtPct(d1, 0)} / D+7 ${fmtPct(d7, 0)} / D+30 ${fmtPct(d30, 0)}${verdict}`;
}

// ═══════ 핵심 액션 권고 ═══════
// 위 인사이트들을 보고 최우선 한 줄 액션 도출.
export function insightTopAction(
  today: UsageDetailed,
  _yesterday: UsageDetailed | null,
  weekAvgRequests: number | null,
): string {
  if (today.totalRequests === 0) {
    return '📭 오늘 활동 없음 — 마케팅 채널 점검 권장.';
  }
  if (today.totalRequests < 10) {
    return '🌱 초기 단계 — 기능 안정성 + 첫 사용자 경험 집중.';
  }
  if (weekAvgRequests !== null && today.totalRequests > weekAvgRequests * 2) {
    return '🚀 트래픽 급증 단계 — 서버 모니터링 + 비용 한도 알람 확인.';
  }
  // Provider 집중도 높을 때
  const total = today.totalRequests;
  const shares = Object.values(today.providers).map((v) => v.requests / total);
  const hhi = shares.reduce((s, x) => s + x * x, 0);
  if (hhi > 0.5) {
    const top = Object.entries(today.providers)
      .sort((a, b) => b[1].requests - a[1].requests)[0];
    return `⚖️ ${providerLabel(top[0])} 의존도 ${fmtPct(top[1].requests / total, 0)} — provider 다양화 또는 fallback 전략 점검.`;
  }
  return '✅ 핵심 지표 안정. 다음 마일스톤(런칭/마케팅) 추진.';
}
