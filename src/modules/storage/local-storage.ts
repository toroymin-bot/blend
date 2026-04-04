// Blend - Storage Module (Reusable: any project needing local persistence)
// Uses IndexedDB for large data, localStorage for small config

import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'blend-db';
const DB_VERSION = 1;

const STORES = {
  chats: 'chats',
  settings: 'settings',
  prompts: 'prompts',
  agents: 'agents',
  usage: 'usage',
} as const;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        Object.values(STORES).forEach((store) => {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store, { keyPath: 'id' });
          }
        });
      },
    });
  }
  return dbPromise;
}

export const storage = {
  async get<T>(store: keyof typeof STORES, id: string): Promise<T | undefined> {
    const db = await getDB();
    return db.get(STORES[store], id);
  },

  async getAll<T>(store: keyof typeof STORES): Promise<T[]> {
    const db = await getDB();
    return db.getAll(STORES[store]);
  },

  async put<T>(store: keyof typeof STORES, data: T): Promise<void> {
    const db = await getDB();
    await db.put(STORES[store], data);
  },

  async delete(store: keyof typeof STORES, id: string): Promise<void> {
    const db = await getDB();
    await db.delete(STORES[store], id);
  },

  async clear(store: keyof typeof STORES): Promise<void> {
    const db = await getDB();
    await db.clear(STORES[store]);
  },

  // localStorage helpers for small config
  getConfig<T>(key: string, defaultValue: T): T {
    if (typeof window === 'undefined') return defaultValue;
    const val = localStorage.getItem(`blend:${key}`);
    return val ? JSON.parse(val) : defaultValue;
  },

  setConfig<T>(key: string, value: T): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(`blend:${key}`, JSON.stringify(value));
  },

  removeConfig(key: string): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(`blend:${key}`);
  },
};
