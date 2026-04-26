'use client';

/**
 * D1DocumentsView — Design1 Documents view
 * "파일 올리고, 그 안에 대해 물어보세요."
 *
 * 기존 useDocumentStore + parseDocument + generateEmbeddings 재사용.
 * RAG 컨텍스트 주입은 채팅 모듈이 활성 문서를 자동으로 사용 (이 화면은 파일 관리 전용).
 */

import { useEffect, useRef, useState } from 'react';
import { useDocumentStore } from '@/stores/document-store';
import { useAPIKeyStore } from '@/stores/api-key-store';
import { parseDocument, generateEmbeddings } from '@/modules/plugins/document-plugin';
import type { ParsedDocument } from '@/modules/plugins/document-plugin';

// ── Design tokens ────────────────────────────────────────────────
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
  danger:       'var(--d1-danger)',
} as const;

// ── Constants ────────────────────────────────────────────────────
const SUPPORTED_EXT = ['pdf', 'xlsx', 'xls', 'csv', 'txt', 'md'] as const;
const MAX_BYTES = 50 * 1024 * 1024;

// ── Copy ─────────────────────────────────────────────────────────
const copy = {
  ko: {
    title:        '문서',
    subtitle:     '파일 올리고, 그 안에 대해 물어보세요.',
    dropHere:     '파일을 여기로 드래그',
    chooseFile:   '파일 선택',
    formatHint:   'PDF · Excel · CSV · TXT · MD',
    add:          '추가',
    delete:       '삭제',
    confirmDel:   '이 파일을 삭제할까요?',
    cancel:       '취소',
    yesDelete:    '삭제',
    sizeOver:     '파일이 너무 커요 (50MB 이하)',
    unsupported:  '지원하지 않는 형식',
    embedding:    '분석 중',
    embedDone:    '준비됨',
    embedError:   '분석 실패',
    noEmbedKey:   'API 키 없음 — OpenAI 또는 Google 키를 설정하면 자동 분석',
    activeOn:     '채팅에 사용',
    activeOff:    '채팅에 미사용',
    chunks:       '청크',
    chars:        '자',
    counter:      '파일',
    askCta:       '활성 문서에 대해 질문하기 →',
    activeCount:  (n: number) => `${n}개 문서 활성`,
    // P2.1 하이브리드 탭 (Tori 명세)
    tabLibrary:   '📁 라이브러리',
    tabChat:      '💬 문서로 채팅',
    chatEmpty:    '활성화된 문서가 없어요',
    chatEmptyHint:'라이브러리에서 "채팅에 사용" 토글을 켜주세요',
    activeDocs:   '활성 문서',
    openInChat:   '메인 채팅에서 시작',
    chatPlaceholder: (n: number) => `활성 문서 ${n}개에 대해 물어보세요`,
    // P3.4 미리보기
    preview:       '미리보기',
    previewClose:  '닫기',
    previewMore:   (n: number) => `... 그 외 ${n}개 청크 더 있음`,
  },
  en: {
    title:        'Documents',
    subtitle:     'Drop files. Ask about them.',
    dropHere:     'Drop files here',
    chooseFile:   'Choose file',
    formatHint:   'PDF · Excel · CSV · TXT · MD',
    add:          'Add',
    delete:       'Delete',
    confirmDel:   'Delete this file?',
    cancel:       'Cancel',
    yesDelete:    'Delete',
    sizeOver:     'File too large (max 50MB)',
    unsupported:  'Unsupported format',
    embedding:    'Analyzing',
    embedDone:    'Ready',
    embedError:   'Analysis failed',
    noEmbedKey:   'No API key — set OpenAI or Google key for auto analysis',
    activeOn:     'Used in chat',
    activeOff:    'Not in chat',
    chunks:       'chunks',
    chars:        'chars',
    counter:      'files',
    askCta:       'Ask about active documents →',
    activeCount:  (n: number) => `${n} active`,
    // P2.1 hybrid tabs (Tori spec)
    tabLibrary:   '📁 Library',
    tabChat:      '💬 Chat with docs',
    chatEmpty:    'No active documents',
    chatEmptyHint:'Toggle "Used in chat" in Library',
    activeDocs:   'Active documents',
    openInChat:   'Open in main chat',
    chatPlaceholder: (n: number) => `Ask about ${n} active doc${n === 1 ? '' : 's'}`,
    // P3.4 preview
    preview:       'Preview',
    previewClose:  'Close',
    previewMore:   (n: number) => `... and ${n} more chunks`,
  },
} as const;

// ── Helpers ──────────────────────────────────────────────────────
function fmtBytes(n?: number): string {
  if (!n || n <= 0) return '';
  if (n < 1024)             return `${n} B`;
  if (n < 1024 * 1024)      return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function extOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function fileSizeFromDoc(doc: ParsedDocument): number {
  // ParsedDocument는 size를 갖고있지 않음 — 대신 totalChars로 대체 표시
  return 0;
}

type EmbedStatus = 'idle' | 'embedding' | 'done' | 'error';

// ── Main view ────────────────────────────────────────────────────
export default function D1DocumentsView({
  lang,
  onAskAboutDocs,
}: {
  lang: 'ko' | 'en';
  onAskAboutDocs?: () => void;
}) {
  const t = copy[lang];

  const documents     = useDocumentStore((s) => s.documents);
  const activeDocIds  = useDocumentStore((s) => s.activeDocIds);
  const addDocument   = useDocumentStore((s) => s.addDocument);
  const updateDocument= useDocumentStore((s) => s.updateDocument);
  const removeDocument= useDocumentStore((s) => s.removeDocument);
  const toggleActive  = useDocumentStore((s) => s.toggleActive);
  const loadFromDB    = useDocumentStore((s) => s.loadFromDB);
  // [2026-04-26] D-1 — store에 진행률 emit하여 채팅 칩에서 표시
  const beginEmbedding   = useDocumentStore((s) => s.beginEmbedding);
  const setEmbedPercent  = useDocumentStore((s) => s.setEmbedPercent);
  const finishEmbedding  = useDocumentStore((s) => s.finishEmbedding);

  const { getKey } = useAPIKeyStore();

  useEffect(() => {
    loadFromDB();
  }, [loadFromDB]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging]       = useState(false);
  const [errorMsg, setErrorMsg]           = useState<string | null>(null);
  const [embedStatus, setEmbedStatus]     = useState<Record<string, EmbedStatus>>({});
  const [embedProgress, setEmbedProgress] = useState<Record<string, number>>({});
  const [confirmDelId, setConfirmDelId]   = useState<string | null>(null);
  // P3.4 — 파일 인라인 미리보기 모달
  const [previewDocId, setPreviewDocId]   = useState<string | null>(null);
  // P2.1 — 하이브리드 탭 상태 (localStorage 영속화)
  const [tab, setTab] = useState<'library' | 'chat'>(() => {
    if (typeof window === 'undefined') return 'library';
    return localStorage.getItem('d1:docs-tab') === 'chat' ? 'chat' : 'library';
  });
  useEffect(() => {
    try { localStorage.setItem('d1:docs-tab', tab); } catch {}
  }, [tab]);

  const embeddingKey = getKey('openai') || getKey('google') || '';
  const embeddingProvider: 'openai' | 'google' | null = getKey('openai')
    ? 'openai'
    : getKey('google')
    ? 'google'
    : null;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setErrorMsg(null);

    for (const file of Array.from(files)) {
      if (file.size > MAX_BYTES) {
        setErrorMsg(`${t.sizeOver}: ${file.name}`);
        continue;
      }
      const ext = extOf(file.name);
      if (!SUPPORTED_EXT.includes(ext as typeof SUPPORTED_EXT[number])) {
        setErrorMsg(`${t.unsupported}: ${file.name}`);
        continue;
      }

      try {
        const doc = await parseDocument(file);
        addDocument(doc);

        if (embeddingProvider) {
          setEmbedStatus((p) => ({ ...p, [doc.id]: 'embedding' }));
          setEmbedProgress((p) => ({ ...p, [doc.id]: 0 }));
          beginEmbedding(doc.id);
          generateEmbeddings(doc, embeddingKey, embeddingProvider, (pct) => {
            setEmbedProgress((p) => ({ ...p, [doc.id]: pct }));
            setEmbedPercent(doc.id, pct);
          })
            .then((embedded) => {
              updateDocument(embedded);
              setEmbedStatus((p) => ({ ...p, [doc.id]: 'done' }));
              setEmbedProgress((p) => ({ ...p, [doc.id]: 100 }));
              finishEmbedding(doc.id, true);
            })
            .catch((e) => {
              setEmbedStatus((p) => ({ ...p, [doc.id]: 'error' }));
              finishEmbedding(doc.id, false, (e as Error)?.message);
            });
        }
      } catch (err: any) {
        setErrorMsg(err?.message || t.unsupported);
      }
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  const docCount = documents.length;
  const isEmpty = docCount === 0;

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ background: tokens.bg, color: tokens.text, fontFamily: lang === 'ko' ? 'Pretendard, sans-serif' : 'Geist, sans-serif' }}
    >
      <div className="mx-auto w-full max-w-3xl px-6 py-12 md:py-16">

        {/* ══ Hero ══ */}
        <header className="mb-10 md:mb-12">
          <h1
            className="text-[32px] md:text-[40px] font-medium leading-[1.15] tracking-tight"
            style={{ color: tokens.text }}
          >
            {t.title}
          </h1>
          <p
            className="mt-3 text-[15px] md:text-[16px]"
            style={{ color: tokens.textDim }}
          >
            {t.subtitle}
          </p>
          {!embeddingProvider && (
            <div
              className="mt-4 flex flex-wrap items-center gap-2 rounded-lg px-4 py-2.5 text-[12.5px]"
              style={{ background: tokens.accentSoft, color: tokens.accent }}
            >
              <span>{t.noEmbedKey}</span>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('d1:open-onboarding'))}
                className="rounded-md px-2 py-1 text-[12px] font-medium transition-opacity hover:opacity-80"
                style={{ background: tokens.accent, color: '#fff' }}
              >
                {lang === 'ko' ? '키 설정하기' : 'Set up key'}
              </button>
            </div>
          )}
        </header>

        {/* P2.1 — 하이브리드 탭 segmented control */}
        <div
          className="mb-8 inline-flex rounded-xl p-1 text-[13px]"
          style={{ background: tokens.surfaceAlt }}
          role="tablist"
        >
          {(['library', 'chat'] as const).map((id) => {
            const active = tab === id;
            const label = id === 'library' ? t.tabLibrary : t.tabChat;
            return (
              <button
                key={id}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(id)}
                className="rounded-lg px-4 py-1.5 transition-colors"
                style={{
                  background: active ? tokens.surface : 'transparent',
                  color:      active ? tokens.text    : tokens.textDim,
                  fontWeight: active ? 500 : 400,
                  boxShadow:  active ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {tab === 'chat' ? (
          <ChatTab
            t={t}
            lang={lang}
            documents={documents}
            activeDocIds={activeDocIds}
            onToggle={toggleActive}
            onAskAboutDocs={onAskAboutDocs}
          />
        ) : (
        <div>

        {/* ══ Dropzone ══ */}
        <Dropzone
          isDragging={isDragging}
          onDragEnter={() => setIsDragging(true)}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          isCompact={!isEmpty}
          t={t}
        />

        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          accept=".pdf,.xlsx,.xls,.csv,.txt,.md"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {errorMsg && (
          <div
            className="mt-3 rounded-lg px-4 py-2.5 text-[13px]"
            style={{ background: 'rgba(204,68,68,0.08)', color: tokens.danger }}
          >
            {errorMsg}
          </div>
        )}

        {/* ══ File list ══ */}
        {!isEmpty && (
          <section className="mt-6">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-[13px]" style={{ color: tokens.textDim }}>
                {docCount} {t.counter}
              </span>
            </div>

            <ul className="space-y-2">
              {documents.map((doc) => {
                const isActive = activeDocIds.has(doc.id);
                const status = embedStatus[doc.id]
                  ?? (doc.embeddingModel ? 'done' : 'idle');
                const progress = embedProgress[doc.id] ?? (status === 'done' ? 100 : 0);
                return (
                  <li key={doc.id}>
                    <FileCard
                      doc={doc}
                      isActive={isActive}
                      status={status}
                      progress={progress}
                      lang={lang}
                      t={t}
                      onToggle={() => toggleActive(doc.id)}
                      onDelete={() => setConfirmDelId(doc.id)}
                      onPreview={() => setPreviewDocId(doc.id)}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        </div>
        )}

      </div>

      {/* IMP-029: 활성 문서 있을 때 sticky CTA — 채팅에서 질문하기 */}
      {activeDocIds.size > 0 && onAskAboutDocs && (
        <div
          className="sticky bottom-0 left-0 right-0 z-10 px-4 py-3 backdrop-blur-md"
          style={{
            background: 'color-mix(in srgb, var(--d1-bg) 85%, transparent)',
            borderTop: `1px solid ${tokens.border}`,
          }}
        >
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
            <span className="text-[13px]" style={{ color: tokens.textDim }}>
              {t.activeCount(activeDocIds.size)}
            </span>
            <button
              type="button"
              onClick={onAskAboutDocs}
              className="rounded-lg px-4 py-2 text-[13px] font-medium transition-opacity hover:opacity-80"
              style={{ background: tokens.accent, color: '#fff' }}
            >
              {t.askCta}
            </button>
          </div>
        </div>
      )}

      {/* P3.4 — 파일 인라인 미리보기 모달 */}
      {previewDocId && (() => {
        const doc = documents.find((d) => d.id === previewDocId);
        if (!doc) return null;
        return (
          <PreviewModal
            doc={doc}
            t={t}
            lang={lang}
            onClose={() => setPreviewDocId(null)}
          />
        );
      })()}

      {/* ══ Delete confirmation modal ══ */}
      {confirmDelId && (
        <ConfirmModal
          message={t.confirmDel}
          confirmLabel={t.yesDelete}
          cancelLabel={t.cancel}
          onConfirm={() => {
            removeDocument(confirmDelId);
            setConfirmDelId(null);
          }}
          onCancel={() => setConfirmDelId(null)}
        />
      )}
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────

// P2.1 — 채팅 탭: 분할 레이아웃 (좌측 활성 문서 + 우측 채팅 안내)
function ChatTab({
  t, lang, documents, activeDocIds, onToggle, onAskAboutDocs,
}: {
  t: typeof copy[keyof typeof copy];
  lang: 'ko' | 'en';
  documents: ParsedDocument[];
  activeDocIds: Set<string>;
  onToggle: (id: string) => void;
  onAskAboutDocs?: () => void;
}) {
  const activeDocs = documents.filter((d) => activeDocIds.has(d.id));
  const inactiveDocs = documents.filter((d) => !activeDocIds.has(d.id));
  const activeCount = activeDocs.length;

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(220px,30%)_1fr]">
      {/* 좌측 — 활성 문서 사이드바 */}
      <aside className="flex flex-col gap-3">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: tokens.textFaint }}>
          {t.activeDocs}
        </h3>
        {activeDocs.length === 0 ? (
          <div
            className="rounded-xl border p-4 text-[13px]"
            style={{ background: tokens.surface, borderColor: tokens.border, color: tokens.textDim }}
          >
            {t.chatEmpty}
            <div className="mt-1 text-[11.5px]" style={{ color: tokens.textFaint }}>{t.chatEmptyHint}</div>
          </div>
        ) : (
          <ul className="space-y-2">
            {activeDocs.map((doc) => (
              <li key={doc.id}>
                <button
                  type="button"
                  onClick={() => onToggle(doc.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-[13px] transition-colors hover:opacity-90"
                  style={{ background: tokens.surface, borderColor: tokens.border, color: tokens.text }}
                  title={lang === 'ko' ? '비활성으로 전환' : 'Toggle off'}
                >
                  <span className="truncate">{doc.name}</span>
                  <span className="shrink-0 text-[11px]" style={{ color: tokens.accent }}>✓</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* 비활성 문서 — 빠른 토글 */}
        {inactiveDocs.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-[12px]" style={{ color: tokens.textDim }}>
              + {inactiveDocs.length} {lang === 'ko' ? '추가 가능' : 'available'}
            </summary>
            <ul className="mt-2 space-y-1.5">
              {inactiveDocs.map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    onClick={() => onToggle(doc.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border-dashed px-3 py-1.5 text-left text-[12.5px] transition-colors hover:bg-black/5"
                    style={{ borderColor: tokens.border, color: tokens.textDim }}
                  >
                    <span className="truncate">{doc.name}</span>
                    <span className="shrink-0 text-[11px]">+</span>
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </aside>

      {/* 우측 — 채팅 안내 패널 */}
      <section
        className="flex min-h-[280px] flex-col rounded-2xl border p-6 md:p-8"
        style={{ background: tokens.surface, borderColor: tokens.border }}
      >
        <div className="flex-1">
          <p className="text-[14px]" style={{ color: tokens.text }}>
            {activeCount > 0 ? t.chatPlaceholder(activeCount) : t.chatEmpty}
          </p>
          {activeCount === 0 && (
            <p className="mt-2 text-[12.5px]" style={{ color: tokens.textDim }}>
              {t.chatEmptyHint}
            </p>
          )}
        </div>
        <div className="mt-6">
          <button
            type="button"
            disabled={activeCount === 0 || !onAskAboutDocs}
            onClick={onAskAboutDocs}
            className="rounded-lg px-4 py-2.5 text-[13px] font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: tokens.accent, color: '#fff' }}
          >
            {t.openInChat} →
          </button>
        </div>
      </section>
    </div>
  );
}

function Dropzone({
  isDragging, onDragEnter, onDragLeave, onDrop, onClick, isCompact, t,
}: {
  isDragging: boolean;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onClick: () => void;
  isCompact: boolean;
  t: typeof copy[keyof typeof copy];
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onDragOver={(e) => { e.preventDefault(); onDragEnter(); }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`block w-full rounded-2xl border-2 border-dashed transition-colors ${isCompact ? 'p-6' : 'p-12 md:p-16'}`}
      style={{
        background: isDragging ? tokens.accentSoft : tokens.surface,
        borderColor: isDragging ? tokens.accent : tokens.borderStrong,
        cursor: 'pointer',
      }}
    >
      <div className="flex flex-col items-center gap-3">
        <FileIcon size={isCompact ? 22 : 32} color={isDragging ? tokens.accent : tokens.textFaint} />
        <p className="text-[14px]" style={{ color: tokens.textDim }}>
          {t.dropHere}
        </p>
        <span
          className="rounded-[10px] px-4 py-2 text-[13px] transition-opacity"
          style={{ background: tokens.text, color: tokens.bg }}
        >
          {t.chooseFile}
        </span>
        {!isCompact && (
          <p className="mt-2 text-[12px]" style={{ color: tokens.textFaint }}>
            {t.formatHint}
          </p>
        )}
      </div>
    </button>
  );
}

function FileCard({
  doc, isActive, status, progress, lang, t, onToggle, onDelete, onPreview,
}: {
  doc: ParsedDocument;
  isActive: boolean;
  status: EmbedStatus;
  progress: number;
  lang: 'ko' | 'en';
  t: typeof copy[keyof typeof copy];
  onToggle: () => void;
  onDelete: () => void;
  onPreview: () => void;
}) {
  const ext = extOf(doc.name);
  const chunkCount = doc.chunks.length;

  return (
    <div
      className="rounded-xl border p-4 transition-colors"
      style={{
        background: tokens.surface,
        borderColor: isActive ? tokens.accent : tokens.border,
      }}
    >
      <div className="flex items-center gap-3">
        <ExtBadge ext={ext} />

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-[14px] font-medium truncate" style={{ color: tokens.text }}>
              {doc.name}
            </span>
          </div>
          <div className="mt-0.5 text-[12px]" style={{ color: tokens.textFaint }}>
            {doc.totalChars.toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US')} {t.chars}
            {' · '}
            {chunkCount} {t.chunks}
          </div>

          <StatusLine status={status} progress={progress} t={t} />
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPreview}
            title={t.preview}
            className="rounded-md p-1.5 transition-colors hover:bg-black/5"
            style={{ color: tokens.textFaint }}
            aria-label={t.preview}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>

          <button
            type="button"
            onClick={onToggle}
            title={isActive ? t.activeOn : t.activeOff}
            className="rounded-md px-2.5 py-1 text-[12px] transition-colors"
            style={{
              background: isActive ? tokens.accent : 'transparent',
              color: isActive ? '#fff' : tokens.textDim,
              border: isActive ? 'none' : `1px solid ${tokens.borderStrong}`,
            }}
          >
            {isActive ? t.activeOn : t.activeOff}
          </button>

          <button
            type="button"
            onClick={onDelete}
            title={t.delete}
            className="rounded-md p-1.5 transition-colors hover:bg-black/5"
            style={{ color: tokens.textFaint }}
          >
            <TrashIcon size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// P3.4 — 파일 인라인 미리보기 모달 (첫 N개 청크 텍스트)
function PreviewModal({
  doc, t, lang, onClose,
}: {
  doc: ParsedDocument;
  t: typeof copy[keyof typeof copy];
  lang: 'ko' | 'en';
  onClose: () => void;
}) {
  const PREVIEW_CHUNKS = 8;
  const visible = doc.chunks.slice(0, PREVIEW_CHUNKS);
  const remaining = Math.max(0, doc.chunks.length - PREVIEW_CHUNKS);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center px-4 py-12"
      style={{ background: 'rgba(0,0,0,0.32)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl"
        style={{ background: tokens.surface, color: tokens.text, boxShadow: '0 24px 60px rgba(0,0,0,0.18)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between gap-3 border-b px-6 py-4"
          style={{ borderColor: tokens.border }}
        >
          <div className="min-w-0">
            <div className="text-[15px] font-medium truncate" style={{ color: tokens.text }}>
              {doc.name}
            </div>
            <div className="text-[12px]" style={{ color: tokens.textFaint }}>
              {doc.totalChars.toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US')} {t.chars} · {doc.chunks.length} {t.chunks}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 transition-opacity hover:opacity-70"
            style={{ color: tokens.textFaint }}
            aria-label={t.previewClose}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-5 space-y-4">
          {visible.length === 0 ? (
            <p className="text-[13px]" style={{ color: tokens.textDim }}>
              {lang === 'ko' ? '미리보기할 내용이 없어요.' : 'No content to preview.'}
            </p>
          ) : visible.map((chunk, i) => (
            <div key={i}>
              <div className="mb-1 text-[11px] uppercase tracking-[0.08em]" style={{ color: tokens.textFaint }}>
                {(lang === 'ko' ? '청크 ' : 'Chunk ') + (i + 1)}
              </div>
              <p
                className="whitespace-pre-wrap text-[13.5px] leading-[1.65]"
                style={{ color: tokens.text }}
              >
                {chunk.text.slice(0, 800)}{chunk.text.length > 800 ? '…' : ''}
              </p>
            </div>
          ))}
          {remaining > 0 && (
            <p className="text-[12px]" style={{ color: tokens.textFaint }}>
              {t.previewMore(remaining)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusLine({
  status, progress, t,
}: {
  status: EmbedStatus;
  progress: number;
  t: typeof copy[keyof typeof copy];
}) {
  if (status === 'idle') return null;
  if (status === 'embedding') {
    return (
      <div className="mt-2 flex items-center gap-2">
        <div className="h-1 flex-1 rounded-full" style={{ background: tokens.surfaceAlt }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${progress}%`, background: tokens.accent }}
          />
        </div>
        <span className="text-[11px]" style={{ color: tokens.textDim }}>
          {t.embedding} {Math.round(progress)}%
        </span>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="mt-1 text-[11px]" style={{ color: tokens.danger }}>
        {t.embedError}
      </div>
    );
  }
  return (
    <div className="mt-1 text-[11px]" style={{ color: tokens.textFaint }}>
      ● {t.embedDone}
    </div>
  );
}

function ExtBadge({ ext }: { ext: string }) {
  const upper = ext.toUpperCase().slice(0, 4);
  const colorMap: Record<string, string> = {
    pdf:  '#c44',
    xlsx: '#10a37f',
    xls:  '#10a37f',
    csv:  '#10a37f',
    txt:  '#666',
    md:   '#666',
  };
  const color = colorMap[ext] ?? tokens.textDim;
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[10px] font-medium tracking-wide"
      style={{ background: `${color}15`, color }}
    >
      {upper}
    </div>
  );
}

function ConfirmModal({
  message, confirmLabel, cancelLabel, onConfirm, onCancel,
}: {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.32)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-xs rounded-2xl p-6"
        style={{ background: tokens.surface, color: tokens.text }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[15px]" style={{ color: tokens.text }}>{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-[13px]"
            style={{ color: tokens.textDim }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg px-4 py-2 text-[13px] text-white"
            style={{ background: tokens.danger }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Inline icons (no lucide dep) ─────────────────────────────────
function FileIcon({ size = 24, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
    </svg>
  );
}

function TrashIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
    </svg>
  );
}
