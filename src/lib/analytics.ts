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
// 채팅 응답 완료 시마다 호출 → Cloudflare counter가 시간/일별 + 국가/OS
// 별로 KV에 집계 → daily-telegram-report.mjs가 새 섹션으로 append.
//
// 용량 부담: usage_record는 모델 응답마다 1회 호출되므로 빈도 높음. props 최소화
// (provider/model/in/out/cost) + keepalive로 페이지 떠나도 발송 보장.
//
// owner 구분 제거 (2026-05-02 Roy 결정) — per-device 콘솔 setup 부담 회피.
// 모든 데이터는 전체 합산으로 누적되며 Roy 본인 데이터도 KR/macOS 등 자동
// 분류돼 국가/OS 분포에 함께 표시됨.
// ──────────────────────────────────────────────────────────────────

function detectOS(): string {
  if (typeof window === 'undefined') return 'other';
  const ua = navigator.userAgent ?? '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'other';
}

export interface UsageEventInput {
  provider: string;        // 'openai' | 'anthropic' | 'google' | 'deepseek' | 'groq'
  model: string;           // resolved model id
  inputTokens: number;
  outputTokens: number;
  cost: number;            // USD
}

/**
 * AI 호출 1회 통합 추적 — chat-api 외 경로(이미지/STT/TTS/회의 등)에서 사용.
 * - localStorage 'blend:usage' (Billing 화면 + 한도 enforcement)
 * - Cloudflare KV (Telegram 비즈니스 리포트)
 * 두 곳 다 한 번에 기록. 토큰 기반(chat) 또는 flat-cost(이미지/오디오) 모두 OK.
 */
export function recordApiUsage(usage: UsageEventInput): void {
  if (typeof window === 'undefined') return;
  // 0/0/0 노이즈 방지
  if (usage.cost <= 0 && usage.inputTokens === 0 && usage.outputTokens === 0) return;
  // 1) Cloudflare KV (텔레그램 리포트)
  trackUsage(usage);
  // 2) localStorage (Billing 화면)
  import('@/stores/usage-store').then(({ useUsageStore }) => {
    useUsageStore.getState().addRecord({
      timestamp: Date.now(),
      model: usage.model,
      provider: usage.provider,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cost: usage.cost,
      chatId: 'api',
    });
  }).catch(() => {});
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

  const body = {
    provider: String(usage.provider).slice(0, 32),
    model: String(usage.model).slice(0, 64),
    inputTokens: Math.max(0, Math.round(usage.inputTokens)),
    outputTokens: Math.max(0, Math.round(usage.outputTokens)),
    cost: Math.max(0, usage.cost),
    os: detectOS(),
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

/**
 * 1회용 마이그레이션 — localStorage 'blend:usage'에 누적된 과거 사용량을
 * Cloudflare KV에 backdate 누적. Roy가 본인 디바이스에서 1회만 실행.
 *
 * 사용법 (Roy 콘솔):
 *   await migrateBlendUsage()       // 90일치 (기본)
 *   await migrateBlendUsage(30)     // 최근 30일치만
 *
 * - 각 record의 timestamp를 KST 날짜/시간으로 변환해 worker에 dateOverride/hourOverride 전달
 * - 같은 디바이스에서 두 번 실행하면 중복 누적되니 1회만 실행 — 안전장치로 마지막 실행
 *   기록을 localStorage 'blend:usage-migrated'에 저장. 이미 마이그레이션 했으면 거부.
 */
export async function migrateBlendUsage(daysBack = 90): Promise<{
  migrated: number;
  skipped: number;
  failed: number;
}> {
  if (typeof window === 'undefined') return { migrated: 0, skipped: 0, failed: 0 };
  if (!COUNTER_ENDPOINT) {
    console.warn('[migrate] COUNTER_ENDPOINT not configured');
    return { migrated: 0, skipped: 0, failed: 0 };
  }

  const MIGRATED_KEY = 'blend:usage-migrated';
  const lastMigrated = localStorage.getItem(MIGRATED_KEY);
  if (lastMigrated) {
    const ok = confirm(
      `이미 ${lastMigrated}에 마이그레이션 완료. 또 실행하면 중복 누적됩니다. 계속할까요?`
    );
    if (!ok) {
      console.log('[migrate] aborted (already migrated at', lastMigrated, ')');
      return { migrated: 0, skipped: 0, failed: 0 };
    }
  }

  const raw = localStorage.getItem('blend:usage');
  if (!raw) {
    console.log('[migrate] no blend:usage records');
    return { migrated: 0, skipped: 0, failed: 0 };
  }

  let records: Array<{
    timestamp: number;
    model: string;
    provider: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
  }>;
  try {
    records = JSON.parse(raw);
  } catch (e) {
    console.error('[migrate] parse failed:', e);
    return { migrated: 0, skipped: 0, failed: 0 };
  }

  const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;
  const target = records.filter((r) => r.timestamp >= cutoff);
  console.log(`[migrate] ${target.length} records in last ${daysBack} days (of ${records.length} total)`);

  let migrated = 0, skipped = 0, failed = 0;
  const os = detectOS();

  for (const r of target) {
    if (!r.cost && !r.inputTokens && !r.outputTokens) {
      skipped++;
      continue;
    }
    // KST 날짜/시간 추출
    const kst = new Date(r.timestamp + 9 * 60 * 60 * 1000);
    const dateOverride = kst.toISOString().slice(0, 10);
    const hourOverride = kst.getUTCHours();

    try {
      const res = await fetch(`${COUNTER_ENDPOINT}/track-usage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: r.provider,
          model: r.model,
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          cost: r.cost,
          os,
          dateOverride,
          hourOverride,
        }),
      });
      if (res.ok) migrated++;
      else { failed++; console.warn('[migrate] failed', res.status, dateOverride); }
    } catch (e) {
      failed++;
      console.warn('[migrate] error', e);
    }
    // 폭주 방지 — 짧은 간격
    if ((migrated + failed) % 20 === 0) await new Promise(r => setTimeout(r, 100));
  }

  localStorage.setItem(MIGRATED_KEY, new Date().toISOString());
  console.log(`[migrate] done — migrated=${migrated}, skipped=${skipped}, failed=${failed}`);
  return { migrated, skipped, failed };
}

if (typeof window !== 'undefined') {
  // Roy 콘솔 편의 — `migrateBlendUsage()` 호출 가능
  (window as unknown as { migrateBlendUsage?: typeof migrateBlendUsage }).migrateBlendUsage = migrateBlendUsage;

  // [2026-05-02 Roy] URL hash trigger — iPhone Safari 등 콘솔 접근 어려운
  // 디바이스용. 사용자가 `blend.ai4min.com/...#migrate-usage` URL 접속하면
  // 자동으로 마이그레이션 실행 + 결과 alert + 해시 클리어(refresh 시 재실행 방지).
  // 중복 가드는 migrateBlendUsage 내부의 'blend:usage-migrated'로 처리됨.
  const triggerHash = '#migrate-usage';
  if (window.location.hash === triggerHash) {
    // 페이지 마운트 직후 한 박자 두고 실행 — analytics.ts가 import되는 시점이
    // 너무 빨라서 React mount 전이면 fetch 실패 가능성 있음.
    setTimeout(() => {
      migrateBlendUsage().then((result) => {
        const msg =
          `✅ 마이그레이션 완료\n\n` +
          `• 푸시 성공: ${result.migrated}건\n` +
          `• 건너뜀: ${result.skipped}건\n` +
          `• 실패: ${result.failed}건\n\n` +
          (result.migrated === 0
            ? '이 디바이스에 누적된 사용 기록이 없거나, 이미 마이그레이션 완료한 디바이스예요.'
            : '텔레그램 비즈니스 리포트에 반영됐어요.');
        alert(msg);
        // 해시 제거 — 새로고침/북마크로 재실행 방지
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }).catch((e) => {
        alert(`마이그레이션 실패: ${e?.message ?? e}`);
      });
    }, 1500);
  }
}
