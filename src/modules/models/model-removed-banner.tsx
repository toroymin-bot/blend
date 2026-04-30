'use client';

/**
 * ModelRemovedBanner — Tori 21102594 PR #4.
 *
 * 페이지 진입 시 사라진 모델 감지하면 노출. 한 번 dismiss 하면 영구 무시.
 * /models 페이지 진입을 유도해 "새 모델 연결" CTA 제공.
 */

import { useEffect, useState } from 'react';
import {
  detectRemovedModels,
  dismissAllRemovalNotices,
  type RemovedModelNotice,
} from '@/lib/models/removal-tracker';

const tokens = {
  bg:        'rgba(241,196,15,0.10)',
  border:    'rgba(241,196,15,0.50)',
  text:      '#7a5d05',
  textDim:   '#9a7c20',
  accent:    '#c65a3c',
} as const;

const COPY = {
  ko: {
    one:  (id: string) => `${id} 모델이 제거되었습니다.`,
    many: (n: number)  => `${n}개 모델이 제거되었습니다.`,
    cta:  '새로운 모델 연결 →',
    dismiss: '닫기',
  },
  en: {
    one:  (id: string) => `${id} has been removed.`,
    many: (n: number)  => `${n} models have been removed.`,
    cta:  'Connect new model →',
    dismiss: 'Dismiss',
  },
} as const;

export interface ModelRemovedBannerProps {
  lang: 'ko' | 'en';
  onConnectClick?: () => void;
}

export function ModelRemovedBanner({ lang, onConnectClick }: ModelRemovedBannerProps) {
  const t = COPY[lang];
  const [notices, setNotices] = useState<RemovedModelNotice[]>([]);

  useEffect(() => {
    setNotices(detectRemovedModels());
  }, []);

  if (notices.length === 0) return null;

  const message = notices.length === 1
    ? t.one(notices[0].id)
    : t.many(notices.length);

  function handleDismiss() {
    dismissAllRemovalNotices();
    setNotices([]);
  }

  return (
    <div
      className="mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-[13px]"
      style={{ background: tokens.bg, borderColor: tokens.border, color: tokens.text }}
      role="status"
    >
      <span aria-hidden>⚠️</span>
      <div className="flex-1">
        <p>{message}</p>
        {notices.length > 1 && (
          <p className="mt-1 text-[11.5px]" style={{ color: tokens.textDim }}>
            {notices.map((n) => n.id).join(', ')}
          </p>
        )}
        {onConnectClick && (
          <button
            type="button"
            onClick={onConnectClick}
            className="mt-2 text-[12.5px] font-medium underline"
            style={{ color: tokens.accent }}
          >
            {t.cta}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="rounded-md px-2 py-1 text-[11px]"
        style={{ color: tokens.textDim }}
      >
        ✕ {t.dismiss}
      </button>
    </div>
  );
}
