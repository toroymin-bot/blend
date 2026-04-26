'use client';

// [2026-04-26 Tori 16384118 §3.9] $1 도달 시 행동 요청형 알림.
// 옵션 3개: 계속 진행 / 오늘 일시정지 / 한도 늘리기

import { useEffect, useRef } from 'react';
import { useFocusTrap } from '@/lib/use-focus-trap';
import { formatUsd } from '@/lib/cost/estimate-embedding-cost';

const tokens = {
  bg:           'var(--d1-bg, #fafaf9)',
  surface:      'var(--d1-surface, #ffffff)',
  surfaceAlt:   'var(--d1-surface-alt, #f5f4f0)',
  text:         'var(--d1-text, #0a0a0a)',
  textDim:      'var(--d1-text-dim, #6b6b6b)',
  textFaint:    'var(--d1-text-faint, #a0a0a0)',
  accent:       'var(--d1-accent, #c65a3c)',
  border:       'var(--d1-border, #e5e5e5)',
};

const COPY = {
  ko: {
    title: (used: number) => `비용 ${formatUsd(used)} 도달`,
    body:  (used: number, limit: number) =>
      `오늘 임베딩 비용이 ${formatUsd(used)}에 도달했어요. 현재 한도는 ${formatUsd(limit)}입니다.`,
    note:  '이 비용은 사용자의 OpenAI/Google API 키로 직접 청구됩니다.',
    continue: '계속 진행',
    pause:    '오늘 자동 동기화 일시 정지',
    increase: '한도 늘리기 (설정으로)',
  },
  en: {
    title: (used: number) => `Cost reached ${formatUsd(used)}`,
    body:  (used: number, limit: number) =>
      `Embedding cost reached ${formatUsd(used)} today. Daily limit: ${formatUsd(limit)}.`,
    note:  'Charged to your OpenAI/Google API key.',
    continue: 'Continue',
    pause:    'Pause auto-sync today',
    increase: 'Increase limit',
  },
};

export interface CostAlertModalProps {
  lang: 'ko' | 'en';
  open: boolean;
  used: number;
  limit: number;
  onContinue: () => void;
  onPause: () => void;
  onIncrease: () => void;
}

export function CostAlertModal({ lang, open, used, limit, onContinue, onPause, onIncrease }: CostAlertModalProps) {
  const t = COPY[lang];
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => dialogRef.current?.focus(), 50);
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onContinue(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onContinue]);
  useFocusTrap(dialogRef, open);

  if (!open) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={t.title(used)}
      className="fixed inset-0 z-[85] flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.32)' }}
      onClick={onContinue}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl outline-none"
        style={{ background: tokens.surface, color: tokens.text, boxShadow: '0 24px 60px rgba(0,0,0,0.18)' }}
      >
        <div className="px-6 py-5">
          <h3 className="text-[18px] font-medium">{t.title(used)}</h3>
          <p className="mt-2 text-[14px]" style={{ color: tokens.textDim }}>
            {t.body(used, limit)}
          </p>
          <p className="mt-3 text-[12px]" style={{ color: tokens.textFaint }}>
            {t.note}
          </p>

          <div className="mt-6 flex flex-col gap-2">
            <button onClick={onContinue}
              className="rounded-xl px-3 py-2.5 text-[13.5px] font-medium"
              style={{ background: tokens.accent, color: '#fff' }}>
              {t.continue}
            </button>
            <button onClick={onPause}
              className="rounded-xl px-3 py-2.5 text-[13px] font-medium"
              style={{ background: tokens.surfaceAlt, color: tokens.text }}>
              {t.pause}
            </button>
            <button onClick={onIncrease}
              className="rounded-xl px-3 py-2.5 text-[13px]"
              style={{ background: 'transparent', color: tokens.textDim }}>
              {t.increase}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
