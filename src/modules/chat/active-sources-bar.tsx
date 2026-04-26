'use client';

// Tori 명세 — 메인 채팅뷰 입력창 위 활성 소스 바 (Komi_Active_Sources_Bar_Unified_RAG_2026-04-25.md)
// 가로 스크롤 + 페이드 그라데이션 + 칩 (✕ 비활성 / 본체 라이브러리 이동)

import { useEffect, useRef, useState } from 'react';
import type { ActiveSource } from '@/types/active-source';
import { useActiveSourceList } from '@/hooks/use-active-source-list';
import { useDocumentStore } from '@/stores/document-store';
import { useDataSourceStore } from '@/stores/datasource-store';

const tokens = {
  bg:           'var(--d1-bg)',
  surface:      'var(--d1-surface)',
  surfaceAlt:   'var(--d1-surface-alt)',
  text:         'var(--d1-text)',
  textDim:      'var(--d1-text-dim)',
  textFaint:    'var(--d1-text-faint)',
  accent:       'var(--d1-accent)',
  accentSoft:   'var(--d1-accent-soft)',
  border:       'var(--d1-border)',
  borderStrong: 'var(--d1-border-strong)',
} as const;

export function ActiveSourcesBar({
  lang = 'ko',
  onNavigate,
}: {
  lang?: 'ko' | 'en';
  onNavigate?: (source: ActiveSource) => void;
}) {
  const sources = useActiveSourceList(lang);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade]   = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  // Tori 핫픽스 (2026-04-25) — datasource-store 마운트 시 localStorage 로딩 보장
  useEffect(() => { useDataSourceStore.getState().loadFromStorage(); }, []);

  // 0개 → 영역 자체 미렌더링
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      setShowLeftFade(el.scrollLeft > 0);
      setShowRightFade(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(onScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, [sources.length]);

  if (sources.length === 0) return null;

  function handleDeactivate(source: ActiveSource) {
    if (source.type === 'document') {
      useDocumentStore.getState().toggleActive(source.documentId);
    } else if (source.type === 'datasource-folder') {
      // 비활성화만 — 연결 해제 X (사용자가 라이브러리에서 다시 활성화 가능)
      useDataSourceStore.getState().setActive(source.dataSourceId, false);
    } else if (source.type === 'meeting') {
      // Phase 3b — d1:meetings localStorage 직접 갱신
      try {
        const raw = localStorage.getItem('d1:meetings');
        if (raw) {
          const arr = JSON.parse(raw) as { id: string; isActive?: boolean }[];
          const next = arr.map((m) => (m.id === source.meetingId ? { ...m, isActive: false } : m));
          localStorage.setItem('d1:meetings', JSON.stringify(next));
          window.dispatchEvent(new CustomEvent('d1:meetings-changed'));
        }
      } catch {}
    }
  }

  function handleClick(source: ActiveSource) {
    if (onNavigate) onNavigate(source);
  }

  return (
    <div
      className="relative w-full"
      style={{ background: tokens.bg, borderTop: `1px solid ${tokens.border}` }}
    >
      {showLeftFade && (
        <div
          className="pointer-events-none absolute top-0 bottom-0 left-0 w-8 z-10"
          style={{ background: `linear-gradient(to right, ${tokens.bg}, transparent)` }}
        />
      )}
      <div
        ref={scrollRef}
        className="flex gap-2 px-4 py-2.5"
        style={{
          overflowX: 'auto',
          overflowY: 'hidden',
          whiteSpace: 'nowrap',
          scrollBehavior: 'smooth',
          scrollbarWidth: 'none',
        }}
      >
        {sources.map((s) => (
          <ActiveSourceChip
            key={s.id}
            source={s}
            onClick={() => handleClick(s)}
            onDeactivate={() => handleDeactivate(s)}
          />
        ))}
      </div>
      {showRightFade && (
        <div
          className="pointer-events-none absolute top-0 bottom-0 right-0 w-8 z-10"
          style={{ background: `linear-gradient(to left, ${tokens.bg}, transparent)` }}
        />
      )}
      <style jsx>{`
        div[ref]::-webkit-scrollbar { display: none; }
        div::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

function statusColor(status?: string): string {
  switch (status) {
    case 'ready':   return '#16a34a';
    case 'syncing': return '#d97706';
    case 'error':   return '#dc2626';
    case 'idle':
    default:        return '#9ca3af';
  }
}

function ActiveSourceChip({
  source, onClick, onDeactivate,
}: {
  source: ActiveSource;
  onClick: () => void;
  onDeactivate: () => void;
}) {
  const baseTitle = source.subtitle
    ? `${source.title} · ${source.subtitle}`
    : source.title;
  const progressLabel = source.progress && source.progress.total > 0
    ? `${source.progress.current}/${source.progress.total}`
    : '';
  const displayText = progressLabel ? `${baseTitle} · ${progressLabel}` : baseTitle;
  const dotColor = statusColor(source.status);
  const isPulse = source.status === 'syncing';
  const tooltip = source.errorMessage
    ? `${baseTitle} — ${source.errorMessage}`
    : displayText;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}
      className="group inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors"
      style={{
        background: tokens.surface,
        border: `1px solid ${tokens.border}`,
        color: tokens.text,
        cursor: 'pointer',
        maxWidth: 240,
      }}
      title={tooltip}
    >
      <span
        aria-hidden
        className="inline-block shrink-0 rounded-full"
        style={{
          width: 7,
          height: 7,
          background: dotColor,
          animation: isPulse ? 'd1-chip-pulse 1.4s ease-in-out infinite' : 'none',
        }}
      />
      <span className="shrink-0">{source.icon}</span>
      <span className="truncate" style={{ maxWidth: 180 }}>{displayText}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDeactivate(); }}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded transition-colors"
        style={{ color: tokens.textFaint, background: 'transparent' }}
        aria-label="deactivate"
      >
        <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
      <style jsx>{`
        @keyframes d1-chip-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.45; transform: scale(0.8); }
        }
      `}</style>
    </div>
  );
}
