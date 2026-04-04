// Blend - Chat Store (Zustand + localStorage persistence)

import { create } from 'zustand';
import { Chat, ChatMessage, ChatFolder } from '@/types';

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
  moveToFolder: (chatId: string, folderId: string | undefined) => void;
  removeLastMessage: (chatId: string) => ChatMessage | undefined;
  getCurrentChat: () => Chat | undefined;
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
      title: '새 대화',
      messages: [],
      model: get().selectedModel,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set((state) => ({
      chats: [chat, ...state.chats],
      currentChatId: id,
    }));
    return id;
  },

  deleteChat: (id) => {
    set((state) => ({
      chats: state.chats.filter((c) => c.id !== id),
      currentChatId: state.currentChatId === id ? null : state.currentChatId,
    }));
  },

  setCurrentChat: (id) => set({ currentChatId: id }),

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
  },

  updateChatTitle: (chatId, title) => {
    set((state) => ({
      chats: state.chats.map((c) => (c.id === chatId ? { ...c, title } : c)),
    }));
  },

  setSelectedModel: (model) => set({ selectedModel: model }),

  createFolder: (name) => {
    const folder: ChatFolder = {
      id: generateId(),
      name,
      order: get().folders.length,
    };
    set((state) => ({ folders: [...state.folders, folder] }));
  },

  moveToFolder: (chatId, folderId) => {
    set((state) => ({
      chats: state.chats.map((c) => (c.id === chatId ? { ...c, folderId } : c)),
    }));
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
    return removed;
  },

  getCurrentChat: () => {
    const state = get();
    return state.chats.find((c) => c.id === state.currentChatId);
  },
}));
