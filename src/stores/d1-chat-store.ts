/**
 * Design1-only chat persistence.
 *
 * Isolated from the legacy `useChatStore` (which has dozens of actions
 * and branching behavior D1 does not use). This store is small on purpose:
 * it stores a list of persisted chats in localStorage key `d1:chats` and
 * lets D1ChatView save/load/delete without touching the main store.
 */

import { create } from 'zustand';

export type D1Role = 'user' | 'assistant';

export interface D1Message {
  id: string;
  role: D1Role;
  content: string;
  modelUsed?: string;
  createdAt: number;
}

export interface D1Chat {
  id: string;
  title: string;
  messages: D1Message[];
  model: string;           // currently selected model at save time
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'd1:chats';

interface D1ChatStoreState {
  chats: D1Chat[];
  loaded: boolean;

  loadFromStorage: () => void;
  saveToStorage: () => void;

  /** Upsert a chat — creates if id missing, replaces otherwise. */
  upsertChat: (chat: D1Chat) => void;
  deleteChat: (id: string) => void;
  getChat: (id: string) => D1Chat | undefined;

  /** Generate a short title from the first user message. */
  deriveTitle: (messages: D1Message[]) => string;
}

export const useD1ChatStore = create<D1ChatStoreState>((set, get) => ({
  chats: [],
  loaded: false,

  loadFromStorage: () => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        set({ loaded: true });
        return;
      }
      const parsed = JSON.parse(raw);
      const chats: D1Chat[] = Array.isArray(parsed?.chats) ? parsed.chats : [];
      set({ chats, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  saveToStorage: () => {
    if (typeof window === 'undefined') return;
    try {
      const payload = { version: 1, chats: get().chats };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      if ((err as Error)?.name === 'QuotaExceededError') {
        // Trim oldest 50% and retry once.
        const chats = get().chats;
        const half = Math.floor(chats.length / 2);
        const trimmed = chats.slice(0, chats.length - half);
        set({ chats: trimmed });
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, chats: trimmed }));
        } catch {}
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('blend:storage-quota-exceeded', { detail: { store: 'chats', purged: half } }));
        }
      }
    }
  },

  upsertChat: (chat) => {
    set((state) => {
      const idx = state.chats.findIndex((c) => c.id === chat.id);
      if (idx === -1) {
        return { chats: [chat, ...state.chats] };
      }
      const next = [...state.chats];
      next[idx] = chat;
      // keep newest-first by updatedAt
      next.sort((a, b) => b.updatedAt - a.updatedAt);
      return { chats: next };
    });
    get().saveToStorage();
  },

  deleteChat: (id) => {
    set((state) => ({ chats: state.chats.filter((c) => c.id !== id) }));
    get().saveToStorage();
  },

  getChat: (id) => get().chats.find((c) => c.id === id),

  deriveTitle: (messages) => {
    const firstUser = messages.find((m) => m.role === 'user');
    if (!firstUser) return '';
    const text = firstUser.content.replace(/\s+/g, ' ').trim();
    if (text.length <= 40) return text;
    return text.slice(0, 40) + '…';
  },
}));
