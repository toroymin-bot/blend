/**
 * Local Drive — Drag & Drop helpers (Tori 19857410 §3.1).
 *
 * webkitGetAsEntry 기반 폴더 드롭 → File[] 추출. Safari/Firefox/모바일도 동작
 * (단, 폴더 핸들 영구 보존은 불가 — needsReselection 표기 필요).
 *
 * 로컬 파일 시스템 자체에 접근하지 않고, 드롭 시점에 받은 File 객체만 사용.
 */

import { isAllowedExtension } from '@/modules/datasources/pickers/picker-shared';

const TRAVERSE_LIMIT = 5000; // 무한 루프·과도한 큰 폴더 방지

/**
 * DataTransfer.items 또는 DataTransfer.files 에서 File[] 추출.
 * webkitGetAsEntry 가 있으면 폴더 재귀, 없으면 평탄한 files 만 처리.
 */
export async function extractFilesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  const result: File[] = [];

  // 1) items + webkitGetAsEntry (Chromium·WebKit·최신 Firefox)
  if (dt.items && typeof DataTransferItem !== 'undefined' &&
      'webkitGetAsEntry' in DataTransferItem.prototype) {
    const tasks: Promise<void>[] = [];
    for (let i = 0; i < dt.items.length; i++) {
      const item = dt.items[i];
      if (item.kind !== 'file') continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entry = (item as any).webkitGetAsEntry?.() as FileSystemEntry | null;
      if (!entry) {
        const f = item.getAsFile();
        if (f) result.push(f);
        continue;
      }
      tasks.push(traverseEntry(entry, '', result));
    }
    await Promise.all(tasks);
    if (result.length > 0) return result;
  }

  // 2) Fallback — files 평탄 리스트만
  if (dt.files) {
    for (let i = 0; i < dt.files.length; i++) {
      result.push(dt.files[i]);
    }
  }
  return result;
}

async function traverseEntry(
  entry: FileSystemEntry,
  prefix: string,
  out: File[]
): Promise<void> {
  if (out.length >= TRAVERSE_LIMIT) return;

  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    if (!isAllowedExtension(fileEntry.name)) return;
    await new Promise<void>((resolve) => {
      fileEntry.file(
        (file) => {
          // path를 보존하기 위해 lastModified 유지 + 이름은 prefix 포함
          const named = prefix
            ? new File([file], `${prefix}/${file.name}`, {
                type: file.type,
                lastModified: file.lastModified,
              })
            : file;
          out.push(named);
          resolve();
        },
        () => resolve()
      );
    });
    return;
  }

  if (entry.isDirectory) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') return;
    const dirEntry = entry as FileSystemDirectoryEntry;
    const reader = dirEntry.createReader();
    let entries: FileSystemEntry[] = [];
    // readEntries 는 한 번에 100개씩만 반환 — 빈 배열 받을 때까지 반복
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const batch = await new Promise<FileSystemEntry[]>((resolve) => {
        reader.readEntries(resolve as (e: FileSystemEntry[]) => void, () => resolve([]));
      });
      if (!batch || batch.length === 0) break;
      entries = entries.concat(batch);
      if (entries.length >= TRAVERSE_LIMIT) break;
    }
    const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
    for (const sub of entries) {
      if (out.length >= TRAVERSE_LIMIT) break;
      await traverseEntry(sub, nextPrefix, out);
    }
  }
}
