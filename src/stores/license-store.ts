// [2026-04-26] F-2 — Blend 라이센스 store
// 결제 완료 후 백엔드(Cloudflare Worker, 후속 PR)가 발급한 라이센스 토큰을 저장.
// 현재는 클라이언트만 — 백엔드 서명 검증은 후속.
//
// localStorage 'blend:license' = { plan, activatedAt, expiresAt?, paymentKey? }

import { create } from 'zustand';

export type Plan = 'free' | 'pro' | 'lifetime';

export interface LicenseData {
  plan: Plan;
  activatedAt?: number;
  expiresAt?: number;       // pro만 사용. lifetime/free는 undefined.
  paymentKey?: string;      // Toss paymentKey (있으면)
  orderId?: string;
}

const STORAGE_KEY = 'blend:license';

interface LicenseState {
  license: LicenseData;
  loaded: boolean;

  loadFromStorage: () => void;
  setLicense: (data: LicenseData) => void;
  /** Pro/Lifetime 기능 사용 가능 여부 — 만료 시 false */
  isPaidActive: () => boolean;
  /** 현재 활성 플랜 (만료 시 free로 강등) */
  getActivePlan: () => Plan;
  reset: () => void;
}

const FREE: LicenseData = { plan: 'free' };

export const useLicenseStore = create<LicenseState>((set, get) => ({
  license: FREE,
  loaded: false,

  loadFromStorage: () => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as LicenseData;
        set({ license: parsed, loaded: true });
        return;
      }
    } catch { /* fallthrough */ }
    set({ loaded: true });
  },

  setLicense: (data) => {
    set({ license: data });
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      }
    } catch { /* ignore quota */ }
  },

  isPaidActive: () => {
    const { license } = get();
    if (license.plan === 'lifetime') return true;
    if (license.plan === 'pro') {
      return !license.expiresAt || license.expiresAt > Date.now();
    }
    return false;
  },

  getActivePlan: () => {
    const { license } = get();
    if (license.plan === 'lifetime') return 'lifetime';
    if (license.plan === 'pro' && (!license.expiresAt || license.expiresAt > Date.now())) {
      return 'pro';
    }
    return 'free';
  },

  reset: () => {
    set({ license: FREE });
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch { /* ignore */ }
  },
}));
