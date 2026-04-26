'use client';

// Share Conversation Modal (Tori 16384367 §4.2)

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  encodeShare,
  makeExpiresAt,
  type SharePayload,
  type SharePolicy,
  type ShareMessage,
} from '@/lib/share-encoder';
import { useFocusTrap } from '@/lib/use-focus-trap';

const tokens = {
  bg:           'var(--d1-bg, #fafaf9)',
  surface:      'var(--d1-surface, #ffffff)',
  surfaceAlt:   'var(--d1-surface-alt, #f5f4f0)',
  text:         'var(--d1-text, #0a0a0a)',
  textDim:      'var(--d1-text-dim, #6b6b6b)',
  textFaint:    'var(--d1-text-faint, #a0a0a0)',
  accent:       'var(--d1-accent, #c65a3c)',
  border:       'var(--d1-border, #e5e5e5)',
  borderStrong: 'var(--d1-border-strong, #c4c4c4)',
  warning:      'rgba(255,193,7,0.1)',
  warningText:  '#92400e',
};

export interface ShareModalProps {
  lang: 'ko' | 'en';
  open: boolean;
  onClose: () => void;
  messages: ShareMessage[];
}

const COPY = {
  ko: {
    title: '대화 공유',
    optFull: '전체 대화 (질문 + 답)',
    optResponseOnly: 'AI 응답만',
    optSystemInfo: '시스템 정보 포함',
    expiry: '만료',
    expiry24h: '24시간',
    expiry7d: '7일',
    expiryForever: '영구',
    warning: '누구나 URL을 알면 이 대화를 볼 수 있어요.',
    copy: '복사 →',
    copied: '링크 복사됨',
    close: '닫기',
    urlPlaceholder: '옵션을 선택하면 URL이 생성돼요',
    tooLong: '대화가 너무 길어 URL로 공유할 수 없어요. 메시지를 줄여보세요.',
  },
  en: {
    title: 'Share conversation',
    optFull: 'Full conversation',
    optResponseOnly: 'AI response only',
    optSystemInfo: 'Include system info',
    expiry: 'Expires',
    expiry24h: '24 hours',
    expiry7d: '7 days',
    expiryForever: 'Never',
    warning: 'Anyone with the URL can view this conversation.',
    copy: 'Copy →',
    copied: 'Link copied',
    close: 'Close',
    urlPlaceholder: 'Pick options to generate the URL',
    tooLong: 'This conversation is too long to share via URL. Try shortening it.',
  },
};

const URL_HARD_LIMIT = 6000;

export function ShareModal({ lang, open, onClose, messages }: ShareModalProps) {
  const t = COPY[lang];
  const [responseOnly, setResponseOnly] = useState(false);
  const [includeSystemInfo, setIncludeSystemInfo] = useState(false);
  const [policy, setPolicy] = useState<SharePolicy>('7d');
  const [toastShown, setToastShown] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // 옵션 변경 시 페이로드 + 토큰 재생성
  const { url, tooLong } = useMemo(() => {
    if (!open) return { url: '', tooLong: false };
    const filtered: ShareMessage[] = responseOnly
      ? messages.filter((m) => m.role === 'assistant')
      : messages;
    const cleaned: ShareMessage[] = filtered.map((m) => ({
      role: m.role,
      content: m.content,
      model: includeSystemInfo ? m.model : undefined,
    }));
    const payload: SharePayload = {
      v: 1,
      createdAt: Date.now(),
      expiresAt: makeExpiresAt(policy),
      messages: cleaned,
      options: { responseOnly, includeSystemInfo },
    };
    const token = encodeShare(payload);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    // [2026-04-26 QA-BUG #2] next.config 'output: export' 호환을 위해 path 동적 라우트 대신
    // query string 사용. 라우트는 src/app/[lang]/share/page.tsx (?t=<token>).
    const u = `${origin}/${lang}/share?t=${token}`;
    return { url: u, tooLong: u.length > URL_HARD_LIMIT };
  }, [open, messages, responseOnly, includeSystemInfo, policy, lang]);

  // open 시 포커스 + ESC
  useEffect(() => {
    if (!open) return;
    setToastShown(false);
    setTimeout(() => dialogRef.current?.focus(), 50);
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // [2026-04-26] Sprint 4 — focus trap
  useFocusTrap(dialogRef, open);

  async function copy() {
    if (tooLong || !url) return;
    try {
      await navigator.clipboard.writeText(url);
      setToastShown(true);
      setTimeout(() => setToastShown(false), 2000);
    } catch {
      // fallback — textarea select
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
      setToastShown(true);
      setTimeout(() => setToastShown(false), 2000);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.title}
      className="fixed inset-0 z-[80] flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.32)' }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[360px] rounded-2xl outline-none"
        style={{ background: tokens.surface, color: tokens.text, boxShadow: '0 24px 60px rgba(0,0,0,0.18)' }}
      >
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: tokens.border }}>
          <h3 className="text-[15px] font-medium">{t.title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="flex h-7 w-7 items-center justify-center rounded-md transition-opacity hover:opacity-70"
            style={{ color: tokens.textFaint }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* URL */}
          <div
            className="break-all rounded-lg border px-3 py-2 text-[12px] font-mono"
            style={{
              background: tokens.surfaceAlt,
              borderColor: tokens.border,
              color: tooLong ? tokens.warningText : tokens.text,
              maxHeight: 88,
              overflowY: 'auto',
            }}
          >
            {tooLong ? t.tooLong : (url || t.urlPlaceholder)}
          </div>

          {/* 옵션 */}
          <div className="space-y-1.5 text-[13px]">
            <Check label={t.optFull} checked={!responseOnly} onChange={(v) => setResponseOnly(!v)} />
            <Check label={t.optResponseOnly} checked={responseOnly} onChange={setResponseOnly} />
            <Check label={t.optSystemInfo} checked={includeSystemInfo} onChange={setIncludeSystemInfo} />
          </div>

          {/* 만료 라디오 */}
          <div>
            <div className="mb-2 text-[11px] uppercase tracking-[0.06em]" style={{ color: tokens.textFaint }}>
              {t.expiry}
            </div>
            <div className="flex gap-2 text-[12px]">
              {(['24h', '7d', 'forever'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPolicy(p)}
                  className="flex-1 rounded-lg border px-2 py-1.5 transition-colors"
                  style={{
                    background: policy === p ? tokens.accent : 'transparent',
                    borderColor: policy === p ? tokens.accent : tokens.border,
                    color: policy === p ? '#fff' : tokens.text,
                    fontWeight: policy === p ? 600 : 400,
                  }}
                >
                  {p === '24h' ? t.expiry24h : p === '7d' ? t.expiry7d : t.expiryForever}
                </button>
              ))}
            </div>
          </div>

          {/* 경고 */}
          <div
            className="rounded-md px-3 py-2 text-[11.5px] leading-[1.5]"
            style={{ background: tokens.warning, color: tokens.warningText }}
          >
            ⚠️ {t.warning}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={copy}
              disabled={tooLong || !url}
              className="flex-1 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-opacity disabled:opacity-50"
              style={{ background: tokens.accent, color: '#fff' }}
            >
              {toastShown ? '✓ ' + t.copied : t.copy}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-3 py-2.5 text-[13px] font-medium"
              style={{ background: tokens.surfaceAlt, color: tokens.text }}
            >
              {t.close}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Check({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-current"
        style={{ accentColor: tokens.accent }}
      />
      <span style={{ color: tokens.text }}>{label}</span>
    </label>
  );
}
