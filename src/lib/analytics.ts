'use client';

// Blend Analytics — Vercel Analytics + Cloudflare counter (Tori 명세 v2 2026-04-25)
// 옵트아웃: localStorage 'blend:analytics-disabled'.
// 모든 호출 silent fail — 사용자 경험 절대 방해 X.

import { track } from '@vercel/analytics';

const ANALYTICS_DISABLED_KEY = 'blend:analytics-disabled';
const USER_ID_KEY    = 'blend:anonymous-user-id';
const VISIT_TODAY_KEY = 'blend:last-visit-date';

const COUNTER_ENDPOINT = process.env.NEXT_PUBLIC_BLEND_COUNTER_URL ?? '';

function isDisabled(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(ANALYTICS_DISABLED_KEY) === 'true';
}

// UUID v4 (외부 라이브러리 X)
function generateUserId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getUserId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(USER_ID_KEY);
  if (!id) {
    id = generateUserId();
    localStorage.setItem(USER_ID_KEY, id);
  }
  return id;
}

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

/**
 * 방문 추적 — 페이지 첫 로드 시 1회 호출.
 * 같은 KST 날짜에는 중복 호출 안 함 (localStorage 체크).
 */
export function trackVisit(): void {
  if (isDisabled()) return;
  if (typeof window === 'undefined') return;
  if (!COUNTER_ENDPOINT) return;

  const today = todayKST();
  if (localStorage.getItem(VISIT_TODAY_KEY) === today) return;

  const userId = getUserId();
  try {
    fetch(`${COUNTER_ENDPOINT}/track-visit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
      keepalive: true,
    })
      .then(() => {
        localStorage.setItem(VISIT_TODAY_KEY, today);
      })
      .catch(() => {});
  } catch {}
}

/**
 * 이벤트 추적 — Vercel + Cloudflare 병행. 두 곳 모두 silent fail.
 */
export function trackEvent(
  name: string,
  props?: Record<string, string | number | boolean>,
): void {
  if (isDisabled()) return;

  // 1. Vercel Analytics
  try {
    track(name, props);
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[analytics/vercel]', e);
    }
  }

  // 2. Cloudflare Worker (사용자 폰에서 직접 push, keepalive)
  if (COUNTER_ENDPOINT) {
    try {
      fetch(`${COUNTER_ENDPOINT}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: name, props }),
        keepalive: true,
      }).catch(() => {});
    } catch {}
  }
}

export function setAnalyticsDisabled(disabled: boolean): void {
  if (typeof window === 'undefined') return;
  if (disabled) {
    localStorage.setItem(ANALYTICS_DISABLED_KEY, 'true');
  } else {
    localStorage.removeItem(ANALYTICS_DISABLED_KEY);
  }
}

export function isAnalyticsDisabled(): boolean {
  return isDisabled();
}

// ──────────────────────────────────────────────────────────────────
// AI 사용 비용 추적 (2026-05-02 Roy)
// 채팅 응답 완료 시마다 호출 → Cloudflare counter가 시간/일별 + 국가/OS/owner
// 별로 KV에 집계 → daily-telegram-report.mjs가 새 섹션으로 append.
//
// 용량 부담: usage_record는 모델 응답마다 1회 호출되므로 빈도 높음. props 최소화
// (provider/model/in/out/cost) + keepalive로 페이지 떠나도 발송 보장.
//
// Owner 식별: localStorage 'blend:is-owner'='true' (Roy가 본인 기기 한 번 콘솔에서
// 세팅). 그 외 사용자는 익명 분포(country/os)로만 집계 — 서버에 PII 저장 X.
// ──────────────────────────────────────────────────────────────────

const OWNER_FLAG_KEY = 'blend:is-owner';

function isOwner(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(OWNER_FLAG_KEY) === 'true';
}

/** Roy 본인 기기 한 번 콘솔에서 호출: setBlendOwner(true) */
export function setBlendOwner(owner: boolean): void {
  if (typeof window === 'undefined') return;
  if (owner) localStorage.setItem(OWNER_FLAG_KEY, 'true');
  else localStorage.removeItem(OWNER_FLAG_KEY);
}

if (typeof window !== 'undefined') {
  // 디버그/세팅 편의 — `setBlendOwner(true)` 콘솔에서 직접 호출 가능.
  (window as unknown as { setBlendOwner?: typeof setBlendOwner }).setBlendOwner = setBlendOwner;
}

export interface UsageEventInput {
  provider: string;        // 'openai' | 'anthropic' | 'google' | 'deepseek' | 'groq'
  model: string;           // resolved model id
  inputTokens: number;
  outputTokens: number;
  cost: number;            // USD
}

/**
 * AI 호출 1회 분 사용량을 Cloudflare counter로 push.
 * - 비용은 서버 측에서 다시 계산하지 않고 client에서 받은 값을 그대로 누적
 *   (registry pricing 자체가 client에 있어 server에 중복 둘 이유 X).
 * - country는 CF가 헤더로 자동 주입(CF-IPCountry) → worker에서 처리.
 * - os는 navigator.userAgent에서 client가 추출해 전달.
 */
export function trackUsage(usage: UsageEventInput): void {
  if (isDisabled()) return;
  if (typeof window === 'undefined') return;
  if (!COUNTER_ENDPOINT) return;
  // 0 cost / 0 token은 의미 없음 — 노이즈 차단
  if (usage.cost <= 0 && usage.inputTokens === 0 && usage.outputTokens === 0) return;

  const ua = navigator.userAgent ?? '';
  let os = 'other';
  if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Linux/i.test(ua)) os = 'Linux';

  const body = {
    provider: String(usage.provider).slice(0, 32),
    model: String(usage.model).slice(0, 64),
    inputTokens: Math.max(0, Math.round(usage.inputTokens)),
    outputTokens: Math.max(0, Math.round(usage.outputTokens)),
    cost: Math.max(0, usage.cost),
    isOwner: isOwner(),
    os,
    // 시간 bucket은 worker에서 KST 변환해서 결정 (클라이언트 시계 신뢰 X)
  };

  try {
    fetch(`${COUNTER_ENDPOINT}/track-usage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}
