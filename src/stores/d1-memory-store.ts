// [2026-05-02 Roy] '이전 세션 기억하기' 멀티 선택 — 현재 세션의 system prompt에
// 컨텍스트로 주입할 chat ID 목록.
//
// 의도적으로 persist 안 함 — 페이지 reload(=새 세션) 시 자동 초기화. localStorage X.
// 사용자가 매번 명시적으로 다시 선택해야 함 (Roy 결정).
//
// 사이드바 '최근'과 히스토리 오버레이 양쪽에서 같은 store 참조 → 일관된 UI.

import { create } from 'zustand';

export const D1_MEMORY_LIMIT = 5;

interface MemoryState {
  selectedIds: string[];
  toggle: (chatId: string) => boolean; // returns true if toggled, false if rejected (limit)
  remove: (chatId: string) => void;
  clear: () => void;
  isSelected: (chatId: string) => boolean;
}

export const useD1MemoryStore = create<MemoryState>((set, get) => ({
  selectedIds: [],
  toggle: (chatId) => {
    const cur = get().selectedIds;
    if (cur.includes(chatId)) {
      set({ selectedIds: cur.filter((id) => id !== chatId) });
      return true;
    }
    if (cur.length >= D1_MEMORY_LIMIT) {
      return false; // limit reached
    }
    set({ selectedIds: [...cur, chatId] });
    return true;
  },
  remove: (chatId) => set((s) => ({ selectedIds: s.selectedIds.filter((id) => id !== chatId) })),
  clear: () => set({ selectedIds: [] }),
  isSelected: (chatId) => get().selectedIds.includes(chatId),
}));
