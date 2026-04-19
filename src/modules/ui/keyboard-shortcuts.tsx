// Blend - Keyboard Shortcuts Module (Reusable: any app needing hotkeys)

'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

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
      // [2026-04-17] BUG-001 fix: skip shortcuts when user is typing in an input, textarea, or contenteditable
      // [2026-04-18] IMP-004 fix: also check document.activeElement — mobile Chrome virtual keyboard
      //              sends keydown events with e.target as document.body, not the focused input element
      const target = e.target as HTMLElement;
      const activeEl = document.activeElement as HTMLElement | null;
      const isEditableEl = (el: HTMLElement | null): boolean => {
        if (!el) return false;
        return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || !!el.isContentEditable;
      };
      const isInputFocused = isEditableEl(target) || isEditableEl(activeEl);
      // Only allow modifier-key shortcuts (meta/ctrl) when input is focused; block bare key shortcuts
      const hasModifier = e.metaKey || e.ctrlKey || e.altKey;
      if (isInputFocused && !hasModifier) return;

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

export const SHORTCUT_LIST_KEYS = [
  { keys: '⌘ N', descKey: 'shortcuts.new_chat', catKey: 'shortcuts.cat_chat' },
  { keys: '⌘ [', descKey: 'shortcuts.prev_chat', catKey: 'shortcuts.cat_chat' },
  { keys: '⌘ ]', descKey: 'shortcuts.next_chat', catKey: 'shortcuts.cat_chat' },
  { keys: '⌘ R', descKey: 'shortcuts.regen', catKey: 'shortcuts.cat_chat' },
  { keys: '⌘ E', descKey: 'shortcuts.edit_msg', catKey: 'shortcuts.cat_chat' },
  { keys: 'Enter', descKey: 'shortcuts.send', catKey: 'shortcuts.cat_chat' },
  { keys: '⇧ Enter', descKey: 'shortcuts.newline', catKey: 'shortcuts.cat_chat' },
  { keys: '⌘ F', descKey: 'shortcuts.search_chat', catKey: 'shortcuts.cat_search' },
  { keys: '⌘ K', descKey: 'shortcuts.sidebar_search', catKey: 'shortcuts.cat_search' },
  { keys: '/', descKey: 'shortcuts.focus_input', catKey: 'shortcuts.cat_search' },
  { keys: '⌘ ,', descKey: 'shortcuts.open_settings', catKey: 'shortcuts.cat_ui' },
  { keys: '⌘ ⇧ T', descKey: 'shortcuts.toggle_theme', catKey: 'shortcuts.cat_ui' },
  { keys: '? or ⌘ /', descKey: 'shortcuts.shortcut_help', catKey: 'shortcuts.cat_ui' },
  { keys: 'ESC', descKey: 'shortcuts.close', catKey: 'shortcuts.cat_ui' },
];

// ── Shortcut Help Modal ────────────────────────────────────────────────────────
interface ShortcutHelpModalProps {
  onClose: () => void;
}

export function ShortcutHelpModal({ onClose }: ShortcutHelpModalProps) {
  const { t } = useTranslation();
  // Close on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const categories = [
    { key: 'shortcuts.cat_chat', label: t('shortcuts.cat_chat') },
    { key: 'shortcuts.cat_search', label: t('shortcuts.cat_search') },
    { key: 'shortcuts.cat_ui', label: t('shortcuts.cat_ui') },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-surface-2 border border-border-token rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-on-surface">{t('shortcuts.title')}</h2>
          <button onClick={onClose} className="text-on-surface-muted hover:text-on-surface p-1">
            <X size={18} />
          </button>
        </div>
        {categories.map(({ key, label }) => {
          const items = SHORTCUT_LIST_KEYS.filter((s) => s.catKey === key);
          return (
            <div key={key} className="mb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-muted mb-2">{label}</p>
              <div className="space-y-2">
                {items.map((s) => (
                  <div key={s.keys} className="flex items-center justify-between gap-4">
                    <span className="text-xs text-on-surface-muted">{t(s.descKey)}</span>
                    <kbd className="text-xs bg-gray-700 text-gray-200 px-2 py-0.5 rounded font-mono shrink-0 whitespace-nowrap">{s.keys}</kbd>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        <p className="text-[10px] text-on-surface-muted mt-2 text-center">{t('shortcuts.dismiss_hint')}</p>
      </div>
    </div>
  );
}
