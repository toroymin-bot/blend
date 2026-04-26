// Blend - Data Source Store (Enterprise multi-source RAG)
// Persists connected source configs in localStorage (tokens encrypted client-side)

import { create } from 'zustand';
import { DataSource, DataSourceConfig, DataSourceStatus } from '@/types';
import { safeSetItem } from '@/lib/safe-storage';

const LS_KEY = 'blend:datasources';

// FileSystemDirectoryHandle cannot be serialized — stored separately in memory
const localHandleMap = new Map<string, FileSystemDirectoryHandle>();

function load(): DataSource[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function persist(sources: DataSource[]) {
  safeSetItem(LS_KEY, JSON.stringify(sources), 'datasources');
  // Sprint 4 — IndexedDB 동기화 (비동기, 실패해도 localStorage는 유지)
  if (typeof window === 'undefined') return;
  (async () => {
    try {
      const { getDB } = await import('@/lib/db/blend-db');
      const db = getDB();
      await db.transaction('rw', db.dataSources, async () => {
        await db.dataSources.clear();
        for (const s of sources) {
          const cfg = s.config as { type: string; folderId?: string; folderName?: string; folderPath?: string; accessToken?: string; expiresAt?: number };
          await db.dataSources.put({
            id: s.id,
            type: cfg.type as 'google-drive' | 'onedrive' | 'webdav' | 'local',
            serviceName: s.name,
            folderId: cfg.folderId,
            folderName: cfg.folderName,
            folderPath: cfg.folderPath,
            accessToken: cfg.accessToken,
            expiresAt: cfg.expiresAt,
            connectedAt: s.lastSync ?? Date.now(),
            lastSyncAt: s.lastSync,
            fileCount: s.fileCount ?? 0,
            isActive: s.isActive,
          });
        }
      });
    } catch { /* IDB 실패 무시 */ }
  })();
}

interface DataSourceState {
  sources: DataSource[];
  addSource: (config: DataSourceConfig, name: string, handle?: FileSystemDirectoryHandle) => DataSource;
  updateSource: (id: string, patch: Partial<DataSource>) => void;
  removeSource: (id: string) => void;
  setStatus: (id: string, status: DataSourceStatus, error?: string) => void;
  // Tori 핫픽스 (2026-04-25) — 채팅 RAG 활성/비활성 토글
  setActive: (id: string, active: boolean) => void;
  toggleActive: (id: string) => void;
  getHandle: (id: string) => FileSystemDirectoryHandle | undefined;
  setHandle: (id: string, handle: FileSystemDirectoryHandle) => void;
  loadFromStorage: () => void;
}

export const useDataSourceStore = create<DataSourceState>((set, get) => ({
  sources: [],

  loadFromStorage: () => set({ sources: load() }),

  addSource: (config, name, handle) => {
    const source: DataSource = {
      id: crypto.randomUUID(),
      name,
      type: config.type,
      status: 'idle',
      config,
      // Tori 핫픽스 — 연결 즉시 채팅에서 자동 활용 (Roy 결정)
      isActive: true,
    };
    if (handle) localHandleMap.set(source.id, handle);
    set((s) => {
      const next = [...s.sources, source];
      persist(next);
      return { sources: next };
    });
    return source;
  },

  updateSource: (id, patch) => {
    set((s) => {
      const next = s.sources.map((src) => (src.id === id ? { ...src, ...patch } : src));
      persist(next);
      return { sources: next };
    });
  },

  removeSource: (id) => {
    localHandleMap.delete(id);
    set((s) => {
      const next = s.sources.filter((src) => src.id !== id);
      persist(next);
      return { sources: next };
    });
  },

  setStatus: (id, status, error) => {
    set((s) => {
      const next = s.sources.map((src) =>
        src.id === id ? { ...src, status, error: error ?? undefined } : src
      );
      persist(next);
      return { sources: next };
    });
  },

  // Tori 핫픽스 — 채팅 RAG 활성 토글 (연결 해제 X)
  setActive: (id, active) => {
    set((s) => {
      const next = s.sources.map((src) => (src.id === id ? { ...src, isActive: active } : src));
      persist(next);
      return { sources: next };
    });
  },
  toggleActive: (id) => {
    set((s) => {
      const next = s.sources.map((src) => (src.id === id ? { ...src, isActive: !src.isActive } : src));
      persist(next);
      return { sources: next };
    });
  },

  getHandle: (id) => localHandleMap.get(id),
  setHandle: (id, handle) => { localHandleMap.set(id, handle); },
}));
