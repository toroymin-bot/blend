'use client';

// OneDrive 폴더 선택 모달 — Microsoft Graph API 기반 자체 picker UI.
// popup picker SDK가 모바일에서 불안정해 자체 모달로 대체.
// 사용자 OneDrive 루트의 1단계 폴더를 fetch해 다중 선택.

import { useEffect, useState } from 'react';
import { makeSelection } from '@/modules/datasources/pickers/picker-shared';
import { scanOneDriveFolder } from '@/lib/connectors/onedrive-connector';
import type { DataSourceSelection } from '@/types';

interface OneDriveFolder {
  id: string;
  name: string;
  size?: number;
  folder?: { childCount?: number };
}

interface Props {
  open: boolean;
  accessToken: string | null;
  lang: 'ko' | 'en';
  onPicked: (selections: DataSourceSelection[]) => void;
  onCancel: () => void;
}

const t = {
  ko: {
    title: 'OneDrive 폴더 선택',
    desc: 'AI가 참고할 폴더를 골라주세요. 여러 개 선택할 수 있어요.',
    loading: '폴더를 불러오고 있어요…',
    empty: 'OneDrive에 폴더가 없어요. 먼저 OneDrive에서 폴더를 만들어주세요.',
    error: '폴더를 불러오지 못했어요. 잠시 후 다시 시도해주세요.',
    cancel: '취소',
    done: '선택 완료',
    selected: (n: number) => `${n}개 선택`,
    files: (n: number) => `${n}개 파일`,
  },
  en: {
    title: 'Choose OneDrive folders',
    desc: 'Pick folders for AI to reference. You can select multiple.',
    loading: 'Loading folders…',
    empty: 'No folders found in OneDrive. Create a folder in OneDrive first.',
    error: 'Could not load folders. Please try again in a moment.',
    cancel: 'Cancel',
    done: 'Done',
    selected: (n: number) => `${n} selected`,
    files: (n: number) => `${n} files`,
  },
};

export function OneDriveFolderModal({ open, accessToken, lang, onPicked, onCancel }: Props) {
  const c = t[lang];
  const [folders, setFolders] = useState<OneDriveFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!open || !accessToken) return;
    let cancelled = false;
    setLoading(true);
    setErrored(false);
    setSelectedIds(new Set());

    fetch(
      'https://graph.microsoft.com/v1.0/me/drive/root/children?$select=id,name,size,folder&$filter=folder ne null&$top=200',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
      .then(async (r) => {
        if (!r.ok) throw new Error(`graph ${r.status}`);
        const data = (await r.json()) as { value?: OneDriveFolder[] };
        if (cancelled) return;
        setFolders(data.value ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setErrored(true);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, accessToken]);

  if (!open) return null;

  const toggle = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleDone = async () => {
    const picked = folders.filter((f) => selectedIds.has(f.id));
    if (!accessToken) return;
    setConfirming(true);
    // [2026-05-01 Roy] 재귀 동기화에 맞춘 정확한 cost preview — 하위 폴더까지
    // 모두 scan해서 실제 indexable 파일 수와 size 합 계산. 이전엔 1단계만 봐서
    // sync 후 결과가 picker preview와 mismatch (사용자 혼란).
    // connector의 scanOneDriveFolder({ recursive: true })를 그대로 사용 — sync
    // 시점에 호출되는 함수와 동일 결과 보장.
    const stats = await Promise.all(
      picked.map(async (f) => {
        try {
          const items = await scanOneDriveFolder(accessToken, f.id, { recursive: true });
          const approxBytes = items.reduce((sum, x) => sum + (x.size ?? 0), 0);
          return { fileCount: items.length, approxBytes };
        } catch {
          return { fileCount: 0, approxBytes: 0 };
        }
      }),
    );
    const selections = picked.map((f, i) =>
      makeSelection({
        id: f.id,
        kind: 'folder',
        name: f.name,
        path: f.name,
        fileCount: stats[i].fileCount,
        approxBytes: stats[i].approxBytes,
      }),
    );
    setConfirming(false);
    onPicked(selections);
  };

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4"
      onClick={() => { if (!confirming) onCancel(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 shadow-2xl"
        style={{ background: 'var(--d1-bg)', color: 'var(--d1-text)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center gap-2 text-[15px] font-semibold">
          <span aria-hidden>📁</span>
          {c.title}
        </div>
        <p className="mb-4 text-[13px]" style={{ color: 'var(--d1-text-dim)' }}>
          {c.desc}
        </p>

        <div
          className="max-h-72 overflow-y-auto rounded-xl border"
          style={{ borderColor: 'var(--d1-border)' }}
        >
          {loading && (
            <div className="px-4 py-8 text-center text-[13px]" style={{ color: 'var(--d1-text-dim)' }}>
              {c.loading}
            </div>
          )}
          {!loading && errored && (
            <div className="px-4 py-8 text-center text-[13px]" style={{ color: 'var(--d1-text-dim)' }}>
              {c.error}
            </div>
          )}
          {!loading && !errored && folders.length === 0 && (
            <div className="px-4 py-8 text-center text-[13px]" style={{ color: 'var(--d1-text-dim)' }}>
              {c.empty}
            </div>
          )}
          {!loading && !errored && folders.length > 0 && (
            <ul className="divide-y" style={{ borderColor: 'var(--d1-border)' }}>
              {folders.map((f) => {
                const checked = selectedIds.has(f.id);
                return (
                  <li key={f.id}>
                    <label
                      className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-black/5"
                      style={{ borderColor: 'var(--d1-border)' }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(f.id)}
                        className="h-4 w-4"
                      />
                      <span aria-hidden>📁</span>
                      <span className="flex-1 truncate text-[14px]">{f.name}</span>
                      {typeof f.folder?.childCount === 'number' && (
                        <span className="text-[12px]" style={{ color: 'var(--d1-text-faint)' }}>
                          {c.files(f.folder.childCount)}
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="text-[12px]" style={{ color: 'var(--d1-text-dim)' }}>
            {selectedIds.size > 0 ? c.selected(selectedIds.size) : ''}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg px-4 py-2 text-[13px] transition-colors hover:bg-black/5"
              style={{ color: 'var(--d1-text-dim)' }}
            >
              {c.cancel}
            </button>
            <button
              type="button"
              onClick={handleDone}
              disabled={selectedIds.size === 0 || confirming}
              className="rounded-lg px-4 py-2 text-[13px] font-semibold transition-opacity"
              style={{
                background: 'var(--d1-accent)',
                color: '#fff',
                opacity: selectedIds.size === 0 || confirming ? 0.4 : 1,
                cursor: selectedIds.size === 0 || confirming ? 'not-allowed' : 'pointer',
              }}
            >
              {confirming ? (lang === 'ko' ? '확인 중…' : 'Checking…') : c.done}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
