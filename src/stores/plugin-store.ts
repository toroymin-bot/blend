// Blend - Plugin Store (Zustand + localStorage persistence)

import { create } from 'zustand';

interface PluginState {
  installedPlugins: string[]; // plugin IDs

  installPlugin: (id: string) => void;
  uninstallPlugin: (id: string) => void;
  isInstalled: (id: string) => boolean;
  loadFromStorage: () => void;
  saveToStorage: () => void;
}

export const usePluginStore = create<PluginState>((set, get) => ({
  installedPlugins: [],

  installPlugin: (id) => {
    set((state) => ({
      installedPlugins: state.installedPlugins.includes(id)
        ? state.installedPlugins
        : [...state.installedPlugins, id],
    }));
    get().saveToStorage();
  },

  uninstallPlugin: (id) => {
    set((state) => ({
      installedPlugins: state.installedPlugins.filter((p) => p !== id),
    }));
    get().saveToStorage();
  },

  isInstalled: (id) => {
    return get().installedPlugins.includes(id);
  },

  loadFromStorage: () => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('blend:plugins');
      if (stored) {
        const data = JSON.parse(stored);
        set({ installedPlugins: data.installedPlugins || [] });
      }
    } catch {}
  },

  saveToStorage: () => {
    if (typeof window === 'undefined') return;
    const { installedPlugins } = get();
    try {
      localStorage.setItem('blend:plugins', JSON.stringify({ installedPlugins }));
    } catch (e) {
      console.warn('[plugin-store] localStorage save failed (quota exceeded?):', e);
    }
  },
}));
