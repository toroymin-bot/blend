// Blend - Document Store (IndexedDB persistent, Tier 1 vector DB)

import { create } from 'zustand';
import { ParsedDocument } from '@/modules/plugins/document-plugin';
import {
  saveDocument,
  getAllDocuments,
  deleteDocument,
  getActiveDocIds,
  setActiveDocIds,
} from '@/lib/vector-db';

// [2026-04-26] D-1 — 임베딩 진행률 칩 표시용 (메모리만, IDB 저장 X)
export interface EmbedProgressEntry {
  status: 'embedding' | 'done' | 'error';
  percent: number;
  startedAt: number;
  error?: string;
}

interface DocumentState {
  documents: ParsedDocument[];
  activeDocIds: Set<string>;
  isLoaded: boolean;
  // Tori 명세 — race-safe 로딩 보장: 진행 중인 promise를 보존
  loadPromise: Promise<void> | null;
  // [2026-04-26] D-1 — 문서별 임베딩 진행 상태
  embedProgress: Record<string, EmbedProgressEntry>;

  addDocument: (doc: ParsedDocument) => void;
  updateDocument: (doc: ParsedDocument) => void;
  removeDocument: (id: string) => void;
  toggleActive: (id: string) => void;
  getActiveDocs: () => ParsedDocument[];
  clearAll: () => void;
  loadFromDB: (opts?: { force?: boolean }) => Promise<void>;
  /** 호출 시 isLoaded면 즉시 resolve, 아니면 진행 중 promise 또는 새 로딩 시작 */
  ensureLoaded: () => Promise<void>;
  // [2026-04-26] D-1 액션
  beginEmbedding: (id: string) => void;
  setEmbedPercent: (id: string, percent: number) => void;
  finishEmbedding: (id: string, ok: boolean, error?: string) => void;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: [],
  activeDocIds: new Set(),
  isLoaded: false,
  loadPromise: null,
  embedProgress: {},

  loadFromDB: async (opts) => {
    // [2026-04-20] BUG-FIX: force=true allows reload after datasource sync / meeting analysis
    // Without this, isLoaded guard prevented refreshing newly-indexed documents.
    if (get().isLoaded && !opts?.force) return;
    // race 방지: 이미 진행 중이면 같은 promise 반환
    if (get().loadPromise && !opts?.force) return get().loadPromise!;

    const promise = (async () => {
      try {
        const [docs, activeIds] = await Promise.all([getAllDocuments(), getActiveDocIds()]);
        set({
          documents: docs,
          activeDocIds: new Set(activeIds),
          isLoaded: true,
          loadPromise: null,
        });
      } catch {
        set({ isLoaded: true, loadPromise: null });
      }
    })();
    set({ loadPromise: promise });
    return promise;
  },

  ensureLoaded: () => {
    const s = get();
    if (s.isLoaded) return Promise.resolve();
    if (s.loadPromise) return s.loadPromise;
    return get().loadFromDB();
  },

  addDocument: (doc) => {
    set((state) => ({
      documents: [...state.documents, doc],
      activeDocIds: new Set([...state.activeDocIds, doc.id]),
    }));
    saveDocument(doc).catch(() => {});
    const next = new Set([...get().activeDocIds, doc.id]);
    setActiveDocIds([...next]).catch(() => {});
  },

  updateDocument: (doc) => {
    set((state) => ({
      documents: state.documents.map((d) => (d.id === doc.id ? doc : d)),
    }));
    saveDocument(doc).catch(() => {});
  },

  removeDocument: (id) => {
    set((state) => {
      const next = new Set(state.activeDocIds);
      next.delete(id);
      return {
        documents: state.documents.filter((d) => d.id !== id),
        activeDocIds: next,
      };
    });
    deleteDocument(id).catch(() => {});
    const remaining = get().activeDocIds;
    setActiveDocIds([...remaining]).catch(() => {});
  },

  toggleActive: (id) => {
    set((state) => {
      const next = new Set(state.activeDocIds);
      next.has(id) ? next.delete(id) : next.add(id);
      return { activeDocIds: next };
    });
    const updated = get().activeDocIds;
    setActiveDocIds([...updated]).catch(() => {});
  },

  getActiveDocs: () => {
    const { documents, activeDocIds } = get();
    return documents.filter((d) => activeDocIds.has(d.id));
  },

  clearAll: () => {
    set({ documents: [], activeDocIds: new Set(), embedProgress: {} });
    setActiveDocIds([]).catch(() => {});
  },

  // [2026-04-26] D-1 — 임베딩 진행 상태 액션
  beginEmbedding: (id) => {
    set((state) => ({
      embedProgress: {
        ...state.embedProgress,
        [id]: { status: 'embedding', percent: 0, startedAt: Date.now() },
      },
    }));
  },
  setEmbedPercent: (id, percent) => {
    set((state) => {
      const prev = state.embedProgress[id];
      if (!prev) return state;
      return {
        embedProgress: {
          ...state.embedProgress,
          [id]: { ...prev, percent: Math.min(100, Math.max(0, percent)) },
        },
      };
    });
  },
  finishEmbedding: (id, ok, error) => {
    set((state) => {
      const prev = state.embedProgress[id];
      if (!prev) return state;
      return {
        embedProgress: {
          ...state.embedProgress,
          [id]: {
            ...prev,
            status: ok ? 'done' : 'error',
            percent: ok ? 100 : prev.percent,
            error,
          },
        },
      };
    });
  },
}));
