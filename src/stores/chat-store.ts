// Blend - Chat Store (Zustand + localStorage persistence)

import { create } from 'zustand';
import { Chat, ChatMessage, ChatFolder } from '@/types';
import { getCurrentLanguage } from '@/lib/i18n';

interface ChatState {
  chats: Chat[];
  currentChatId: string | null;
  folders: ChatFolder[];
  selectedModel: string;

  // Actions
  createChat: () => string;
  deleteChat: (id: string) => void;
  setCurrentChat: (id: string | null) => void;
  addMessage: (chatId: string, message: ChatMessage) => void;
  updateChatTitle: (chatId: string, title: string) => void;
  setSelectedModel: (model: string) => void;
  createFolder: (name: string) => void;
  deleteFolder: (folderId: string) => void;
  renameFolder: (folderId: string, name: string) => void;
  moveToFolder: (chatId: string, folderId: string | undefined) => void;
  togglePin: (chatId: string) => void;
  removeLastMessage: (chatId: string) => ChatMessage | undefined;
  forkChat: (chatId: string, atMessageIndex: number) => string;
  getCurrentChat: () => Chat | undefined;
  // Edit message (truncates all messages after this one)
  editMessage: (chatId: string, messageId: string, newContent: string) => void;
  // Tag actions
  addChatTag: (chatId: string, tag: string) => void;
  removeChatTag: (chatId: string, tag: string) => void;
  getAllChatTags: () => string[];
  // Persistence
  loadFromStorage: () => void;
  saveToStorage: () => void;
}

const generateId = () => Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  currentChatId: null,
  folders: [],
  selectedModel: 'gpt-4o-mini',

  createChat: () => {
    const id = generateId();
    const chat: Chat = {
      id,
      title: getCurrentLanguage() === 'en' ? 'New Chat' : '새 대화',
      messages: [],
      model: get().selectedModel,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set((state) => ({
      chats: [chat, ...state.chats],
      currentChatId: id,
    }));
    get().saveToStorage();
    return id;
  },

  deleteChat: (id) => {
    set((state) => ({
      chats: state.chats.filter((c) => c.id !== id),
      currentChatId: state.currentChatId === id ? null : state.currentChatId,
    }));
    get().saveToStorage();
  },

  setCurrentChat: (id) => {
    set({ currentChatId: id });
    get().saveToStorage();
  },

  addMessage: (chatId, message) => {
    set((state) => ({
      chats: state.chats.map((c) =>
        c.id === chatId
          ? {
              ...c,
              messages: [...c.messages, message],
              updatedAt: Date.now(),
              title: c.messages.length === 0 && message.role === 'user'
                ? message.content.substring(0, 30) + (message.content.length > 30 ? '...' : '')
                : c.title,
            }
          : c
      ),
    }));
    get().saveToStorage();
  },

  updateChatTitle: (chatId, title) => {
    set((state) => ({
      chats: state.chats.map((c) => (c.id === chatId ? { ...c, title } : c)),
    }));
    get().saveToStorage();
  },

  setSelectedModel: (model) => {
    set({ selectedModel: model });
    get().saveToStorage();
  },

  createFolder: (name) => {
    const folder: ChatFolder = {
      id: generateId(),
      name,
      order: get().folders.length,
    };
    set((state) => ({ folders: [...state.folders, folder] }));
    get().saveToStorage();
  },

  deleteFolder: (folderId) => {
    set((state) => ({
      folders: state.folders.filter((f) => f.id !== folderId),
      // unassign chats in this folder
      chats: state.chats.map((c) => c.folderId === folderId ? { ...c, folderId: undefined } : c),
    }));
    get().saveToStorage();
  },

  renameFolder: (folderId, name) => {
    set((state) => ({
      folders: state.folders.map((f) => f.id === folderId ? { ...f, name } : f),
    }));
    get().saveToStorage();
  },

  moveToFolder: (chatId, folderId) => {
    set((state) => ({
      chats: state.chats.map((c) => (c.id === chatId ? { ...c, folderId } : c)),
    }));
    get().saveToStorage();
  },

  togglePin: (chatId) => {
    set((state) => ({
      chats: state.chats.map((c) => c.id === chatId ? { ...c, pinned: !c.pinned } : c),
    }));
    get().saveToStorage();
  },

  forkChat: (chatId, atMessageIndex) => {
    const chat = get().chats.find((c) => c.id === chatId);
    if (!chat) return '';
    const id = generateId();
    const forked: Chat = {
      id,
      title: chat.title + ' (fork)',
      messages: chat.messages.slice(0, atMessageIndex + 1),
      model: chat.model,
      folderId: chat.folderId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set((state) => ({
      chats: [forked, ...state.chats],
      currentChatId: id,
    }));
    get().saveToStorage();
    return id;
  },

  removeLastMessage: (chatId) => {
    let removed: ChatMessage | undefined;
    set((state) => ({
      chats: state.chats.map((c) => {
        if (c.id === chatId && c.messages.length > 0) {
          removed = c.messages[c.messages.length - 1];
          return { ...c, messages: c.messages.slice(0, -1) };
        }
        return c;
      }),
    }));
    get().saveToStorage();
    return removed;
  },

  getCurrentChat: () => {
    const state = get();
    return state.chats.find((c) => c.id === state.currentChatId);
  },

  editMessage: (chatId, messageId, newContent) => {
    set((state) => ({
      chats: state.chats.map((c) => {
        if (c.id !== chatId) return c;
        const idx = c.messages.findIndex((m) => m.id === messageId);
        if (idx < 0) return c;
        // Keep messages up to and including the edited one, update its content
        const updated = c.messages.slice(0, idx + 1).map((m, i) =>
          i === idx ? { ...m, content: newContent } : m
        );
        return { ...c, messages: updated, updatedAt: Date.now() };
      }),
    }));
    get().saveToStorage();
  },

  addChatTag: (chatId, tag) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    set((state) => ({
      chats: state.chats.map((c) =>
        c.id === chatId
          ? { ...c, tags: c.tags ? (c.tags.includes(trimmed) ? c.tags : [...c.tags, trimmed]) : [trimmed] }
          : c
      ),
    }));
    get().saveToStorage();
  },

  removeChatTag: (chatId, tag) => {
    set((state) => ({
      chats: state.chats.map((c) =>
        c.id === chatId
          ? { ...c, tags: (c.tags ?? []).filter((t) => t !== tag) }
          : c
      ),
    }));
    get().saveToStorage();
  },

  getAllChatTags: () => {
    const tags = new Set<string>();
    get().chats.forEach((c) => (c.tags ?? []).forEach((t) => tags.add(t)));
    return [...tags].sort();
  },

  loadFromStorage: () => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('blend:chats');
      if (stored) {
        const data = JSON.parse(stored);
        set({
          chats: data.chats ?? [],
          folders: data.folders ?? [],
          selectedModel: data.selectedModel ?? 'gpt-4o-mini',
          currentChatId: data.currentChatId ?? null,
        });
      }
    } catch {}
  },

  saveToStorage: () => {
    if (typeof window === 'undefined') return;
    const { chats, folders, selectedModel, currentChatId } = get();
    localStorage.setItem('blend:chats', JSON.stringify({ chats, folders, selectedModel, currentChatId }));
  },
}));
