'use client';

// [2026-05-01 Roy] 활성 소스 카테고리 상세 모달
// chip bar에서 카테고리 chip 클릭 시 열림. 그 카테고리의 항목들 평면 리스트로 표시.
// 각 항목 X = 개별 비활성화. 영구 삭제는 별도 (이번 작업 X).
//
// 반응형:
//   - 모바일: 하단 시트 (slide up, full-width, top rounded). drag handle 표시.
//   - 데스크톱(md+): 가운데 모달 (max-w-md, rounded-2xl).

import { useEffect } from 'react';
import type { ActiveSource } from '@/types/active-source';

const tokens = {
  bg:        'var(--d1-bg)',
  surface:   'var(--d1-surface)',
  text:      'var(--d1-text)',
  textDim:   'var(--d1-text-dim)',
  textFaint: 'var(--d1-text-faint)',
  border:    'var(--d1-border)',
  danger:    'var(--d1-danger)',
} as const;

interface Props {
  open: boolean;
  icon: string;
  title: string;
  items: ActiveSource[];
  lang: 'ko' | 'en';
  onClose: () => void;
  onDeactivate: (source: ActiveSource) => void;
  onDeactivateAll: () => void;
}

export function SourcesModal({
  open, icon, title, items, lang, onClose, onDeactivate, onDeactivateAll,
}: Props) {
  // ESC로 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // 모바일 sheet 열렸을 때 body scroll 잠금
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const t = lang === 'ko'
    ? { close: '닫기', deactivateAll: '모두 비활성화', empty: '항목이 없어요', count: (n: number) => `${n}개` }
    : { close: 'Close', deactivateAll: 'Deactivate all', empty: 'No items', count: (n: number) => `${n} item${n === 1 ? '' : 's'}` };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[70]"
        style={{ background: 'rgba(0,0,0,0.4)' }}
        onClick={onClose}
        aria-hidden
      />
      {/* Sheet (모바일) / Modal (데스크톱) */}
      <div
        className="fixed z-[71] flex flex-col overflow-hidden shadow-2xl
                   inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl
                   md:left-1/2 md:right-auto md:bottom-auto md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2
                   md:w-full md:max-w-md md:max-h-[80vh] md:rounded-2xl"
        style={{ background: tokens.surface, color: tokens.text }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sources-modal-title"
      >
        {/* Drag handle (모바일 전용) */}
        <div className="flex justify-center pt-2.5 pb-1 md:hidden">
          <div className="h-1 w-10 rounded-full" style={{ background: tokens.border }} />
        </div>

        {/* Header */}
        <div
          className="flex items-center justify-between gap-3 border-b px-5 py-3.5 md:py-4"
          style={{ borderColor: tokens.border }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span aria-hidden style={{ fontSize: 18 }}>{icon}</span>
            <h2
              id="sources-modal-title"
              className="truncate text-[15px] font-semibold"
              style={{ color: tokens.text }}
            >
              {title}
            </h2>
            <span className="shrink-0 text-[12px]" style={{ color: tokens.textFaint }}>
              · {t.count(items.length)}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md px-2 py-1 text-[16px] leading-none transition-colors hover:bg-black/5"
            style={{ color: tokens.textDim }}
            aria-label={t.close}
          >
            ✕
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto" style={{ minHeight: 80 }}>
          {items.length === 0 ? (
            <div className="px-5 py-8 text-center text-[13px]" style={{ color: tokens.textFaint }}>
              {t.empty}
            </div>
          ) : (
            <ul className="divide-y" style={{ borderColor: tokens.border }}>
              {items.map((s) => (
                <SourceListItem
                  key={s.id}
                  source={s}
                  lang={lang}
                  onDeactivate={() => onDeactivate(s)}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Footer — bulk action */}
        {items.length > 0 && (
          <div
            className="border-t px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            style={{ borderColor: tokens.border, background: tokens.bg }}
          >
            <button
              type="button"
              onClick={() => { onDeactivateAll(); onClose(); }}
              className="w-full rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors hover:bg-black/[0.03]"
              style={{ background: 'transparent', color: tokens.danger, border: `1px solid ${tokens.border}` }}
            >
              {t.deactivateAll}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function SourceListItem({
  source, lang, onDeactivate,
}: {
  source: ActiveSource;
  lang: 'ko' | 'en';
  onDeactivate: () => void;
}) {
  const dotColor =
    source.status === 'error'   ? '#dc2626' :
    source.status === 'syncing' ? '#f59e0b' :
    source.status === 'partial' ? '#f59e0b' :
    source.status === 'ready'   ? '#16a34a' :
                                  '#9ca3af';

  const subtitle = source.subtitle || '';
  const ariaLabel = lang === 'ko' ? '비활성화' : 'Deactivate';

  return (
    <li className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-black/[0.02]">
      <span
        aria-hidden
        className="shrink-0 inline-block h-2 w-2 rounded-full"
        style={{ background: dotColor }}
      />
      <span aria-hidden className="shrink-0" style={{ fontSize: 14 }}>{source.icon}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px]" style={{ color: tokens.text }}>
          {source.title}
        </div>
        {subtitle && (
          <div className="truncate text-[12px]" style={{ color: tokens.textFaint }}>
            {subtitle}
          </div>
        )}
        {source.errorMessage && (
          <div className="mt-0.5 text-[12px]" style={{ color: tokens.danger }}>
            {source.errorMessage}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onDeactivate}
        className="shrink-0 rounded-md p-2 text-[14px] leading-none transition-colors hover:bg-black/5"
        style={{ color: tokens.textFaint }}
        aria-label={ariaLabel}
        title={ariaLabel}
      >
        ✕
      </button>
    </li>
  );
}
