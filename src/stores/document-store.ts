// Blend - Document Store (session-only, not persisted due to size)

import { create } from 'zustand';
import { ParsedDocument } from '@/modules/plugins/document-plugin';

interface DocumentState {
  documents: ParsedDocument[];
  activeDocIds: Set<string>;

  addDocument: (doc: ParsedDocument) => void;
  updateDocument: (doc: ParsedDocument) => void;
  removeDocument: (id: string) => void;
  toggleActive: (id: string) => void;
  getActiveDocs: () => ParsedDocument[];
  clearAll: () => void;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: [],
  activeDocIds: new Set(),

  addDocument: (doc) => {
    set((state) => ({
      documents: [...state.documents, doc],
      activeDocIds: new Set([...state.activeDocIds, doc.id]),
    }));
  },

  updateDocument: (doc) => {
    set((state) => ({
      documents: state.documents.map((d) => (d.id === doc.id ? doc : d)),
    }));
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
  },

  toggleActive: (id) => {
    set((state) => {
      const next = new Set(state.activeDocIds);
      next.has(id) ? next.delete(id) : next.add(id);
      return { activeDocIds: next };
    });
  },

  getActiveDocs: () => {
    const { documents, activeDocIds } = get();
    return documents.filter((d) => activeDocIds.has(d.id));
  },

  clearAll: () => set({ documents: [], activeDocIds: new Set() }),
}));
