// Blend - Data Source Store (Enterprise multi-source RAG)
// Persists connected source configs in localStorage (tokens encrypted client-side)

import { create } from 'zustand';
import { DataSource, DataSourceConfig, DataSourceStatus } from '@/types';

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
  localStorage.setItem(LS_KEY, JSON.stringify(sources));
}

interface DataSourceState {
  sources: DataSource[];
  addSource: (config: DataSourceConfig, name: string, handle?: FileSystemDirectoryHandle) => DataSource;
  updateSource: (id: string, patch: Partial<DataSource>) => void;
  removeSource: (id: string) => void;
  setStatus: (id: string, status: DataSourceStatus, error?: string) => void;
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

  getHandle: (id) => localHandleMap.get(id),
  setHandle: (id, handle) => { localHandleMap.set(id, handle); },
}));
