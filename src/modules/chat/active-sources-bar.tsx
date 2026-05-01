'use client';

// [2026-05-01 Roy] 메인 채팅뷰 입력창 위 활성 소스 바 — 그룹화 chip 재설계.
// 이전: ActiveSource[] 평면 나열. 50개 넘으면 헷갈림.
// 새: 5개 카테고리(☁️ Google Drive / 📁 OneDrive / 💾 로컬 / 📄 문서 / 🎙️ 회의)
// 로 그룹화. chip 클릭 → 모달에서 항목 리스트.
//
// chip 구성: [status dot] [icon] [카테고리명] [count] [✕ 모두 비활성화]
// 모바일: flex-wrap으로 자동 줄바꿈.

import { useEffect, useMemo, useState } from 'react';
import type { ActiveSource } from '@/types/active-source';
import { useActiveSourceList } from '@/hooks/use-active-source-list';
import { useDocumentStore } from '@/stores/document-store';
import { useDataSourceStore } from '@/stores/datasource-store';
import { useAPIKeyStore } from '@/stores/api-key-store';
import { SourcesModal } from '@/modules/chat/sources-modal';

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

type Category = 'google-drive' | 'onedrive' | 'local' | 'document' | 'meeting';

const CATEGORY_META: Record<Category, { icon: string; ko: string; en: string; order: number }> = {
  'google-drive': { icon: '☁️',  ko: 'Google Drive', en: 'Google Drive', order: 1 },
  'onedrive':     { icon: '📁',  ko: 'OneDrive',     en: 'OneDrive',     order: 2 },
  'local':        { icon: '💾',  ko: '로컬',          en: 'Local',        order: 3 },
  'document':     { icon: '📄',  ko: '문서',          en: 'Documents',    order: 4 },
  'meeting':      { icon: '🎙️', ko: '회의',          en: 'Meetings',     order: 5 },
};

function categorize(s: ActiveSource, dsTypeMap: Map<string, string>): Category {
  if (s.type === 'meeting') return 'meeting';
  if (s.type === 'datasource-folder') {
    if (s.serviceName === 'google-drive') return 'google-drive';
    if (s.serviceName === 'onedrive') return 'onedrive';
    return 'local';
  }
  // document — datasource origin이면 그 타입 카테고리, 아니면 직접 업로드 → 'document'
  if (s.originSourceId) {
    const t = dsTypeMap.get(s.originSourceId);
    if (t === 'google-drive') return 'google-drive';
    if (t === 'onedrive')     return 'onedrive';
    if (t === 'local')        return 'local';
    if (t === 'webdav')       return 'local';
  }
  return 'document';
}

type CategoryStatus = 'ready' | 'syncing' | 'partial' | 'error' | 'idle';

// [2026-05-01 Roy] 점 + 라벨 + 배경 모두 한 status에서 파생 — 시각 일관성 보장.
function categoryStatus(items: ActiveSource[]): CategoryStatus {
  // worst status 우선 (사용자가 문제를 즉시 인지하도록)
  if (items.some((s) => s.status === 'error'))   return 'error';
  if (items.some((s) => s.status === 'syncing')) return 'syncing';
  if (items.some((s) => s.status === 'partial')) return 'partial';
  if (items.some((s) => s.status === 'ready'))   return 'ready';
  return 'idle';
}

const STATUS_DOT: Record<CategoryStatus, string> = {
  ready:   '#16a34a',
  syncing: '#f59e0b',
  partial: '#ea8c1e', // [2026-05-01 Roy] partial은 더 진한 주황(amber-600)으로 구분
  error:   '#dc2626',
  idle:    '#9ca3af',
};

// ready/idle은 라벨 생략 (정상은 깨끗하게). syncing/partial/error만 텍스트로 명시.
// [2026-05-01 Roy] partial 카피 명확화 — '일부 문제' → '일부 동기화 성공'.
const STATUS_LABEL: Record<'ko' | 'en', Record<CategoryStatus, string | null>> = {
  ko: { ready: null, syncing: '동기화 중', partial: '일부 동기화 성공', error: '오류',  idle: null },
  en: { ready: null, syncing: 'Syncing',   partial: 'Partially synced', error: 'Error', idle: null },
};

export function ActiveSourcesBar({
  lang = 'ko',
  onShowToast,
}: {
  lang?: 'ko' | 'en';
  /** @deprecated 그룹 chip은 모달로 열림 — onNavigate 미사용. 호환성 위해 prop 유지. */
  onNavigate?: (source: ActiveSource) => void;
  onShowToast?: (message: string) => void;
}) {
  const sources = useActiveSourceList(lang);
  const dataSources = useDataSourceStore((s) => s.sources);
  const hasKey = useAPIKeyStore((s) => s.hasKey);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [openCategory, setOpenCategory] = useState<Category | null>(null);

  // sourceId → datasource type 매핑 (document의 originSourceId 카테고리 분류용)
  const dsTypeMap = useMemo(() => {
    const m = new Map<string, string>();
    dataSources.forEach((ds) => m.set(ds.id, ds.type));
    return m;
  }, [dataSources]);

  // 그룹화 — CATEGORY_META.order 순서로 정렬된 [category, items][] 배열
  const grouped = useMemo<Array<[Category, ActiveSource[]]>>(() => {
    const map = new Map<Category, ActiveSource[]>();
    for (const s of sources) {
      const cat = categorize(s, dsTypeMap);
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(s);
    }
    return Array.from(map.entries()).sort(([a], [b]) => CATEGORY_META[a].order - CATEGORY_META[b].order);
  }, [sources, dsTypeMap]);

  // [2026-04-26] D-3 — 활성 문서 idle + 임베딩 키 없음 → 안내 배너
  const showEmbeddingKeyBanner = useMemo(() => {
    if (bannerDismissed) return false;
    const hasIdleDoc = sources.some((s) => s.type === 'document' && s.status === 'idle');
    if (!hasIdleDoc) return false;
    return !hasKey('openai') && !hasKey('google');
  }, [sources, hasKey, bannerDismissed]);

  // Tori 핫픽스 (2026-04-25) — datasource-store 마운트 시 localStorage 로딩 보장
  useEffect(() => { useDataSourceStore.getState().loadFromStorage(); }, []);

  // 0개 → 영역 자체 미렌더링 (배너만 있는 경우 제외)
  if (sources.length === 0 && !showEmbeddingKeyBanner) return null;

  function handleDeactivate(source: ActiveSource) {
    if (source.type === 'document') {
      useDocumentStore.getState().toggleActive(source.documentId);
    } else if (source.type === 'datasource-folder') {
      // 비활성화만 — 연결 해제 X (사용자가 라이브러리에서 다시 활성화 가능)
      useDataSourceStore.getState().setActive(source.dataSourceId, false);
    } else if (source.type === 'meeting') {
      // d1:meetings localStorage 직접 갱신
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

  function handleDeactivateCategory(items: ActiveSource[]) {
    items.forEach(handleDeactivate);
  }

  function handleCategoryClick(cat: Category, items: ActiveSource[]) {
    // 항목이 1개 + error면 navigate 대신 안내 토스트 (image-only PDF 등)
    if (items.length === 1 && items[0].status === 'error' && items[0].errorMessage && onShowToast) {
      onShowToast(items[0].errorMessage);
      return;
    }
    setOpenCategory(cat);
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

  // 모달용 — store 변경 시 자동 갱신
  const openItems = openCategory
    ? (grouped.find(([c]) => c === openCategory)?.[1] ?? [])
    : [];

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
          <div className="flex-1">
            <div className="font-medium">{bannerCopy.title}</div>
            <div className="mt-0.5" style={{ color: tokens.textDim }}>{bannerCopy.body}</div>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('d1:nav-to', { detail: { view: 'settings' } }))}
              className="mt-1 text-[12px] underline"
              style={{ color: tokens.accent }}
            >
              {bannerCopy.cta}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setBannerDismissed(true)}
            aria-label={bannerCopy.close}
            className="shrink-0 text-[12px]"
            style={{ color: tokens.textDim }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 카테고리 chip — flex-wrap으로 모바일에서 자동 줄바꿈 */}
      {grouped.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 py-2.5">
          {grouped.map(([cat, items]) => (
            <CategoryChip
              key={cat}
              category={cat}
              items={items}
              lang={lang}
              onClick={() => handleCategoryClick(cat, items)}
              onDeactivateAll={() => handleDeactivateCategory(items)}
            />
          ))}
        </div>
      )}

      {/* 카테고리 상세 모달 */}
      {openCategory && (
        <SourcesModal
          open
          icon={CATEGORY_META[openCategory].icon}
          title={lang === 'ko' ? CATEGORY_META[openCategory].ko : CATEGORY_META[openCategory].en}
          items={openItems}
          lang={lang}
          onClose={() => setOpenCategory(null)}
          onDeactivate={(s) => {
            handleDeactivate(s);
            // 마지막 항목이면 모달 닫기
            if (openItems.length <= 1) setOpenCategory(null);
          }}
          onDeactivateAll={() => handleDeactivateCategory(openItems)}
        />
      )}
    </div>
  );
}

function CategoryChip({
  category, items, lang, onClick, onDeactivateAll,
}: {
  category: Category;
  items: ActiveSource[];
  lang: 'ko' | 'en';
  onClick: () => void;
  onDeactivateAll: () => void;
}) {
  const meta = CATEGORY_META[category];
  const status = categoryStatus(items);
  const dot = STATUS_DOT[status];
  const statusLabel = STATUS_LABEL[lang][status];
  const label = lang === 'ko' ? meta.ko : meta.en;
  const isError = status === 'error';
  const isPartial = status === 'partial';
  // [2026-05-01 Roy] error는 빨간 톤, partial은 주황 톤으로 시각 분리.
  // 일부 성공한 케이스를 '전체 실패'로 오인하지 않게.
  const chipBg = isError
    ? 'rgba(220,38,38,0.08)'
    : isPartial
      ? 'rgba(234,140,30,0.10)'
      : tokens.surface;
  const chipBorder = isError
    ? 'rgba(220,38,38,0.35)'
    : isPartial
      ? 'rgba(234,140,30,0.35)'
      : tokens.border;
  const labelColor = isError ? '#dc2626' : isPartial ? '#b45309' : tokens.textDim;
  const tooltip = lang === 'ko'
    ? `${label} · ${items.length}개${statusLabel ? ` · ${statusLabel}` : ''} — 클릭해서 항목 보기`
    : `${label} · ${items.length} item${items.length === 1 ? '' : 's'}${statusLabel ? ` · ${statusLabel}` : ''} — click to view`;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}
      className="group inline-flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors hover:opacity-90"
      style={{
        background: chipBg,
        border: `1px solid ${chipBorder}`,
        color: tokens.text,
        cursor: 'pointer',
        maxWidth: 280,
      }}
      title={tooltip}
      aria-label={tooltip}
    >
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
        style={{ background: dot }}
      />
      <span aria-hidden className="shrink-0">{meta.icon}</span>
      <span className="truncate" style={{ maxWidth: 140 }}>{label}</span>
      <span className="shrink-0 text-[12px]" style={{ color: tokens.textFaint }}>
        {items.length}
      </span>
      {statusLabel && (
        <span
          className="shrink-0 text-[11.5px] font-medium"
          style={{ color: labelColor }}
        >
          · {statusLabel}
        </span>
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDeactivateAll(); }}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-black/5"
        style={{ color: tokens.textFaint, background: 'transparent' }}
        aria-label={lang === 'ko' ? '모두 비활성화' : 'Deactivate all'}
      >
        <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
