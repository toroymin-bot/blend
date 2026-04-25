import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface TrialState {
  dailyCount: number;          // 오늘 사용한 횟수
  lastResetDate: string;       // YYYY-MM-DD
  maxPerDay: number;           // 기본 10

  useTrial: () => boolean;     // 1회 차감. 성공 시 true, 소진이면 false
  getRemaining: () => number;
  resetIfNewDay: () => void;
}

export const useTrialStore = create<TrialState>()(
  persist(
    (set, get) => ({
      dailyCount: 0,
      lastResetDate: new Date().toISOString().slice(0, 10),
      maxPerDay: 10,

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
    }
  )
);
