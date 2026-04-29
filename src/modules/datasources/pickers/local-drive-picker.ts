/**
 * Local Drive Picker — 폴더/파일 선택 → DataSourceSelection 변환 (Tori 19857410 §1.3).
 *
 * 두 경로 지원:
 *   1) FS Access API: pickLocalDirectory / showOpenFilePicker → 핸들 + 스캔
 *   2) Drag & Drop / input[type=file]: 받은 File[] → 가공
 *
 * 결과는 동일하게 `DataSourceSelection[]` + 추가 메타(handle, snapshot, capped 여부).
 */

import type { DataSourceSelection } from '@/types';
import {
  pickLocalDirectory,
  scanLocalDirectory,
  type LocalFile,
} from '@/lib/connectors/local-connector';
import {
  applyScanCap,
  folderToSelection,
  buildSelectionFromFiles,
} from '@/lib/local-drive/scanner';
import { hasFileSystemAccessAPI, hasFilePicker } from '@/lib/local-drive/capability';

// Note: FilePickerAcceptType isn't in lib.dom.d.ts widely yet — typed inline.
interface FsAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}
const ALLOWED_FS_TYPES: FsAcceptType[] = [
  {
    description: 'Documents',
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
  },
];

export interface LocalPickerResult {
  selection: DataSourceSelection;
  /** 인덱싱 대상 파일 (capped 적용 후). FS API 경로면 핸들 포함된 LocalFile, drop 경로면 File. */
  files: LocalFile[] | File[];
  /** FS Access API 경로에서만 존재 — IndexedDB 저장용. */
  handle?: FileSystemDirectoryHandle | FileSystemFileHandle;
  capped: boolean;
  totalMatched: number;
  skippedOther: number;
  /** 변경 감지 baseline. */
  snapshot: Array<{ path: string; lastModified: number }>;
}

/**
 * Folder picker 경로 (Chromium·Edge·Opera).
 * 사용자 제스처(클릭) 안에서 호출해야 함.
 */
export async function pickFolderViaFsAccess(): Promise<LocalPickerResult | null> {
  if (!hasFileSystemAccessAPI()) {
    throw new Error('File System Access API not supported');
  }
  let dirHandle: FileSystemDirectoryHandle;
  try {
    dirHandle = await pickLocalDirectory();
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return null;
    throw err;
  }
  const raw = await scanLocalDirectory(dirHandle);
  const cap = applyScanCap(raw);
  const id = `local:${crypto.randomUUID()}`;
  const folderName = dirHandle.name || 'Local folder';
  const selection = folderToSelection({
    id,
    folderName,
    files: cap.files,
    totalMatched: cap.totalMatched,
  });
  return {
    selection,
    files: cap.files,
    handle: dirHandle,
    capped: cap.capped,
    totalMatched: cap.totalMatched,
    skippedOther: cap.skippedOther,
    snapshot: cap.files.map((f) => ({ path: f.path, lastModified: f.lastModified })),
  };
}

/**
 * 단일/다수 파일 picker (FS Access API).
 */
export async function pickFilesViaFsAccess(): Promise<LocalPickerResult | null> {
  if (!hasFilePicker()) {
    throw new Error('File picker not supported');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  let handles: FileSystemFileHandle[];
  try {
    handles = await w.showOpenFilePicker({
      multiple: true,
      types: ALLOWED_FS_TYPES,
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return null;
    throw err;
  }
  if (!handles || handles.length === 0) return null;

  // LocalFile 형식으로 변환
  const localFiles: LocalFile[] = [];
  for (const h of handles) {
    const file = await h.getFile();
    localFiles.push({
      name: h.name,
      path: h.name,
      handle: h,
      size: file.size,
      lastModified: file.lastModified,
    });
  }
  const cap = applyScanCap(localFiles);
  const id = `local:${crypto.randomUUID()}`;

  // 1개면 file selection, 여러 개면 가짜 folder
  const selection: DataSourceSelection = cap.files.length === 1
    ? {
        id,
        kind: 'file',
        name: cap.files[0].name,
        path: cap.files[0].path,
        indexedFileCount: 0,
        totalFileCount: 1,
        approxBytes: cap.files[0].size,
      }
    : {
        id,
        kind: 'folder',
        name: `${cap.files.length} files`,
        path: 'multi',
        includeSubfolders: false,
        fileCountCap: cap.files.length,
        indexedFileCount: 0,
        totalFileCount: cap.totalMatched,
        approxBytes: cap.files.reduce((s, f) => s + f.size, 0),
      };

  return {
    selection,
    files: cap.files,
    // 1개일 때만 단일 파일 핸들 — IndexedDB 저장 가능. 여러 개면 핸들 보관 X (재선택 필요)
    handle: cap.files.length === 1 ? cap.files[0].handle : undefined,
    capped: cap.capped,
    totalMatched: cap.totalMatched,
    skippedOther: cap.skippedOther,
    snapshot: cap.files.map((f) => ({ path: f.path, lastModified: f.lastModified })),
  };
}

/**
 * Drag & Drop / input[type=file] 결과 처리.
 * 핸들 없음 → needsReselection=true 로 store 에 저장 권장.
 */
export function buildSelectionFromDroppedFiles(opts: {
  files: File[];
  label?: string;
}): LocalPickerResult | null {
  if (!opts.files || opts.files.length === 0) return null;
  const id = `local:${crypto.randomUUID()}`;
  const label = opts.label ?? (opts.files.length === 1 ? opts.files[0].name : 'Dropped files');
  const built = buildSelectionFromFiles({ id, label, files: opts.files });
  if (!built.selection || built.files.length === 0) return null;
  return {
    selection: built.selection,
    files: built.files,
    capped: built.capped,
    totalMatched: built.totalMatched,
    skippedOther: built.skippedOther,
    snapshot: built.files.map((f) => ({ path: f.name, lastModified: f.lastModified })),
  };
}
