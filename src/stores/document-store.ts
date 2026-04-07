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

interface DocumentState {
  documents: ParsedDocument[];
  activeDocIds: Set<string>;
  isLoaded: boolean;

  addDocument: (doc: ParsedDocument) => void;
  updateDocument: (doc: ParsedDocument) => void;
  removeDocument: (id: string) => void;
  toggleActive: (id: string) => void;
  getActiveDocs: () => ParsedDocument[];
  clearAll: () => void;
  loadFromDB: () => Promise<void>;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: [],
  activeDocIds: new Set(),
  isLoaded: false,

  loadFromDB: async () => {
    if (get().isLoaded) return;
    try {
      const [docs, activeIds] = await Promise.all([getAllDocuments(), getActiveDocIds()]);
      set({
        documents: docs,
        activeDocIds: new Set(activeIds),
        isLoaded: true,
      });
    } catch {
      // IndexedDB unavailable (SSR or private browsing) — stay in-memory
      set({ isLoaded: true });
    }
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
    set({ documents: [], activeDocIds: new Set() });
    setActiveDocIds([]).catch(() => {});
  },
}));
