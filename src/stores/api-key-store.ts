// Blend - API Key Store (BYOK - Bring Your Own Key)

import { create } from 'zustand';
import { APIKeyConfig, AIProvider } from '@/types';

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
    custom: '',
  },

  setKey: (provider, key) => {
    set((state) => ({
      keys: { ...state.keys, [provider]: key },
    }));
    get().saveToStorage();
  },

  getKey: (provider) => get().keys[provider] || '',

  hasKey: (provider) => !!get().keys[provider],

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
        set({ keys: JSON.parse(stored) });
      }
    } catch {}
  },

  saveToStorage: () => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('blend:api-keys', JSON.stringify(get().keys));
  },
}));
