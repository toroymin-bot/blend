/**
 * Local Drive — Handle Persistence (Tori 19857410 §2.3).
 *
 * FileSystemDirectoryHandle/FileHandle를 IndexedDB에 영구 저장.
 * 브라우저 재시작 후에도 폴더 자동 인식 가능 (단, 권한은 재요청 필요 —
 * 사용자 제스처 후 verifyPermission 호출).
 *
 * 별도 작은 DB(`blend-local-drive`) — 메인 Dexie DB(`blend`)와 분리해
 * Dexie 스키마 마이그레이션 영향 없음.
 */

import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'blend-local-drive';
const DB_VERSION = 1;
const STORE = 'directory-handles';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (typeof window === 'undefined') {
    throw new Error('Local handle store only available in browser');
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      },
    });
  }
  return dbPromise;
}

export type StoredHandle = FileSystemDirectoryHandle | FileSystemFileHandle;

/** 저장 — 동일 id 있으면 덮어씀. */
export async function saveHandle(id: string, handle: StoredHandle): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const db = await getDB();
    await db.put(STORE, handle, id);
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.warn('[local-drive] saveHandle failed:', (err as Error)?.message);
    }
  }
}

export async function loadHandle(id: string): Promise<StoredHandle | null> {
  if (typeof window === 'undefined') return null;
  try {
    const db = await getDB();
    return (await db.get(STORE, id)) ?? null;
  } catch {
    return null;
  }
}

export async function deleteHandle(id: string): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const db = await getDB();
    await db.delete(STORE, id);
  } catch {
    /* 무시 */
  }
}

export async function listHandleIds(): Promise<string[]> {
  if (typeof window === 'undefined') return [];
  try {
    const db = await getDB();
    return (await db.getAllKeys(STORE)) as string[];
  } catch {
    return [];
  }
}

/**
 * 권한 재확인 — 페이지 reload 후 사용자 제스처(클릭) 안에서 호출해야 함.
 * 'queryPermission' 부터 시도 후 'requestPermission'.
 */
export async function verifyPermission(
  handle: StoredHandle,
  mode: 'read' | 'readwrite' = 'read'
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const h = handle as any;
  const opts = { mode };
  try {
    if (typeof h.queryPermission === 'function') {
      if ((await h.queryPermission(opts)) === 'granted') return true;
    }
    if (typeof h.requestPermission === 'function') {
      return (await h.requestPermission(opts)) === 'granted';
    }
  } catch {
    /* 무시 */
  }
  return false;
}
