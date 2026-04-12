// Blend - API Key Store (BYOK - Bring Your Own Key)

import { create } from 'zustand';
import { APIKeyConfig, AIProvider } from '@/types';

// QA 테스트용 환경변수 fallback
// /qatest 경로에서만 활성화됨 — 일반 사용자에게는 노출되지 않음
// Vercel 환경변수에 NEXT_PUBLIC_*_API_KEY 설정 필요
const isQAPath = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.startsWith('/qatest');
};

const getEnvKey = (provider: AIProvider): string => {
  if (!isQAPath()) return '';
  const envMap: Partial<Record<AIProvider, string | undefined>> = {
    openai: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
    anthropic: process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY,
    google: process.env.NEXT_PUBLIC_GOOGLE_API_KEY,
    deepseek: process.env.NEXT_PUBLIC_DEEPSEEK_API_KEY,
    groq: process.env.NEXT_PUBLIC_GROQ_API_KEY,
    custom: process.env.NEXT_PUBLIC_CUSTOM_API_KEY,
  };
  return envMap[provider] || '';
};

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
    set((state) => ({
      keys: { ...state.keys, [provider]: key },
    }));
    get().saveToStorage();
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
        // Merge with defaults so new providers aren't lost when loading old data
        set((state) => ({ keys: { ...state.keys, ...parsed } }));
      }
    } catch {}
  },

  saveToStorage: () => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('blend:api-keys', JSON.stringify(get().keys));
  },
}));
