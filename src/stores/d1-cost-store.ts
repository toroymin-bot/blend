// [2026-04-26 Tori 16384118 §3.8 ~ §3.10]
// 일일 임베딩 비용 한도 + $1 알림 + 자정 자동 리셋
//
// 클라이언트 사이드 store. 사용자 OpenAI/Google 키로 직접 임베딩이 호출되므로
// 비용은 사용자 청구서에 직접 발생. 이 store는 "오늘 얼마 썼는지" 추적해서
// $1 알림 / $2 한도 초과 시 자동 일시정지를 제공.

import { create } from 'zustand';

const STORAGE_KEY = 'd1:cost-state';

const DEFAULT_DAILY_LIMIT = 2;            // $2 / day
const DEFAULT_ALERT_THRESHOLD = 1;        // $1 도달 시 1회 알림

interface CostStateData {
  dailyLimit: number;
  alertThreshold: number;
  todayUsed: number;
  alertShown: boolean;                    // 오늘 한 번만
  paused: boolean;                        // 한도 초과 또는 사용자 일시정지
  pauseReason: 'limit_exceeded' | 'user_paused' | null;
  lastResetDate: string;                  // 'YYYY-MM-DD' (KST 기준)
}

interface CostStoreState extends CostStateData {
  loadFromStorage: () => void;
  addCost: (amount: number) => { triggeredAlert: boolean; nowPaused: boolean };
  resetDaily: () => void;
  setDailyLimit: (n: number) => void;
  pauseSync: (reason: 'limit_exceeded' | 'user_paused') => void;
  resumeSync: () => void;
  // Alert UI 상호작용
  acknowledgeAlert: () => void;
}

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

const DEFAULT_STATE: CostStateData = {
  dailyLimit: DEFAULT_DAILY_LIMIT,
  alertThreshold: DEFAULT_ALERT_THRESHOLD,
  todayUsed: 0,
  alertShown: false,
  paused: false,
  pauseReason: null,
  lastResetDate: todayKST(),
};

function persist(state: CostStateData) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

export const useCostStore = create<CostStoreState>((set, get) => ({
  ...DEFAULT_STATE,

  loadFromStorage: () => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as CostStateData;
      // 자정 지났는지 검사
      const today = todayKST();
      if (parsed.lastResetDate !== today) {
        // 자정 리셋
        const reset: CostStateData = {
          ...parsed,
          todayUsed: 0,
          alertShown: false,
          // limit 초과로 일시정지 됐으면 자동 재개. user_paused는 유지.
          paused: parsed.pauseReason === 'user_paused' ? parsed.paused : false,
          pauseReason: parsed.pauseReason === 'user_paused' ? parsed.pauseReason : null,
          lastResetDate: today,
        };
        set(reset);
        persist(reset);
      } else {
        set(parsed);
      }
    } catch { /* fallthrough */ }
  },

  addCost: (amount: number) => {
    const s = get();
    const newTotal = s.todayUsed + amount;
    let triggeredAlert = false;
    let nowPaused = s.paused;

    // $1 임계값 도달
    if (!s.alertShown && s.todayUsed < s.alertThreshold && newTotal >= s.alertThreshold) {
      triggeredAlert = true;
    }

    // $2 한도 초과 → 자동 일시정지
    if (!s.paused && newTotal >= s.dailyLimit) {
      nowPaused = true;
    }

    const next: CostStateData = {
      ...s,
      todayUsed: newTotal,
      alertShown: triggeredAlert ? true : s.alertShown,
      paused: nowPaused,
      pauseReason: nowPaused && !s.paused ? 'limit_exceeded' : s.pauseReason,
    };
    set(next);
    persist(next);
    return { triggeredAlert, nowPaused: nowPaused && !s.paused };
  },

  resetDaily: () => {
    const s = get();
    const next: CostStateData = {
      ...s,
      todayUsed: 0,
      alertShown: false,
      paused: s.pauseReason === 'user_paused' ? s.paused : false,
      pauseReason: s.pauseReason === 'user_paused' ? s.pauseReason : null,
      lastResetDate: todayKST(),
    };
    set(next);
    persist(next);
  },

  setDailyLimit: (n: number) => {
    const s = get();
    const newLimit = Math.max(0.1, n);
    // [2026-04-26 QA-BUG-E] limit 늘려서 todayUsed가 새 한도 미만이면 limit_exceeded 자동 재개.
    // user_paused는 유지 (사용자가 명시적으로 정지한 거라 자동 재개 X).
    const shouldResume = s.paused && s.pauseReason === 'limit_exceeded' && s.todayUsed < newLimit;
    const next: CostStateData = {
      ...s,
      dailyLimit: newLimit,
      paused: shouldResume ? false : s.paused,
      pauseReason: shouldResume ? null : s.pauseReason,
    };
    set(next);
    persist(next);
  },

  pauseSync: (reason) => {
    const s = get();
    const next: CostStateData = { ...s, paused: true, pauseReason: reason };
    set(next);
    persist(next);
  },

  resumeSync: () => {
    const s = get();
    const next: CostStateData = { ...s, paused: false, pauseReason: null };
    set(next);
    persist(next);
  },

  acknowledgeAlert: () => {
    const s = get();
    const next: CostStateData = { ...s, alertShown: true };
    set(next);
    persist(next);
  },
}));
