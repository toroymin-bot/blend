import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// [2026-05-03 Roy] 무료 체험 한도 10 → 50회/일.
// persist에서 maxPerDay를 제외(partialize) → 코드 default가 항상 source of truth.
// 기존 사용자(localStorage에 maxPerDay:10 저장돼 있던 사람) 도 새 default 50 즉시 적용.
// 변경 시 코드 한 줄만 수정하면 모든 사용자에게 반영됨.
const TRIAL_MAX_PER_DAY = 50;

interface TrialState {
  dailyCount: number;          // 오늘 사용한 횟수
  lastResetDate: string;       // YYYY-MM-DD
  maxPerDay: number;           // 코드 상수 (persist 제외)

  useTrial: () => boolean;     // 1회 차감. 성공 시 true, 소진이면 false
  getRemaining: () => number;
  resetIfNewDay: () => void;
}

export const useTrialStore = create<TrialState>()(
  persist(
    (set, get) => ({
      dailyCount: 0,
      lastResetDate: new Date().toISOString().slice(0, 10),
      maxPerDay: TRIAL_MAX_PER_DAY,

      resetIfNewDay: () => {
        const today = new Date().toISOString().slice(0, 10);
        if (get().lastResetDate !== today) {
          set({ dailyCount: 0, lastResetDate: today });
        }
      },

      useTrial: () => {
        get().resetIfNewDay();
        const { dailyCount, maxPerDay } = get();
        if (dailyCount >= maxPerDay) return false;
        set({ dailyCount: dailyCount + 1 });
        // Phase 5.0 Analytics
        if (typeof window !== 'undefined') {
          import('@/lib/analytics').then(({ trackEvent }) =>
            trackEvent('trial_used', { remaining: maxPerDay - (dailyCount + 1) }),
          ).catch(() => {});
        }
        return true;
      },

      getRemaining: () => {
        get().resetIfNewDay();
        return Math.max(0, get().maxPerDay - get().dailyCount);
      },
    }),
    {
      name: 'blend:trial',
      storage: createJSONStorage(() => localStorage),
      // maxPerDay는 코드 상수 — persist에서 제외해 한도 변경 시 모든 디바이스에 즉시 반영.
      partialize: (state) => ({ dailyCount: state.dailyCount, lastResetDate: state.lastResetDate }),
      // 옛 사용자의 storage에 maxPerDay:10이 남아있어도 rehydrate 시 덮어쓰기 — merge로
      // 강제로 코드 상수를 source of truth로 만듦. (partialize만으론 기존 유저 마이그레이션 X)
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<TrialState>),
        maxPerDay: TRIAL_MAX_PER_DAY,
      }),
    }
  )
);
