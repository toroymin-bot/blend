// Blend - API Key Store (BYOK - Bring Your Own Key)
// IMP-011 (2026-04-25): NEXT_PUBLIC_*_API_KEY env fallback 제거.
// NEXT_PUBLIC_ prefix는 client bundle에 노출되어 Vercel 환경변수 실수 설정 시
// 모든 사용자에게 키가 유출되는 anti-pattern. BYOK 정책 명확화 — 사용자가 직접 입력만.
// (Trial Gemini는 별도 NEXT_PUBLIC_BLEND_TRIAL_GEMINI_KEY로 trial-gemini-client에서 사용)

import { create } from 'zustand';
import { APIKeyConfig, AIProvider } from '@/types';
import { safeSetItem } from '@/lib/safe-storage';

const getEnvKey = (_provider: AIProvider): string => '';

interface APIKeyState {
  keys: Record<AIProvider, string>;
  setKey: (provider: AIProvider, key: string) => void;
  getKey: (provider: AIProvider) => string;
  hasKey: (provider: AIProvider) => boolean;
  clearKey: (provider: AIProvider) => void;
  loadFromStorage: () => void;
  saveToStorage: () => void;
}

export const useAPIKeyStore = create<APIKeyState>((set, get) => ({
  keys: {
    openai: '',
    anthropic: '',
    google: '',
    deepseek: '',
    groq: '',
    custom: '',
  },

  setKey: (provider, key) => {
    const wasEmpty = !get().keys[provider];
    set((state) => ({
      keys: { ...state.keys, [provider]: key },
    }));
    get().saveToStorage();
    // Phase 5.0 Analytics — only track first-time registration
    if (typeof window !== 'undefined' && key && key.trim() && wasEmpty) {
      import('@/lib/analytics').then(({ trackEvent }) =>
        trackEvent('key_registered', { provider }),
      ).catch(() => {});
    }
  },

  // 사용자 입력 키 우선, 없으면 환경변수 fallback
  getKey: (provider) => get().keys[provider] || getEnvKey(provider),

  // 사용자 키 또는 환경변수 키 중 하나라도 있으면 true
  hasKey: (provider) => !!get().keys[provider] || !!getEnvKey(provider),

  clearKey: (provider) => {
    set((state) => ({
      keys: { ...state.keys, [provider]: '' },
    }));
    get().saveToStorage();
  },

  loadFromStorage: () => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('blend:api-keys');
      if (stored) {
        const parsed = JSON.parse(stored);
        // [2026-05-01] sanitize — 과거 zustand persist 형식(`{state:{...}, version:N}`)
        // 잔존물 또는 잘못된 타입의 값이 들어오면 거른다. 비-string은 무시 → 페이지 전체
        // 크래시 방지.
        const sane: Partial<Record<string, string>> = {};
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === 'string') sane[k] = v;
          }
        }
        set((state) => ({ keys: { ...state.keys, ...sane } }));
      }
    } catch (e) {
      console.warn('[api-key-store] localStorage parse failed:', e);
    }
  },

  saveToStorage: () => {
    if (typeof window === 'undefined') return;
    safeSetItem('blend:api-keys', JSON.stringify(get().keys), 'api-keys');
  },
}));
