'use client';

// Phase 5.0 — Vercel Analytics 통합 (Tori 명세 Komi_Phase5_Analytics_2026-04-25.md)
// 익명 집계만. 옵트아웃 → localStorage 'blend:analytics-disabled'.

import { track } from '@vercel/analytics';

const ANALYTICS_DISABLED_KEY = 'blend:analytics-disabled';

function isDisabled(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(ANALYTICS_DISABLED_KEY) === 'true';
}

export function trackEvent(
  name: string,
  props?: Record<string, string | number | boolean>,
): void {
  if (isDisabled()) return;
  try {
    track(name, props);
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[analytics] track failed:', e);
    }
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
