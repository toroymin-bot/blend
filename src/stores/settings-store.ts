// Blend - Settings Store (Reusable: app-wide settings management)

import { create } from 'zustand';
import { AppSettings } from '@/types';

export interface SystemPromptPreset {
  id: string;
  name: string;
  content: string;
}

interface SettingsState {
  settings: AppSettings;
  systemPrompt: string;
  systemPromptPresets: SystemPromptPreset[];

  updateSettings: (updates: Partial<AppSettings>) => void;
  setSystemPrompt: (prompt: string) => void;
  addSystemPromptPreset: (name: string, content: string) => void;
  removeSystemPromptPreset: (id: string) => void;
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
  dailyCostLimit: 1.0,
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  systemPrompt: '',
  systemPromptPresets: [],

  updateSettings: (updates) => {
    set((state) => ({ settings: { ...state.settings, ...updates } }));
    get().saveToStorage();
  },

  setSystemPrompt: (prompt) => {
    set({ systemPrompt: prompt });
    get().saveToStorage();
  },

  addSystemPromptPreset: (name, content) => {
    const preset: SystemPromptPreset = { id: Math.random().toString(36).slice(2) + Date.now().toString(36), name, content };
    set((state) => ({ systemPromptPresets: [...state.systemPromptPresets, preset] }));
    get().saveToStorage();
  },

  removeSystemPromptPreset: (id) => {
    set((state) => ({ systemPromptPresets: state.systemPromptPresets.filter((p) => p.id !== id) }));
    get().saveToStorage();
  },

  loadFromStorage: () => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('blend:settings');
      if (stored) {
        const data = JSON.parse(stored);
        set({
          settings: { ...DEFAULT_SETTINGS, ...data.settings },
          systemPrompt: data.systemPrompt || '',
          systemPromptPresets: data.systemPromptPresets ?? [],
        });
      }
    } catch {}
  },

  saveToStorage: () => {
    if (typeof window === 'undefined') return;
    const { settings, systemPrompt, systemPromptPresets } = get();
    localStorage.setItem('blend:settings', JSON.stringify({ settings, systemPrompt, systemPromptPresets }));
  },
}));
