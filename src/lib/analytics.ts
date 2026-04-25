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
