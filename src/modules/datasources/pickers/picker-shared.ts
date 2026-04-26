// Picker 공통 — Tori 명세 16384118 §3.2
//
// 화이트리스트 + max items + per-folder cap.

import type { DataSourceSelection } from '@/types';

export const MAX_TOTAL_SELECTIONS = 20;
export const MAX_FILES_PER_FOLDER = 200;
export const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'txt', 'md', 'csv', 'xlsx'] as const;
export type AllowedExt = typeof ALLOWED_EXTENSIONS[number];

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.google-apps.folder',
] as const;

export type ValidationFailReason =
  | { kind: 'too_many'; limit: number; actual: number }
  | { kind: 'unsupported_format'; file: string }
  | { kind: 'folder_too_large'; folder: string; actual: number; limit: number };

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: ValidationFailReason };

export function isAllowedExtension(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase();
  return !!ext && (ALLOWED_EXTENSIONS as readonly string[]).includes(ext);
}

export function validateSelections(selections: DataSourceSelection[]): ValidationResult {
  if (selections.length > MAX_TOTAL_SELECTIONS) {
    return { ok: false, reason: { kind: 'too_many', limit: MAX_TOTAL_SELECTIONS, actual: selections.length } };
  }
  for (const s of selections) {
    if (s.kind === 'file' && !isAllowedExtension(s.name)) {
      return { ok: false, reason: { kind: 'unsupported_format', file: s.name } };
    }
    if (s.kind === 'folder' && s.totalFileCount > MAX_FILES_PER_FOLDER) {
      return { ok: false, reason: { kind: 'folder_too_large', folder: s.name, actual: s.totalFileCount, limit: MAX_FILES_PER_FOLDER } };
    }
  }
  return { ok: true };
}

export function describeValidationError(reason: ValidationFailReason, lang: 'ko' | 'en'): string {
  const ko = lang === 'ko';
  switch (reason.kind) {
    case 'too_many':
      return ko
        ? `최대 ${reason.limit}개까지 선택 가능합니다. 현재 ${reason.actual}개.`
        : `Max ${reason.limit} items. You picked ${reason.actual}.`;
    case 'unsupported_format':
      return ko
        ? `지원하지 않는 파일 형식: ${reason.file}. (PDF/DOCX/TXT/MD/CSV/XLSX만 지원)`
        : `Unsupported format: ${reason.file}. Only PDF/DOCX/TXT/MD/CSV/XLSX.`;
    case 'folder_too_large':
      return ko
        ? `폴더 "${reason.folder}"에 ${reason.actual}개 파일이 있어 너무 큽니다. 한도 ${reason.limit}.`
        : `Folder "${reason.folder}" has ${reason.actual} files (limit ${reason.limit}).`;
  }
}

// Picker 라이브러리에서 받은 raw 항목을 Selection으로 변환할 때 공통으로 쓸 helper
export function makeSelection(input: {
  id: string;
  kind: 'file' | 'folder';
  name: string;
  path?: string;
  fileCount?: number;
  approxBytes?: number;
}): DataSourceSelection {
  return {
    id: input.id,
    kind: input.kind,
    name: input.name,
    path: input.path ?? input.name,
    includeSubfolders: false,
    fileCountCap: input.kind === 'folder' ? MAX_FILES_PER_FOLDER : undefined,
    indexedFileCount: 0,
    totalFileCount: input.fileCount ?? (input.kind === 'file' ? 1 : 0),
    approxBytes: input.approxBytes,
  };
}
