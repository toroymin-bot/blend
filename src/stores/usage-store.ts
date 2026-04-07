// Blend - Usage Analytics Store (Reusable: any project tracking API costs)
// This is the KEY differentiator from TypingMind

import { create } from 'zustand';
import { UsageStats } from '@/types';

interface UsageRecord {
  id: string;
  timestamp: number;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  chatId: string;
}

interface UsageState {
  records: UsageRecord[];
  dailyLimitAlerted: boolean; // track if we already fired the alert today

  addRecord: (record: Omit<UsageRecord, 'id'>) => void;
  getTotalCost: () => number;
  getTodayCost: () => number;
  getThisMonthCost: () => number;
  getCostByModel: () => Record<string, number>;
  getCostByProvider: () => Record<string, number>;
  getCostByDay: (days: number) => { date: string; cost: number; requests: number }[];
  getTokensByModel: () => Record<string, { input: number; output: number }>;
  getTotalRequests: () => number;
  /** Returns true if today's cost exceeds the given limit (0 = disabled) */
  checkDailyLimit: (limit: number) => boolean;
  resetDailyAlert: () => void;
  loadFromStorage: () => void;
  saveToStorage: () => void;
}

const generateId = () => Math.random().toString(36).substring(2, 15);

export const useUsageStore = create<UsageState>((set, get) => ({
  records: [],
  dailyLimitAlerted: false,

  addRecord: (record) => {
    const newRecord = { ...record, id: generateId() };
    set((state) => ({ records: [...state.records, newRecord] }));
    get().saveToStorage();
  },

  getTotalCost: () => get().records.reduce((sum, r) => sum + r.cost, 0),

  getTodayCost: () => {
    const today = new Date().toDateString();
    return get().records
      .filter((r) => new Date(r.timestamp).toDateString() === today)
      .reduce((sum, r) => sum + r.cost, 0);
  },

  getThisMonthCost: () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return get().records
      .filter((r) => r.timestamp >= monthStart)
      .reduce((sum, r) => sum + r.cost, 0);
  },

  getCostByModel: () => {
    const result: Record<string, number> = {};
    get().records.forEach((r) => {
      result[r.model] = (result[r.model] || 0) + r.cost;
    });
    return result;
  },

  getCostByProvider: () => {
    const result: Record<string, number> = {};
    get().records.forEach((r) => {
      result[r.provider] = (result[r.provider] || 0) + r.cost;
    });
    return result;
  },

  getCostByDay: (days) => {
    const result: { date: string; cost: number; requests: number }[] = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayRecords = get().records.filter(
        (r) => new Date(r.timestamp).toISOString().split('T')[0] === dateStr
      );
      result.push({
        date: dateStr,
        cost: dayRecords.reduce((sum, r) => sum + r.cost, 0),
        requests: dayRecords.length,
      });
    }
    return result;
  },

  getTokensByModel: () => {
    const result: Record<string, { input: number; output: number }> = {};
    get().records.forEach((r) => {
      if (!result[r.model]) result[r.model] = { input: 0, output: 0 };
      result[r.model].input += r.inputTokens;
      result[r.model].output += r.outputTokens;
    });
    return result;
  },

  getTotalRequests: () => get().records.length,

  checkDailyLimit: (limit) => {
    if (limit <= 0) return false;
    return get().getTodayCost() >= limit;
  },

  resetDailyAlert: () => set({ dailyLimitAlerted: false }),

  loadFromStorage: () => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('blend:usage');
      if (stored) set({ records: JSON.parse(stored) });
    } catch {}
  },

  saveToStorage: () => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('blend:usage', JSON.stringify(get().records));
  },
}));
