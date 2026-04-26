// Blend IndexedDB (Dexie) — Tori 명세 Komi_IndexedDB_Migration_2026-04-25.md
// 11개 테이블, version 1 (영구). 향후 변경 시 version(2) 추가.

import Dexie, { type Table } from 'dexie';
import type {
  DBChat,
  DBMessage,
  DBMeeting,
  DBMeetingTranscript,
  DBMeetingSegment,
  DBMeetingAnalysis,
  DBDocument,
  DBDocumentChunk,
  DBDataSource,
  DBDataSourceChunk,
} from '@/types/db';

export class BlendDatabase extends Dexie {
  chats!: Table<DBChat, string>;
  messages!: Table<DBMessage, string>;

  meetings!: Table<DBMeeting, string>;
  meetingTranscripts!: Table<DBMeetingTranscript, string>;
  meetingSegments!: Table<DBMeetingSegment, string>;
  meetingAnalyses!: Table<DBMeetingAnalysis, string>;

  documents!: Table<DBDocument, string>;
  documentChunks!: Table<DBDocumentChunk, string>;

  dataSources!: Table<DBDataSource, string>;
  dataSourceChunks!: Table<DBDataSourceChunk, string>;

  constructor() {
    super('blend');
    this.version(1).stores({
      chats: 'id, createdAt, updatedAt, folderId, *tags',
      messages: 'id, chatId, createdAt, [chatId+createdAt]',

      meetings: 'id, createdAt, updatedAt',
      meetingTranscripts: 'meetingId',
      meetingSegments: 'id, meetingId, [meetingId+startTime]',
      meetingAnalyses: 'meetingId',

      documents: 'id, filename, uploadedAt',
      documentChunks: 'id, documentId, [documentId+chunkIndex]',

      dataSources: 'id, type, connectedAt',
      dataSourceChunks: 'id, dataSourceId, fileId, [dataSourceId+fileId]',
    });
  }
}

let dbInstance: BlendDatabase | null = null;

export function getDB(): BlendDatabase {
  if (typeof window === 'undefined') {
    throw new Error('Database can only be accessed in browser');
  }
  if (!dbInstance) {
    dbInstance = new BlendDatabase();
  }
  return dbInstance;
}

export async function resetDB(): Promise<void> {
  if (dbInstance) {
    await dbInstance.delete();
    dbInstance = null;
  }
}
