'use client';

/**
 * Surfaces the global `blend:storage-quota-exceeded` event from
 * `safeSetItem` (src/lib/safe-storage.ts) as a dismissable toast so
 * the user knows a save was dropped instead of failing silently.
 *
 * Mounted once at the app shell layer (AppContent + AppContentDesign1).
 */

import { useEffect, useState } from 'react';
import type { StorageQuotaDetail } from '@/lib/safe-storage';

type Toast = StorageQuotaDetail & { id: number; ts: number };

const COPY = {
  ko: {
    title: '브라우저 저장 공간이 가득 찼어요',
    body: (store: string) =>
      `최근 변경(${store})이 저장되지 않았습니다. 보안 → 모든 데이터 삭제 또는 오래된 채팅을 정리해 주세요.`,
    dismiss: '닫기',
    open: '보안 열기',
  },
  en: {
    title: 'Browser storage is full',
    body: (store: string) =>
      `Your latest change to "${store}" wasn't saved. Open Security to export a backup or clean up old chats.`,
    dismiss: 'Dismiss',
    open: 'Open security',
  },
} as const;

function detectLang(): 'ko' | 'en' {
  if (typeof window === 'undefined') return 'ko';
  return window.location.pathname.startsWith('/en') ? 'en' : 'ko';
}

export function StorageQuotaToast({ onOpenSecurity }: { onOpenSecurity?: () => void }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [lang, setLang] = useState<'ko' | 'en'>('ko');

  useEffect(() => {
    setLang(detectLang());
    let nextId = 1;
    let lastTs = 0;
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<StorageQuotaDetail>).detail;
      if (!detail) return;
      // Coalesce bursts: ignore duplicates fired within 2s for the same store.
      const now = Date.now();
      if (now - lastTs < 2000) return;
      lastTs = now;
      const id = nextId++;
      setToasts((prev) => [...prev, { ...detail, id, ts: now }].slice(-3));
      // Auto-dismiss after 8s
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 8000);
    };
    window.addEventListener('blend:storage-quota-exceeded', handler as EventListener);
    return () => window.removeEventListener('blend:storage-quota-exceeded', handler as EventListener);
  }, []);

  if (toasts.length === 0) return null;
  const t = COPY[lang];

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[80] flex max-w-sm flex-col gap-2"
      aria-live="polite"
      role="status"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 shadow-lg"
        >
          <div className="text-[13px] font-semibold">{t.title}</div>
          <div className="mt-1 text-[12.5px] leading-snug">
            {t.body(toast.store)}
          </div>
          <div className="mt-2.5 flex justify-end gap-2">
            {onOpenSecurity && (
              <button
                onClick={() => {
                  onOpenSecurity();
                  setToasts((prev) => prev.filter((x) => x.id !== toast.id));
                }}
                className="rounded-md bg-amber-900/10 px-2.5 py-1 text-[11.5px] font-medium hover:bg-amber-900/15"
              >
                {t.open}
              </button>
            )}
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== toast.id))}
              className="rounded-md px-2.5 py-1 text-[11.5px] hover:bg-amber-900/10"
            >
              {t.dismiss}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
