// [2026-04-26 Tori 16384118 §3.10] 자정 (KST) 자동 리셋 + 일시정지 자동 재개.
// loadFromStorage 자체에 자정 검사가 있으므로 이 모듈은 "앱 실행 중 자정 통과"
// 케이스를 위한 setTimeout 스케줄러.

import { useCostStore } from '@/stores/d1-cost-store';

let timer: ReturnType<typeof setTimeout> | null = null;

function msUntilNextMidnightKST(): number {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const kstTomorrow = new Date(kstNow);
  kstTomorrow.setUTCDate(kstTomorrow.getUTCDate() + 1);
  kstTomorrow.setUTCHours(0, 0, 0, 0);
  return kstTomorrow.getTime() - kstNow.getTime();
}

export function setupDailyReset() {
  if (typeof window === 'undefined') return;
  if (timer) clearTimeout(timer);
  const ms = msUntilNextMidnightKST();
  timer = setTimeout(() => {
    useCostStore.getState().resetDaily();
    // 다음 자정 재예약
    setupDailyReset();
  }, ms);
}

export function cancelDailyReset() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
