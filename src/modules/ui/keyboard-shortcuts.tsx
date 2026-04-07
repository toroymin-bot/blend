// Blend - Keyboard Shortcuts Module (Reusable: any app needing hotkeys)

'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

interface ShortcutConfig {
  key: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  /** If true, match either Meta or Ctrl (cross-platform Cmd+X / Ctrl+X) */
  metaOrCtrl?: boolean;
  action: () => void;
  description: string;
}

export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        let metaMatch: boolean;
        if (shortcut.metaOrCtrl) {
          metaMatch = e.metaKey || e.ctrlKey;
        } else {
          metaMatch = shortcut.meta ? e.metaKey : !e.metaKey;
        }
        const ctrlMatch = shortcut.metaOrCtrl ? true : (shortcut.ctrl ? e.ctrlKey : !e.ctrlKey);
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
  { keys: '⌘ N', description: '새 채팅 시작', category: '채팅' },
  { keys: '⌘ [', description: '이전 채팅으로 이동', category: '채팅' },
  { keys: '⌘ ]', description: '다음 채팅으로 이동', category: '채팅' },
  { keys: '⌘ R', description: '마지막 AI 응답 재생성', category: '채팅' },
  { keys: '⌘ E', description: '마지막 사용자 메시지 편집', category: '채팅' },
  { keys: 'Enter', description: '메시지 전송', category: '채팅' },
  { keys: '⇧ Enter', description: '줄바꿈', category: '채팅' },
  { keys: '⌘ F', description: '채팅 내 검색', category: '검색' },
  { keys: '⌘ K', description: '사이드바 검색 포커스', category: '검색' },
  { keys: '/', description: '입력창 포커스', category: '검색' },
  { keys: '⌘ ,', description: '설정 열기', category: '화면' },
  { keys: '⌘ ⇧ T', description: '다크/라이트 테마 전환', category: '화면' },
  { keys: '? 또는 ⌘ /', description: '단축키 도움말', category: '화면' },
  { keys: 'ESC', description: '검색·모달 닫기', category: '화면' },
];

// ── Shortcut Help Modal ────────────────────────────────────────────────────────
interface ShortcutHelpModalProps {
  onClose: () => void;
}

export function ShortcutHelpModal({ onClose }: ShortcutHelpModalProps) {
  // Close on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-surface-2 border border-border-token rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-on-surface">키보드 단축키</h2>
          <button onClick={onClose} className="text-on-surface-muted hover:text-on-surface p-1">
            <X size={18} />
          </button>
        </div>
        {(['채팅', '검색', '화면'] as const).map((cat) => {
          const items = SHORTCUT_LIST.filter((s) => s.category === cat);
          return (
            <div key={cat} className="mb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-muted mb-2">{cat}</p>
              <div className="space-y-2">
                {items.map((s) => (
                  <div key={s.keys} className="flex items-center justify-between gap-4">
                    <span className="text-xs text-on-surface-muted">{s.description}</span>
                    <kbd className="text-xs bg-gray-700 text-gray-200 px-2 py-0.5 rounded font-mono shrink-0 whitespace-nowrap">{s.keys}</kbd>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        <p className="text-[10px] text-on-surface-muted mt-2 text-center">ESC 또는 바깥 클릭으로 닫기</p>
      </div>
    </div>
  );
}
