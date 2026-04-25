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
  bg:           '#fafaf9',
  surface:      '#ffffff',
  surfaceAlt:   '#f6f5f3',
  text:         '#0a0a0a',
  textDim:      '#6b6862',
  textFaint:    '#a8a49b',
  accent:       '#c65a3c',
  accentSoft:   'rgba(198, 90, 60, 0.08)',
  border:       'rgba(10, 10, 10, 0.06)',
  borderStrong: 'rgba(10, 10, 10, 0.12)',
  danger:       '#c44',
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
export default function D1DocumentsView({ lang }: { lang: 'ko' | 'en' }) {
  const t = copy[lang];

  const documents     = useDocumentStore((s) => s.documents);
  const activeDocIds  = useDocumentStore((s) => s.activeDocIds);
  const addDocument   = useDocumentStore((s) => s.addDocument);
  const updateDocument= useDocumentStore((s) => s.updateDocument);
  const removeDocument= useDocumentStore((s) => s.removeDocument);
  const toggleActive  = useDocumentStore((s) => s.toggleActive);
  const loadFromDB    = useDocumentStore((s) => s.loadFromDB);

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
          generateEmbeddings(doc, embeddingKey, embeddingProvider, (pct) => {
            setEmbedProgress((p) => ({ ...p, [doc.id]: pct }));
          })
            .then((embedded) => {
              updateDocument(embedded);
              setEmbedStatus((p) => ({ ...p, [doc.id]: 'done' }));
              setEmbedProgress((p) => ({ ...p, [doc.id]: 100 }));
            })
            .catch(() => {
              setEmbedStatus((p) => ({ ...p, [doc.id]: 'error' }));
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
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        )}

      </div>

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
  doc, isActive, status, progress, lang, t, onToggle, onDelete,
}: {
  doc: ParsedDocument;
  isActive: boolean;
  status: EmbedStatus;
  progress: number;
  lang: 'ko' | 'en';
  t: typeof copy[keyof typeof copy];
  onToggle: () => void;
  onDelete: () => void;
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
