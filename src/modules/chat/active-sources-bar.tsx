'use client';

// Tori 명세 — 메인 채팅뷰 입력창 위 활성 소스 바 (Komi_Active_Sources_Bar_Unified_RAG_2026-04-25.md)
// 가로 스크롤 + 페이드 그라데이션 + 칩 (✕ 비활성 / 본체 라이브러리 이동)

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ActiveSource } from '@/types/active-source';
import { useActiveSourceList } from '@/hooks/use-active-source-list';
import { useDocumentStore } from '@/stores/document-store';
import { useDataSourceStore } from '@/stores/datasource-store';
import { useAPIKeyStore } from '@/stores/api-key-store';
import { StatusDot } from '@/modules/chat/status-dot';

// [2026-04-26] D-2 — embedProgress + 현재시각으로 남은시간 추정
function computeEtaSec(startedAt: number, percent: number): number | null {
  if (percent <= 0 || percent >= 100) return null;
  const elapsed = (Date.now() - startedAt) / 1000;
  if (elapsed <= 0) return null;
  return Math.max(0, (elapsed * (100 - percent)) / percent);
}

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
  onShowToast,
}: {
  lang?: 'ko' | 'en';
  onNavigate?: (source: ActiveSource) => void;
  onShowToast?: (message: string) => void;
}) {
  const sources = useActiveSourceList(lang);
  const embedProgress = useDocumentStore((s) => s.embedProgress);
  const hasKey = useAPIKeyStore((s) => s.hasKey);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade]   = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);
  // [2026-04-26] D-3 — 임베딩 키 안내 dismiss 상태 (sessionStorage 1회용)
  const [bannerDismissed, setBannerDismissed] = useState(false);
  // [2026-04-26] D-2 — 1초마다 ETA 갱신 (syncing 칩이 하나라도 있을 때만)
  const [, setNowTick] = useState(0);
  const hasSyncing = sources.some((s) => s.status === 'syncing');
  useEffect(() => {
    if (!hasSyncing) return;
    const id = setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [hasSyncing]);

  // [2026-04-26] D-3 — 활성 문서 idle + 임베딩 키 없음 → 안내 배너
  const showEmbeddingKeyBanner = useMemo(() => {
    if (bannerDismissed) return false;
    const hasIdleDoc = sources.some((s) => s.type === 'document' && s.status === 'idle');
    if (!hasIdleDoc) return false;
    return !hasKey('openai') && !hasKey('google');
  }, [sources, hasKey, bannerDismissed]);

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

  // [2026-04-26] D-3 — 칩이 없어도 배너만은 띄울 수 있도록 가드 완화
  if (sources.length === 0 && !showEmbeddingKeyBanner) return null;

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
    // [2026-05-01 Roy] error 칩 클릭 시 navigate 대신 안내 토스트 — 사용자가
    // 빨간 dot이 무슨 뜻인지 즉시 인지하고 대처(OCR 처리 등)할 수 있게.
    if (source.status === 'error' && source.errorMessage && onShowToast) {
      onShowToast(source.errorMessage);
      return;
    }
    if (onNavigate) onNavigate(source);
  }

  const bannerCopy = lang === 'ko'
    ? {
        title: '임베딩 키가 없어요',
        body:  '활성 문서를 의미 검색하려면 OpenAI 또는 Google Gemini 키가 필요해요. 지금은 키워드 검색만 동작합니다.',
        cta:   '설정에서 추가',
        close: '닫기',
      }
    : {
        title: 'No embedding key',
        body:  'Add an OpenAI or Google Gemini key to enable semantic search over active documents. Keyword search still works.',
        cta:   'Add in Settings',
        close: 'Dismiss',
      };

  return (
    <div
      className="relative w-full"
      style={{ background: tokens.bg, borderTop: `1px solid ${tokens.border}` }}
    >
      {showEmbeddingKeyBanner && (
        <div
          className="flex items-start gap-3 border-b px-4 py-2.5 text-[12.5px]"
          style={{ background: tokens.accentSoft, borderColor: tokens.border, color: tokens.text }}
          role="alert"
        >
          <span aria-hidden style={{ fontSize: 14, lineHeight: 1, marginTop: 1 }}>🔑</span>
          <div className="flex-1 min-w-0">
            <div className="font-medium" style={{ color: tokens.text }}>
              {bannerCopy.title}
            </div>
            <div className="mt-0.5" style={{ color: tokens.textDim }}>
              {bannerCopy.body}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('blend:open-settings', { detail: { section: 'api' } }));
              }
            }}
            className="shrink-0 rounded-md px-2.5 py-1 text-[12px] font-medium"
            style={{ background: tokens.accent, color: '#fff' }}
          >
            {bannerCopy.cta}
          </button>
          <button
            type="button"
            onClick={() => setBannerDismissed(true)}
            className="shrink-0 px-1.5 py-1 text-[12px]"
            style={{ color: tokens.textFaint }}
            aria-label={bannerCopy.close}
          >
            ✕
          </button>
        </div>
      )}
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
        {sources.map((s) => {
          let eta: number | null = null;
          if (s.status === 'syncing' && s.type === 'document') {
            const prog = embedProgress[s.documentId];
            if (prog?.status === 'embedding') {
              eta = computeEtaSec(prog.startedAt, prog.percent);
            }
          }
          return (
            <ActiveSourceChip
              key={s.id}
              source={s}
              onClick={() => handleClick(s)}
              onDeactivate={() => handleDeactivate(s)}
              etaSeconds={eta}
              lang={lang}
            />
          );
        })}
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

// [2026-04-26] D-2 — 초 → "Ns" / "Nm Ns" / "Nh Nm" 식으로 짧게
function formatEta(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// [2026-04-26] D-2 — progress가 0~100 percent로 들어올 때 "NN%" 식 라벨,
// 그 외 (current/total)는 "current/total" 식으로 표시
function progressLabel(p: ActiveSource['progress']): string {
  if (!p || p.total <= 0) return '';
  if (p.total === 100) return `${Math.round(p.current)}%`;
  return `${p.current}/${p.total}`;
}

// [2026-04-26 Tori 16384118 §1.3] hover 툴팁 카피 — 상태별 풍부한 정보
function buildTooltip(
  source: ActiveSource,
  etaSeconds: number | null | undefined,
  lang: 'ko' | 'en',
): string {
  const ko = lang === 'ko';
  const baseTitle = source.subtitle ? `${source.title} · ${source.subtitle}` : source.title;
  const indexed = source.chunkCount;
  const progress = source.progress;

  if (source.status === 'error') {
    if (source.errorMessage) return `${baseTitle} — ${source.errorMessage}`;
    return ko
      ? `${baseTitle} — 검색 문제. 칩의 ⚠️ 클릭으로 해결`
      : `${baseTitle} — search issue. Click ⚠️ to resolve`;
  }
  if (source.status === 'syncing' && progress && progress.total > 0) {
    const cur = progress.current;
    const tot = progress.total;
    const pct = tot === 100 ? Math.round(cur) : Math.round((cur / tot) * 100);
    const etaSegment = etaSeconds != null && etaSeconds > 0 ? ` · ${ko ? '약' : '~'} ${formatEta(etaSeconds)}` : '';
    return ko
      ? `동기화 중 · ${cur}/${tot} (${pct}%)${etaSegment}`
      : `Syncing · ${cur}/${tot} (${pct}%)${etaSegment}`;
  }
  // ready / idle — 검색 가능
  return ko
    ? `검색 가능 · ${indexed}개 인덱싱됨`
    : `Searchable · ${indexed} indexed`;
}

function ActiveSourceChip({
  source, onClick, onDeactivate, etaSeconds, lang,
}: {
  source: ActiveSource;
  onClick: () => void;
  onDeactivate: () => void;
  etaSeconds?: number | null;
  lang: 'ko' | 'en';
}) {
  const baseTitle = source.subtitle
    ? `${source.title} · ${source.subtitle}`
    : source.title;
  const pLabel = progressLabel(source.progress);
  const displayText = pLabel ? `${baseTitle} · ${pLabel}` : baseTitle;
  const tooltip = buildTooltip(source, etaSeconds, lang);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}
      className="group inline-flex shrink-0 items-center rounded-md px-2.5 py-1.5 text-[13px] transition-colors"
      style={{
        background: tokens.surface,
        border: `1px solid ${tokens.border}`,
        color: tokens.text,
        cursor: 'pointer',
        maxWidth: 240,
      }}
      title={tooltip}
      aria-label={tooltip}
    >
      <StatusDot status={source.status} />
      <span className="shrink-0 mr-1.5">{source.icon}</span>
      <span className="truncate mr-1.5" style={{ maxWidth: 180 }}>{displayText}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDeactivate(); }}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded transition-colors"
        style={{ color: tokens.textFaint, background: 'transparent' }}
        aria-label={lang === 'ko' ? '비활성화' : 'deactivate'}
      >
        <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
