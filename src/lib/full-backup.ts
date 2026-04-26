// Full Backup / Import / Clear All — Tori 명세 16417054
//
// Bug 핫픽스: PR #20/#21에서 IndexedDB 마이그레이션 후 fullBackup이
// localStorage만 읽어 채팅/파일/이미지/문서를 모두 누락시킨 회귀.
//
// v2.0 백업 구조:
//   {
//     version: '2.0',
//     exportedAt,
//     indexed: { chats, messages, meetings, ... } (Dexie 11 테이블),
//     local:   { 'blend:*' / 'd1:*' localStorage 키 },
//     meta:    { totalChats, totalMessages, totalFiles, totalImages, totalDocuments },
//   }
//
// v1.0 호환: chats/prompts/agents/usage/settings (구 localStorage 구조) 복원.

import { getDB } from './db/blend-db';

export interface BackupMeta {
  totalChats: number;
  totalMessages: number;
  totalFiles: number;
  totalImages: number;
  totalDocuments: number;
  totalMeetings: number;
  totalDataSources: number;
}

export interface BackupV2 {
  version: '2.0';
  exportedAt: string;
  meta: BackupMeta;
  indexed: Record<string, unknown[]>;
  local: Record<string, string>;
}

export interface BackupV1Legacy {
  version?: '1.0' | string;
  exportedAt?: string;
  chats?: unknown[];
  prompts?: unknown[];
  agents?: unknown[];
  usage?: unknown[];
  settings?: Record<string, unknown>;
}

const TABLE_NAMES = [
  'chats',
  'messages',
  'meetings',
  'meetingTranscripts',
  'meetingSegments',
  'meetingAnalyses',
  'documents',
  'documentChunks',
  'dataSources',
  'dataSourceChunks',
] as const;

const LS_PREFIXES = ['blend:', 'blend-', 'd1:'];

function isBlendLocalKey(key: string): boolean {
  return LS_PREFIXES.some((p) => key.startsWith(p));
}

async function dumpIndexedDB(): Promise<{
  indexed: Record<string, unknown[]>;
  meta: BackupMeta;
}> {
  const db = getDB();
  const indexed: Record<string, unknown[]> = {};
  for (const name of TABLE_NAMES) {
    const table = (db as unknown as Record<string, { toArray: () => Promise<unknown[]> } | undefined>)[name];
    indexed[name] = table ? await table.toArray() : [];
  }
  // documents에 chunks가 들어있어 'totalFiles'/'totalImages'를 분리해 카운트.
  // 메시지 첨부는 message.images 형태(base64) — count는 메시지 단위로 추정.
  const messages = indexed.messages ?? [];
  type MsgWithImages = { images?: unknown[] };
  const messagesWithImages = (messages as MsgWithImages[]).filter(
    (m) => Array.isArray(m?.images) && m.images.length > 0,
  ).length;
  const meta: BackupMeta = {
    totalChats:       (indexed.chats ?? []).length,
    totalMessages:    (indexed.messages ?? []).length,
    totalFiles:       (indexed.documents ?? []).length,    // 업로드한 RAG 문서
    totalImages:      messagesWithImages,                  // 메시지 첨부 이미지가 있는 메시지 수
    totalDocuments:   (indexed.documents ?? []).length,
    totalMeetings:    (indexed.meetings ?? []).length,
    totalDataSources: (indexed.dataSources ?? []).length,
  };
  return { indexed, meta };
}

function dumpLocalStorage(): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof window === 'undefined') return out;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && isBlendLocalKey(key)) {
      const value = localStorage.getItem(key);
      if (value !== null) out[key] = value;
    }
  }
  return out;
}

export async function buildBackup(): Promise<BackupV2> {
  const { indexed, meta } = await dumpIndexedDB();
  const local = dumpLocalStorage();
  return {
    version: '2.0',
    exportedAt: new Date().toISOString(),
    meta,
    indexed,
    local,
  };
}

export async function downloadBackup(): Promise<BackupMeta> {
  const backup = await buildBackup();
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `blend-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  return backup.meta;
}

// ─────────────────────────────────────────────────────────────────────
// IMPORT
// ─────────────────────────────────────────────────────────────────────

export type ImportResult =
  | { ok: true;  version: '2.0'; meta: BackupMeta }
  | { ok: true;  version: '1.0' }
  | { ok: false; error: string };

export async function importBackup(text: string): Promise<ImportResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Invalid JSON' };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Invalid backup' };
  }
  const version = (parsed as { version?: string }).version;

  if (version === '2.0') {
    const v2 = parsed as BackupV2;
    if (!v2.indexed || typeof v2.indexed !== 'object') {
      return { ok: false, error: 'v2.0 missing indexed tables' };
    }
    const db = getDB();
    // 모든 테이블을 한 번의 transaction에서 clear + bulkPut
    const tableHandles = TABLE_NAMES
      .map((name) => (db as unknown as Record<string, { clear: () => Promise<void>; bulkPut: (rows: unknown[]) => Promise<unknown> } | undefined>)[name])
      .filter((t): t is { clear: () => Promise<void>; bulkPut: (rows: unknown[]) => Promise<unknown> } => !!t);
    try {
      // Dexie transaction 시그니처: transaction(mode, ...tables, callback)
      // 우리는 각 테이블 핸들이 표준 Table 인스턴스라 가정.
      await db.transaction('rw', db.tables, async () => {
        for (const name of TABLE_NAMES) {
          const rows = v2.indexed[name];
          const table = (db as unknown as Record<string, { clear: () => Promise<void>; bulkPut: (rows: unknown[]) => Promise<unknown> } | undefined>)[name];
          if (!table) continue;
          await table.clear();
          if (Array.isArray(rows) && rows.length > 0) {
            await table.bulkPut(rows);
          }
        }
      });
    } catch (e) {
      return { ok: false, error: `IDB import failed: ${(e as Error).message}` };
    }
    if (v2.local && typeof v2.local === 'object') {
      for (const [key, value] of Object.entries(v2.local)) {
        if (typeof value === 'string') {
          try { localStorage.setItem(key, value); } catch { /* quota */ }
        }
      }
    }
    return { ok: true, version: '2.0', meta: v2.meta };
  }

  // v1.0 (legacy) 호환 — localStorage만 복원
  const v1 = parsed as BackupV1Legacy;
  if (Array.isArray(v1.chats))   localStorage.setItem('blend:chats',   JSON.stringify(v1.chats));
  if (Array.isArray(v1.prompts)) localStorage.setItem('blend:prompts', JSON.stringify(v1.prompts));
  if (Array.isArray(v1.agents))  localStorage.setItem('blend:agents',  JSON.stringify(v1.agents));
  if (Array.isArray(v1.usage))   localStorage.setItem('blend:usage',   JSON.stringify(v1.usage));
  if (v1.settings && typeof v1.settings === 'object') {
    localStorage.setItem('blend:settings', JSON.stringify(v1.settings));
  }
  return { ok: true, version: '1.0' };
}

// ─────────────────────────────────────────────────────────────────────
// COUNT (for Clear All confirmation)
// ─────────────────────────────────────────────────────────────────────

export async function getCounts(): Promise<BackupMeta> {
  const { meta } = await dumpIndexedDB();
  return meta;
}

// ─────────────────────────────────────────────────────────────────────
// CLEAR ALL
// ─────────────────────────────────────────────────────────────────────

export async function clearAllData(): Promise<void> {
  // 1. IndexedDB 11 테이블 모두 clear (한 transaction)
  const db = getDB();
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      await table.clear();
    }
  });
  // 2. localStorage blend:* / d1:* 만 삭제 (다른 키는 보존)
  if (typeof window !== 'undefined') {
    const toDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && isBlendLocalKey(key)) toDelete.push(key);
    }
    toDelete.forEach((k) => localStorage.removeItem(k));
  }
}
