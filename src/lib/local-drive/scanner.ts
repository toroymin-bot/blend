/**
 * Local Drive — 폴더/파일 스캔 결과 → 화이트리스트 검증·캡 적용 → Selection 변환
 * (Tori 19857410 §2.2 + 영역 1 비용 미리보기 통합).
 *
 * 기존 `lib/connectors/local-connector.ts`의 scanLocalDirectory 결과(LocalFile[])를
 * 받아 200캡 적용·DataSourceSelection 으로 변환. 화이트리스트는 picker-shared 재사용.
 */

import type { DataSourceSelection } from '@/types';
import {
  ALLOWED_EXTENSIONS,
  MAX_FILES_PER_FOLDER,
  isAllowedExtension,
} from '@/modules/datasources/pickers/picker-shared';
import type { LocalFile } from '@/lib/connectors/local-connector';

export interface ScanCapResult {
  /** 화이트리스트 + 캡 적용 후 실제 인덱싱 대상. */
  files: LocalFile[];
  /** 원본 매칭 파일 수 (캡 적용 전). */
  totalMatched: number;
  /** 캡 적용 여부. */
  capped: boolean;
  /** 화이트리스트 외라 제외된 파일 수. */
  skippedOther: number;
}

/**
 * 화이트리스트 필터 + 200캡. lastModified 내림차순(최근 우선)으로 정렬 후 자른다.
 */
export function applyScanCap(
  raw: LocalFile[],
  cap = MAX_FILES_PER_FOLDER
): ScanCapResult {
  const allowed: LocalFile[] = [];
  let skipped = 0;
  for (const f of raw) {
    if (isAllowedExtension(f.name)) allowed.push(f);
    else skipped += 1;
  }
  allowed.sort((a, b) => b.lastModified - a.lastModified);
  const capped = allowed.length > cap;
  const files = capped ? allowed.slice(0, cap) : allowed;
  return {
    files,
    totalMatched: allowed.length,
    capped,
    skippedOther: skipped,
  };
}

export interface FolderSelectionInput {
  /** Selection.id — IndexedDB 키와 매핑. */
  id: string;
  folderName: string;
  files: LocalFile[];
  totalMatched: number;
}

/**
 * 폴더 1개 → DataSourceSelection. 폴더 안 파일 수 = totalFileCount.
 */
export function folderToSelection(input: FolderSelectionInput): DataSourceSelection {
  const approxBytes = input.files.reduce((sum, f) => sum + f.size, 0);
  return {
    id: input.id,
    kind: 'folder',
    name: input.folderName,
    path: input.folderName,
    includeSubfolders: true,
    fileCountCap: MAX_FILES_PER_FOLDER,
    indexedFileCount: 0,
    totalFileCount: input.totalMatched,
    approxBytes,
  };
}

/**
 * 파일 1개 → DataSourceSelection.
 */
export function fileToSelection(input: {
  id: string;
  name: string;
  path?: string;
  size: number;
}): DataSourceSelection {
  return {
    id: input.id,
    kind: 'file',
    name: input.name,
    path: input.path ?? input.name,
    indexedFileCount: 0,
    totalFileCount: 1,
    approxBytes: input.size,
  };
}

/**
 * Drag&Drop 또는 input[type=file] 로부터 받은 File[] 처리.
 * 화이트리스트 필터링 후 합쳐진 selection 반환 (단일 'folder' 가짜 selection — 사용자가
 * 여러 파일을 한 번에 드롭한 경우 합쳐서 한 폴더처럼 취급, 200 cap 적용).
 *
 * 파일이 1개면 file selection.
 */
export interface DroppedFilesResult {
  selection: DataSourceSelection;
  files: File[];
  capped: boolean;
  skippedOther: number;
  totalMatched: number;
}

export function buildSelectionFromFiles(opts: {
  id: string;
  label: string;     // 사용자에게 보여줄 이름 (e.g. "드롭한 파일")
  files: File[];
  cap?: number;
}): DroppedFilesResult {
  const cap = opts.cap ?? MAX_FILES_PER_FOLDER;
  const allowed: File[] = [];
  let skipped = 0;
  for (const f of opts.files) {
    if (isAllowedExtension(f.name)) allowed.push(f);
    else skipped += 1;
  }
  allowed.sort((a, b) => b.lastModified - a.lastModified);
  const capped = allowed.length > cap;
  const files = capped ? allowed.slice(0, cap) : allowed;
  const approxBytes = files.reduce((s, f) => s + f.size, 0);

  if (files.length === 1) {
    const only = files[0];
    return {
      selection: fileToSelection({
        id: opts.id,
        name: only.name,
        path: only.name,
        size: only.size,
      }),
      files,
      capped,
      skippedOther: skipped,
      totalMatched: allowed.length,
    };
  }

  const selection: DataSourceSelection = {
    id: opts.id,
    kind: 'folder',
    name: opts.label,
    path: opts.label,
    includeSubfolders: false,
    fileCountCap: cap,
    indexedFileCount: 0,
    totalFileCount: allowed.length,
    approxBytes,
  };
  return {
    selection,
    files,
    capped,
    skippedOther: skipped,
    totalMatched: allowed.length,
  };
}

export { ALLOWED_EXTENSIONS };
