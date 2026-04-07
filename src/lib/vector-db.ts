// Blend - Vector DB abstraction layer (Tier 1: IndexedDB)
// Migration path: replace this file's internals with Qdrant client for Tier 2
// Interface remains identical so all callers need zero changes.

import { openDB, IDBPDatabase } from 'idb';
import { ParsedDocument } from '@/modules/plugins/document-plugin';

const DB_NAME = 'blend-vector-db';
const DB_VERSION = 1;

type StoredDocument = ParsedDocument & { createdAt: number; updatedAt: number };

interface BlendDB {
  documents: {
    key: string;
    value: StoredDocument;
    indexes: { 'by-name': string };
  };
  settings: {
    key: string;
    value: { key: string; value: unknown };
  };
}

let _db: IDBPDatabase<BlendDB> | null = null;

async function getDB(): Promise<IDBPDatabase<BlendDB>> {
  if (_db) return _db;
  _db = await openDB<BlendDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('documents')) {
        const store = db.createObjectStore('documents', { keyPath: 'id' });
        store.createIndex('by-name', 'name');
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    },
  });
  return _db;
}

export async function saveDocument(doc: ParsedDocument): Promise<void> {
  const db = await getDB();
  const now = Date.now();
  const existing = await db.get('documents', doc.id);
  await db.put('documents', {
    ...doc,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
}

export async function getDocument(id: string): Promise<ParsedDocument | undefined> {
  const db = await getDB();
  return db.get('documents', id);
}

export async function getAllDocuments(): Promise<ParsedDocument[]> {
  const db = await getDB();
  return db.getAll('documents');
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('documents', id);
}

export async function getActiveDocIds(): Promise<string[]> {
  const db = await getDB();
  const record = await db.get('settings', 'activeDocIds');
  return (record?.value as string[] | undefined) ?? [];
}

export async function setActiveDocIds(ids: string[]): Promise<void> {
  const db = await getDB();
  await db.put('settings', { key: 'activeDocIds', value: ids });
}
