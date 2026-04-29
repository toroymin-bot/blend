/**
 * Local Drive — Capability detection (Tori 19857410 §3).
 *
 * 브라우저별 분기:
 *  - Chrome/Edge/Opera: File System Access API (showDirectoryPicker, showOpenFilePicker)
 *    → 폴더 핸들 영구 저장(IndexedDB), 자동 변경 감지
 *  - Safari/Firefox: Drag & Drop fallback only
 *    → 매 세션 재선택 필요 (needsReselection: true)
 *  - 모바일: showDirectoryPicker 없음 → 파일 선택만 가능
 */

export type LocalCapability = 'fs_access_api' | 'drag_drop_only';

export function hasFileSystemAccessAPI(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export function hasFilePicker(): boolean {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window;
}

/**
 * Drag & Drop 폴더 처리 가능 여부. webkitGetAsEntry는 Chromium·WebKit·최신 Firefox 모두 지원.
 */
export function hasDirectoryDrop(): boolean {
  if (typeof window === 'undefined') return false;
  // DataTransferItem.webkitGetAsEntry 존재 여부로 판단
  // (DataTransferItem prototype 직접 확인은 Safari에서 불안정 — UA 기반 fallback 없이 capability 검출)
  return 'DataTransferItem' in window && 'webkitGetAsEntry' in DataTransferItem.prototype;
}

/**
 * 모바일 브라우저 추정 (UA + 터치). 모바일은 폴더 드롭 거의 불가 → 파일 선택만.
 */
export function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
}

export function detectCapability(): LocalCapability {
  return hasFileSystemAccessAPI() ? 'fs_access_api' : 'drag_drop_only';
}
