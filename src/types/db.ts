// Blend IndexedDB 통합 타입 (Tori 명세 Komi_IndexedDB_Migration_2026-04-25.md)
// 11개 테이블 — chats, messages, meetings, meetingTranscripts, meetingSegments,
//             meetingAnalyses, documents, documentChunks, dataSources, dataSourceChunks,
//             (Attachment는 Message에 임베드)

export interface DBChat {
  id: string;
  title: string;
  model: string;
  provider: string;
  createdAt: number;
  updatedAt: number;
  folderId?: string;
  tags?: string[];
  pinned?: boolean;
  forkedFrom?: string;
  activeSourceIds?: string[];
  systemPrompt?: string;
  agentId?: string;
}

export interface DBMessage {
  id: string;
  chatId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
  sources?: DBMessageSource[];
  attachments?: DBAttachment[];
  model?: string;
  tokenUsage?: { input: number; output: number };
  cost?: number;
  edited?: boolean;
  editedAt?: number;
  images?: string[];
  // [Roy v10 PM-22] AI 생성 이미지 영구 보존 (D1Message.imageUrl과 동일).
  // Dexie schema에 인덱스 없이 임의 필드로 저장 가능 (migration 불필요).
  imageUrl?: string;
  imagePrompt?: string;
}

export interface DBMessageSource {
  sourceId: string;
  sourceTitle: string;
  sourceType: 'document' | 'meeting' | 'datasource-folder';
  chunkText: string;
  page?: number;
  similarity: number;
}

export interface DBAttachment {
  id: string;
  type: 'image' | 'audio' | 'video' | 'file';
  filename: string;
  mimeType: string;
  size: number;
  blob?: Blob;
  base64?: string;
}

export interface DBMeeting {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  audioFileName?: string;
  audioDuration?: number;
  attendees?: number;
  status: 'pending' | 'transcribing' | 'analyzing' | 'completed' | 'failed';
  errorMessage?: string;
  isActive?: boolean;
}

export interface DBMeetingTranscript {
  meetingId: string;
  text: string;
  language?: string;
  createdAt: number;
}

export interface DBMeetingSegment {
  id: string;
  meetingId: string;
  speaker: string;
  text: string;
  startTime?: number;
  endTime?: number;
}

export interface DBMeetingAnalysis {
  meetingId: string;
  summary?: { points: string[] };
  actionItems?: DBActionItem[];
  decisions?: string[];
  topics?: string[];
  fullSummary?: string;
  transcript?: { speaker?: string; text: string }[];
  createdAt: number;
}

export interface DBActionItem {
  text: string;
  assignee?: string;
  dueDate?: string;
  done?: boolean;
}

export interface DBDocument {
  id: string;
  filename: string;
  mimeType?: string;
  size?: number;
  uploadedAt: number;
  status: 'pending' | 'embedding' | 'ready' | 'failed';
  chunkCount: number;
  errorMessage?: string;
  isActive?: boolean;
}

export interface DBDocumentChunk {
  id: string;
  documentId: string;
  chunkIndex: number;
  text: string;
  embedding?: number[];
  page?: number;
  rowRange?: [number, number];
}

export interface DBDataSource {
  id: string;
  type: 'google-drive' | 'onedrive' | 'webdav' | 'local';
  serviceName: string;
  folderId?: string;
  folderName?: string;
  folderPath?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  connectedAt: number;
  lastSyncAt?: number;
  fileCount: number;
  isActive?: boolean;
}

export interface DBDataSourceChunk {
  id: string;
  dataSourceId: string;
  fileId: string;
  fileName: string;
  chunkIndex: number;
  text: string;
  embedding?: number[];
  page?: number;
}
