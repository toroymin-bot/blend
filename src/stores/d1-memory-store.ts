// [2026-05-02 Roy] '이전 세션 기억하기' 멀티 선택 — 현재 세션의 system prompt에
// 컨텍스트로 주입할 chat ID 목록.
//
// 의도적으로 persist 안 함 — 페이지 reload(=새 세션) 시 자동 초기화. localStorage X.
// 사용자가 매번 명시적으로 다시 선택해야 함 (Roy 결정).
//
// 사이드바 '최근'과 히스토리 오버레이 양쪽에서 같은 store 참조 → 일관된 UI.
//
// [2026-05-04 PM-26 Roy] 개수 제한 제거 — 세션이 허용하는 한 무제한 선택. 한도는
// 채팅창 밑 SessionLoadBar(세션 부하 %)에서 자연스럽게 적용·표시됨. 여기서 추가
// 제한 두지 않음. D1_MEMORY_LIMIT 상수는 호환성을 위해 export 유지(하위 코드가
// 표시용으로 import할 수 있음) — 현재 toggle 로직에서는 사용하지 않음.

import { create } from 'zustand';

export const D1_MEMORY_LIMIT = Infinity;

interface MemoryState {
  selectedIds: string[];
  toggle: (chatId: string) => boolean; // 항상 true — 한도 검사 제거
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
    } else {
      set({ selectedIds: [...cur, chatId] });
    }
    return true;
  },
  remove: (chatId) => set((s) => ({ selectedIds: s.selectedIds.filter((id) => id !== chatId) })),
  clear: () => set({ selectedIds: [] }),
  isSelected: (chatId) => get().selectedIds.includes(chatId),
}));
