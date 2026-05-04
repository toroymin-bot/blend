'use client';

// OneDrive 폴더+파일 선택 모달 — Microsoft Graph API 기반 자체 picker UI.
// popup picker SDK가 모바일에서 불안정해 자체 모달로 대체.
// 사용자 OneDrive 루트의 1단계 폴더와 지원 파일을 fetch해 다중 선택.
//
// [2026-05-01 Roy] 폴더만이 아니라 파일도 선택 가능 — 사용자 명시 요청.

import { useEffect, useMemo, useState } from 'react';
import {
  isAllowedExtension,
  makeSelection,
} from '@/modules/datasources/pickers/picker-shared';
import type { DataSourceSelection } from '@/types';

interface OneDriveItem {
  id: string;
  name: string;
  size?: number;
  folder?: { childCount?: number };
  file?: { mimeType?: string };
}

interface Props {
  open: boolean;
  accessToken: string | null;
  lang: 'ko' | 'en';
  onPicked: (selections: DataSourceSelection[]) => void;
  onCancel: () => void;
}

// [2026-05-01 Roy] Graph API 응답 normalize — pagination + array 형식 모두 처리.
// 일부 환경에서 응답에 unexpected fields가 끼어들기도 해서 명시적 파싱.
async function fetchOneDriveChildren(token: string, signal?: AbortSignal): Promise<OneDriveItem[]> {
  // $orderby는 folder navigation property를 지원 X — 'name'만 사용. 폴더/파일
  // 분리는 클라이언트에서 처리. $select는 필요한 것만 명시.
  let url: string | null = 'https://graph.microsoft.com/v1.0/me/drive/root/children?$select=id,name,size,folder,file&$top=200&$orderby=name';
  const all: OneDriveItem[] = [];
  let safety = 10;
  while (url && safety-- > 0) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      // 에러 텍스트를 그대로 throw — UI에서 사유 노출 가능 (이전엔 'graph 400'만 보였음)
      throw new Error(`Graph ${res.status}: ${errText.slice(0, 200) || res.statusText}`);
    }
    const data: { value?: OneDriveItem[]; '@odata.nextLink'?: string } = await res.json();
    if (Array.isArray(data.value)) all.push(...data.value);
    url = data['@odata.nextLink'] ?? null;
  }
  return all;
}

const t = {
  ko: {
    title: 'OneDrive 항목 선택',
    desc: 'AI가 참고할 폴더 또는 파일을 골라주세요. 여러 개 선택할 수 있어요.',
    loading: '불러오고 있어요…',
    empty: 'OneDrive에 항목이 없어요. (지원: PDF · DOCX · TXT · MD · CSV · XLSX)',
    error: '항목을 불러오지 못했어요. 잠시 후 다시 시도해주세요.',
    cancel: '취소',
    done: '선택 완료',
    selected: (n: number) => `${n}개 선택`,
    files: (n: number) => `${n}개 파일`,
    sectionFolders: '폴더',
    sectionFiles: '파일',
  },
  en: {
    title: 'Choose OneDrive items',
    desc: 'Pick folders or files for AI to reference. You can select multiple.',
    loading: 'Loading…',
    empty: 'Nothing found in OneDrive. (Supported: PDF · DOCX · TXT · MD · CSV · XLSX)',
    error: 'Could not load items. Please try again in a moment.',
    cancel: 'Cancel',
    done: 'Done',
    selected: (n: number) => `${n} selected`,
    files: (n: number) => `${n} files`,
    sectionFolders: 'Folders',
    sectionFiles: 'Files',
  },
};

function fmtBytes(n?: number): string {
  if (!n || isNaN(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function extOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

export function OneDriveFolderModal({ open, accessToken, lang, onPicked, onCancel }: Props) {
  const c = t[lang];
  const [items, setItems] = useState<OneDriveItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);

  // [2026-05-01 Roy] 진단 가능한 에러 메시지 — 'graph 400'이 아니라 실제 사유.
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !accessToken) return;
    const ctrl = new AbortController();
    let cancelled = false;
    setLoading(true);
    setErrored(false);
    setErrorDetail(null);
    setSelectedIds(new Set());

    fetchOneDriveChildren(accessToken, ctrl.signal)
      .then((all) => {
        if (cancelled) return;
        // 폴더는 모두 통과, 파일은 ext 화이트리스트만.
        const filtered = all.filter((x) => {
          if (x.folder) return true;
          if (x.file) return isAllowedExtension(x.name);
          return false;
        });
        setItems(filtered);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[OneDriveFolderModal] fetch failed:', msg);
        setErrorDetail(msg.slice(0, 200));
        setErrored(true);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [open, accessToken]);

  const { folders, files } = useMemo(() => {
    return {
      folders: items.filter((x) => !!x.folder),
      files: items.filter((x) => !x.folder && !!x.file),
    };
  }, [items]);

  if (!open) return null;

  const toggle = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleDone = async () => {
    const picked = items.filter((f) => selectedIds.has(f.id));
    if (!accessToken) return;
    setConfirming(true);
    // 폴더는 1단계 children만 fetch해서 stats 추정. 파일은 자체 size.
    const stats = await Promise.all(
      picked.map(async (f) => {
        if (!f.folder) {
          return { fileCount: 1, approxBytes: f.size ?? 0 };
        }
        try {
          const r = await fetch(
            `https://graph.microsoft.com/v1.0/me/drive/items/${f.id}/children?$top=1000&$select=id,size,file,folder`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          if (!r.ok) return { fileCount: 0, approxBytes: 0 };
          const data = (await r.json()) as { value?: Array<{ size?: number; file?: object; folder?: object }> };
          const child = (data.value ?? []).filter((x) => x.file && !x.folder);
          const approxBytes = child.reduce((sum, x) => sum + (x.size ?? 0), 0);
          return { fileCount: child.length, approxBytes };
        } catch {
          return { fileCount: 0, approxBytes: 0 };
        }
      }),
    );
    const selections = picked.map((f, i) =>
      makeSelection({
        id: f.id,
        kind: f.folder ? 'folder' : 'file',
        name: f.name,
        path: f.name,
        fileCount: stats[i].fileCount,
        approxBytes: stats[i].approxBytes,
      }),
    );
    setConfirming(false);
    onPicked(selections);
  };

  const isEmpty = !loading && !errored && folders.length === 0 && files.length === 0;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-2 sm:p-4"
      onClick={() => { if (!confirming) onCancel(); }}
    >
      <div
        className="flex w-full max-w-md flex-col rounded-2xl p-4 shadow-2xl sm:p-6"
        style={{
          background: 'var(--d1-bg)',
          color: 'var(--d1-text)',
          maxHeight: 'calc(100dvh - 1rem)',
          maxWidth: 'calc(100vw - 1rem)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center gap-2 text-[15px] font-semibold">
          <span aria-hidden>📁</span>
          {c.title}
        </div>
        <p className="mb-3 text-[13px] sm:mb-4" style={{ color: 'var(--d1-text-dim)' }}>
          {c.desc}
        </p>

        <div
          className="min-h-0 flex-1 overflow-y-auto rounded-xl border"
          style={{ borderColor: 'var(--d1-border)' }}
        >
          {loading && (
            <div className="px-4 py-8 text-center text-[13px]" style={{ color: 'var(--d1-text-dim)' }}>
              {c.loading}
            </div>
          )}
          {!loading && errored && (
            <div className="px-4 py-8 text-center text-[13px]" style={{ color: 'var(--d1-text-dim)' }}>
              <div>{c.error}</div>
              {errorDetail && (
                <div className="mt-2 text-[11px] break-all" style={{ color: 'var(--d1-text-faint)' }}>
                  {errorDetail}
                </div>
              )}
            </div>
          )}
          {isEmpty && (
            <div className="px-4 py-8 text-center text-[13px]" style={{ color: 'var(--d1-text-dim)' }}>
              {c.empty}
            </div>
          )}
          {!loading && !errored && (folders.length > 0 || files.length > 0) && (
            <div>
              {folders.length > 0 && (
                <>
                  <div
                    className="px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.05em]"
                    style={{ background: 'var(--d1-surface-alt)', color: 'var(--d1-text-faint)' }}
                  >
                    {c.sectionFolders} · {folders.length}
                  </div>
                  <ul className="divide-y" style={{ borderColor: 'var(--d1-border)' }}>
                    {folders.map((f) => {
                      const checked = selectedIds.has(f.id);
                      return (
                        <li key={f.id}>
                          <label className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-black/5">
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
                </>
              )}
              {files.length > 0 && (
                <>
                  <div
                    className="px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.05em]"
                    style={{ background: 'var(--d1-surface-alt)', color: 'var(--d1-text-faint)' }}
                  >
                    {c.sectionFiles} · {files.length}
                  </div>
                  <ul className="divide-y" style={{ borderColor: 'var(--d1-border)' }}>
                    {files.map((f) => {
                      const checked = selectedIds.has(f.id);
                      const ext = extOf(f.name);
                      return (
                        <li key={f.id}>
                          <label className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-black/5">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggle(f.id)}
                              className="h-4 w-4"
                            />
                            <span aria-hidden>📄</span>
                            <span className="flex-1 truncate text-[14px]">{f.name}</span>
                            {ext && (
                              <span
                                className="rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase"
                                style={{ background: 'var(--d1-accent-soft)', color: 'var(--d1-accent)' }}
                              >
                                {ext}
                              </span>
                            )}
                            {f.size && (
                              <span className="text-[11px] tabular-nums" style={{ color: 'var(--d1-text-faint)' }}>
                                {fmtBytes(f.size)}
                              </span>
                            )}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-y-2 gap-x-3 sm:mt-5">
          <span className="text-[12px]" style={{ color: 'var(--d1-text-dim)' }}>
            {selectedIds.size > 0 ? c.selected(selectedIds.size) : ''}
          </span>
          <div className="ml-auto flex gap-2">
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
