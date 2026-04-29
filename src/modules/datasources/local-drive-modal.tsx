'use client';

/**
 * Local Drive Modal — 폴더/파일 선택 (Tori 19857410 §1.2).
 *
 * 두 흐름:
 *  - FS Access API 가능: [폴더 선택] [파일 선택] 버튼
 *  - 미지원: 드래그&드롭 + input[type=file] fallback (매 세션 재선택 안내)
 *
 * 결과는 LocalPickerResult 형식으로 부모(datasources-view-design1)에게 전달.
 * 부모가 비용 미리보기 모달 → addSource → IndexedDB 저장 흐름 진행.
 */

import { useEffect, useRef, useState } from 'react';
import {
  pickFolderViaFsAccess,
  pickFilesViaFsAccess,
  buildSelectionFromDroppedFiles,
  type LocalPickerResult,
} from '@/modules/datasources/pickers/local-drive-picker';
import {
  hasFileSystemAccessAPI,
  hasFilePicker,
  isMobile,
} from '@/lib/local-drive/capability';
import { extractFilesFromDataTransfer } from '@/lib/local-drive/dropzone';

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

const COPY = {
  ko: {
    title:           '💾 로컬 폴더 또는 파일 추가',
    dropHint:        '폴더 또는 파일을 여기로 드래그하세요',
    dropActive:      '여기에 놓으세요',
    or:              '또는',
    pickFolder:      '폴더 선택',
    pickFiles:       '파일 선택',
    pickFilesOnly:   '파일 선택',
    constraints:     '• 최대 20개 (폴더+파일 합산) · 폴더당 최대 200파일',
    formats:         '• PDF, DOCX, TXT, MD, CSV, XLSX',
    cancel:          '취소',
    fallbackNotice:  '이 브라우저는 폴더 권한을 영구 저장할 수 없어요. 매 세션마다 다시 선택해야 합니다. Chrome 또는 Edge에선 자동 기억돼요.',
    mobileNotice:    '모바일에선 [파일 선택]만 가능해요.',
    skipped:         (n: number) => `${n}개 파일은 지원되지 않는 형식이라 제외됐어요.`,
    capped:          (limit: number, total: number) => `폴더에 ${total}개 파일이 있어 최근 ${limit}개만 선택됐어요. (수정일 기준)`,
    pickError:       '선택 중 오류가 발생했어요.',
    cancelled:       '취소됐어요.',
    privacy:         '🔒 로컬 파일은 사용자 기기에서만 처리되고, OAuth 토큰을 사용하지 않습니다.',
  },
  en: {
    title:           '💾 Add local folder or files',
    dropHint:        'Drag a folder or files here',
    dropActive:      'Drop here',
    or:              'or',
    pickFolder:      'Pick folder',
    pickFiles:       'Pick files',
    pickFilesOnly:   'Pick files',
    constraints:     '• Up to 20 items · 200 files per folder',
    formats:         '• PDF, DOCX, TXT, MD, CSV, XLSX',
    cancel:          'Cancel',
    fallbackNotice:  'This browser cannot remember folder access. You will need to re-select each session. Chrome and Edge remember automatically.',
    mobileNotice:    'On mobile, only [Pick files] is available.',
    skipped:         (n: number) => `${n} file(s) skipped (unsupported format).`,
    capped:          (limit: number, total: number) => `Folder has ${total} files — only the ${limit} most recent were selected.`,
    pickError:       'Picker failed.',
    cancelled:       'Cancelled.',
    privacy:         '🔒 Local files stay on your device — no OAuth tokens used.',
  },
} as const;

export interface LocalDriveModalProps {
  lang: 'ko' | 'en';
  onCancel: () => void;
  onPicked: (result: LocalPickerResult) => void;
}

export function LocalDriveModal({ lang, onCancel, onPicked }: LocalDriveModalProps) {
  const t = COPY[lang];
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  // capability detection — client-only
  const [caps, setCaps] = useState({ fs: false, files: false, mobile: false });
  useEffect(() => {
    setCaps({
      fs: hasFileSystemAccessAPI(),
      files: hasFilePicker(),
      mobile: isMobile(),
    });
  }, []);

  function reportResult(r: LocalPickerResult | null) {
    if (!r) {
      setError(t.cancelled);
      return;
    }
    const messages: string[] = [];
    if (r.skippedOther > 0) messages.push(t.skipped(r.skippedOther));
    if (r.capped) messages.push(t.capped(r.files.length, r.totalMatched));
    if (messages.length > 0) setInfo(messages.join(' '));
    onPicked(r);
  }

  async function onPickFolder() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const r = await pickFolderViaFsAccess();
      reportResult(r);
    } catch (e) {
      setError((e as Error)?.message ?? t.pickError);
    } finally {
      setBusy(false);
    }
  }

  async function onPickFiles() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (caps.files) {
        const r = await pickFilesViaFsAccess();
        reportResult(r);
      } else {
        // Fallback to <input type="file">
        fileInputRef.current?.click();
      }
    } catch (e) {
      setError((e as Error)?.message ?? t.pickError);
    } finally {
      setBusy(false);
    }
  }

  function onPickFolderInput() {
    folderInputRef.current?.click();
  }

  async function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    e.target.value = ''; // 같은 선택 재허용
    if (list.length === 0) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const r = buildSelectionFromDroppedFiles({ files: list });
      reportResult(r);
    } finally {
      setBusy(false);
    }
  }

  async function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const files = await extractFilesFromDataTransfer(e.dataTransfer);
      const r = buildSelectionFromDroppedFiles({ files });
      reportResult(r);
    } catch (err) {
      setError((err as Error)?.message ?? t.pickError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-6 shadow-xl"
        style={{ background: tokens.bg, borderColor: tokens.border }}
      >
        <h3 className="mb-4 text-[16px] font-semibold" style={{ color: tokens.text }}>
          {t.title}
        </h3>

        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className="rounded-xl border-2 border-dashed p-6 text-center transition-colors"
          style={{
            background: isDragging ? tokens.accentSoft : tokens.surface,
            borderColor: isDragging ? tokens.accent : tokens.border,
          }}
        >
          <p className="mb-4 text-[13px]" style={{ color: tokens.textDim }}>
            📂 {isDragging ? t.dropActive : t.dropHint}
          </p>
          <p className="mb-3 text-[11px]" style={{ color: tokens.textFaint }}>{t.or}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {caps.fs && !caps.mobile && (
              <button
                type="button"
                disabled={busy}
                onClick={onPickFolder}
                className="rounded-md border px-3 py-1.5 text-[12.5px]"
                style={{
                  background: tokens.surfaceAlt,
                  color: tokens.text,
                  borderColor: tokens.border,
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {t.pickFolder}
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={caps.fs && !caps.mobile ? onPickFiles : onPickFiles}
              className="rounded-md border px-3 py-1.5 text-[12.5px]"
              style={{
                background: tokens.surfaceAlt,
                color: tokens.text,
                borderColor: tokens.border,
                opacity: busy ? 0.6 : 1,
              }}
            >
              {caps.mobile ? t.pickFilesOnly : t.pickFiles}
            </button>
            {!caps.fs && !caps.mobile && (
              <button
                type="button"
                disabled={busy}
                onClick={onPickFolderInput}
                className="rounded-md border px-3 py-1.5 text-[12.5px]"
                style={{
                  background: tokens.surfaceAlt,
                  color: tokens.text,
                  borderColor: tokens.border,
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {t.pickFolder}
              </button>
            )}
          </div>
        </div>

        {/* hidden inputs — fallback */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.md,.csv,.xlsx"
          style={{ display: 'none' }}
          onChange={onInputChange}
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          // @ts-expect-error — non-standard but widely supported (Chromium·WebKit)
          webkitdirectory=""
          accept=".pdf,.docx,.txt,.md,.csv,.xlsx"
          style={{ display: 'none' }}
          onChange={onInputChange}
        />

        <div className="mt-4 space-y-1 text-[11.5px]" style={{ color: tokens.textFaint }}>
          <div>{t.constraints}</div>
          <div>{t.formats}</div>
          {!caps.fs && !caps.mobile && <div className="mt-2">⚠️ {t.fallbackNotice}</div>}
          {caps.mobile && <div className="mt-2">📱 {t.mobileNotice}</div>}
        </div>

        {error && (
          <div className="mt-3 rounded-md p-2 text-[12px]"
            style={{ background: 'rgba(204,68,68,0.10)', color: tokens.danger }}>
            {error}
          </div>
        )}
        {info && !error && (
          <div className="mt-3 rounded-md p-2 text-[12px]"
            style={{ background: tokens.surfaceAlt, color: tokens.textDim }}>
            {info}
          </div>
        )}

        <div className="mt-5 flex justify-between gap-2">
          <span className="text-[11px]" style={{ color: tokens.textFaint }}>{t.privacy}</span>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md px-3 py-1.5 text-[12px]"
            style={{ background: tokens.surfaceAlt, color: tokens.text, opacity: busy ? 0.6 : 1 }}
          >
            {t.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
