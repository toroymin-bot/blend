// Blend - Local Filesystem Connector (HDD / USB / local folder)
// Uses the File System Access API — works in modern Chromium browsers.
// Safari 15.2+ and Firefox 111+ have partial support.

const SUPPORTED_EXTS = new Set(['xlsx', 'xls', 'csv', 'txt', 'md', 'pdf']);

export interface LocalFile {
  name: string;
  path: string;   // relative path from root dir
  handle: FileSystemFileHandle;
  size: number;
  lastModified: number;
}

/**
 * Open a directory picker and return its handle.
 * The handle must be stored by the caller (e.g. datasource-store) for re-use.
 */
export async function pickLocalDirectory(): Promise<FileSystemDirectoryHandle> {
  if (!('showDirectoryPicker' in window)) {
    throw new Error('이 브라우저는 File System Access API를 지원하지 않습니다. Chrome/Edge를 사용해주세요.');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).showDirectoryPicker({ mode: 'read' });
}

/**
 * Recursively scan a directory handle for supported files.
 */
export async function scanLocalDirectory(
  dirHandle: FileSystemDirectoryHandle,
  basePath = ''
): Promise<LocalFile[]> {
  const results: LocalFile[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for await (const [name, handle] of (dirHandle as any).entries()) {
    const path = basePath ? `${basePath}/${name}` : name;

    if (handle.kind === 'directory') {
      // Skip hidden dirs
      if (name.startsWith('.') || name === 'node_modules') continue;
      const sub = await scanLocalDirectory(handle as FileSystemDirectoryHandle, path);
      results.push(...sub);
    } else {
      const ext = name.split('.').pop()?.toLowerCase() ?? '';
      if (!SUPPORTED_EXTS.has(ext)) continue;
      const file = await (handle as FileSystemFileHandle).getFile();
      results.push({
        name,
        path,
        handle: handle as FileSystemFileHandle,
        size: file.size,
        lastModified: file.lastModified,
      });
    }
  }

  return results;
}

/**
 * Read a file from a LocalFile entry.
 */
export async function readLocalFile(lf: LocalFile): Promise<File> {
  return lf.handle.getFile();
}

/**
 * Re-request permission for a stored directory handle (required after page reload).
 * Returns true if permission granted.
 */
export async function verifyLocalPermission(
  dirHandle: FileSystemDirectoryHandle
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const h = dirHandle as any;
  const opts = { mode: 'read' };
  if ((await h.queryPermission(opts)) === 'granted') return true;
  return (await h.requestPermission(opts)) === 'granted';
}
