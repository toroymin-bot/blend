// Blend - Settings Store (Reusable: app-wide settings management)

import { create } from 'zustand';
import { AppSettings } from '@/types';

interface SettingsState {
  settings: AppSettings;
  systemPrompt: string;

  updateSettings: (updates: Partial<AppSettings>) => void;
  setSystemPrompt: (prompt: string) => void;
  loadFromStorage: () => void;
  saveToStorage: () => void;
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  language: 'ko',
  fontSize: 14,
  sendOnEnter: true,
  streamResponse: true,
  defaultModel: 'gpt-4o-mini',
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  systemPrompt: '',

  updateSettings: (updates) => {
    set((state) => ({ settings: { ...state.settings, ...updates } }));
    get().saveToStorage();
  },

  setSystemPrompt: (prompt) => {
    set({ systemPrompt: prompt });
    get().saveToStorage();
  },

  loadFromStorage: () => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('blend:settings');
      if (stored) {
        const data = JSON.parse(stored);
        set({ settings: { ...DEFAULT_SETTINGS, ...data.settings }, systemPrompt: data.systemPrompt || '' });
      }
    } catch {}
  },

  saveToStorage: () => {
    if (typeof window === 'undefined') return;
    const { settings, systemPrompt } = get();
    localStorage.setItem('blend:settings', JSON.stringify({ settings, systemPrompt }));
  },
}));
