// Blend - Keyboard Shortcuts Module (Reusable: any app needing hotkeys)

'use client';

import { useEffect } from 'react';

interface ShortcutConfig {
  key: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  action: () => void;
  description: string;
}

export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        const metaMatch = shortcut.meta ? e.metaKey : !e.metaKey;
        const ctrlMatch = shortcut.ctrl ? e.ctrlKey : !e.ctrlKey;
        const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;

        if (e.key.toLowerCase() === shortcut.key.toLowerCase() && metaMatch && ctrlMatch && shiftMatch) {
          e.preventDefault();
          shortcut.action();
          return;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts]);
}

export const SHORTCUT_LIST = [
  { keys: '⌘ N', description: '새 채팅' },
  { keys: '⌘ K', description: '대화 검색' },
  { keys: '⌘ ,', description: '설정' },
  { keys: '⌘ /', description: '단축키 목록' },
  { keys: '/', description: '입력창 포커스' },
];
