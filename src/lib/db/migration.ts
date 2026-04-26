// Blend IndexedDB 마이그레이션 헬퍼 (Tori 명세)
// 사용자 0명 단계라 옛 데이터는 거의 없음. 패턴은 미래 사용자용으로 보존.

import { getDB } from './blend-db';
import type { DBChat, DBMessage, DBMeeting, DBMeetingAnalysis } from '@/types/db';

const MIGRATION_VERSION_KEY = 'blend:db-migration-version';
const CURRENT_MIGRATION_VERSION = 1;

export async function runMigrations(): Promise<void> {
  if (typeof window === 'undefined') return;

  const currentVersion = parseInt(
    localStorage.getItem(MIGRATION_VERSION_KEY) || '0',
    10
  );
  if (currentVersion >= CURRENT_MIGRATION_VERSION) return;

  if (currentVersion < 1) {
    try {
      await migrateD1ChatsFromLocalStorage();
      await migrateD1MeetingsFromLocalStorage();
    } catch (e) {
      console.error('[blend:migration] failed', e);
      return; // version 미증가 — 다음 진입에서 재시도
    }
    localStorage.setItem(MIGRATION_VERSION_KEY, '1');
  }
}

// d1:chats (PR #9 P3.1 형식: pinned/tags/folder/forkedFrom 보존)
async function migrateD1ChatsFromLocalStorage(): Promise<void> {
  const oldKey = 'd1:chats';
  const raw = localStorage.getItem(oldKey);
  if (!raw) return;

  let payload: { version?: number; chats?: unknown };
  try { payload = JSON.parse(raw); } catch { return; }
  const oldChats = Array.isArray(payload?.chats) ? (payload.chats as Array<Record<string, unknown>>) : [];
  if (oldChats.length === 0) return;

  const db = getDB();
  await db.transaction('rw', db.chats, db.messages, async () => {
    for (const oldChat of oldChats) {
      const id = String(oldChat.id || crypto.randomUUID());
      const messages = Array.isArray(oldChat.messages) ? (oldChat.messages as Array<Record<string, unknown>>) : [];
      const meta: DBChat = {
        id,
        title: String(oldChat.title || ''),
        model: String(oldChat.model || 'auto'),
        provider: 'unknown',
        createdAt: Number(oldChat.createdAt || Date.now()),
        updatedAt: Number(oldChat.updatedAt || Date.now()),
        pinned: Boolean(oldChat.pinned),
        tags: Array.isArray(oldChat.tags) ? (oldChat.tags as string[]) : undefined,
        folderId: typeof oldChat.folder === 'string' ? oldChat.folder : undefined,
        forkedFrom: typeof oldChat.forkedFrom === 'string' ? oldChat.forkedFrom : undefined,
      };
      await db.chats.put(meta);
      if (messages.length > 0) {
        const dbMsgs: DBMessage[] = messages.map((m, idx) => ({
          id: String(m.id || `${id}-msg-${idx}`),
          chatId: id,
          role: (m.role as 'user' | 'assistant' | 'system') || 'user',
          content: String(m.content || ''),
          createdAt: Number(m.createdAt || meta.createdAt + idx),
          model: typeof m.modelUsed === 'string' ? m.modelUsed : undefined,
          images: Array.isArray(m.images) ? (m.images as string[]) : undefined,
        }));
        await db.messages.bulkPut(dbMsgs);
      }
    }
  });

  localStorage.setItem(`${oldKey}:backup`, raw);
  localStorage.removeItem(oldKey);
  console.log(`[blend:migration] migrated ${oldChats.length} chats to IndexedDB`);
}

// d1:meetings (Phase 3b 활성 + 분석 결과)
async function migrateD1MeetingsFromLocalStorage(): Promise<void> {
  const oldKey = 'd1:meetings';
  const raw = localStorage.getItem(oldKey);
  if (!raw) return;

  let oldMeetings: Array<Record<string, unknown>>;
  try { oldMeetings = JSON.parse(raw); } catch { return; }
  if (!Array.isArray(oldMeetings) || oldMeetings.length === 0) return;

  const db = getDB();
  await db.transaction('rw', db.meetings, db.meetingAnalyses, async () => {
    for (const m of oldMeetings) {
      const id = String(m.id || crypto.randomUUID());
      const meta: DBMeeting = {
        id,
        title: String(m.title || ''),
        createdAt: Number(m.createdAt || Date.now()),
        updatedAt: Number(m.createdAt || Date.now()),
        status: 'completed',
        attendees: typeof m.participants === 'number' ? (m.participants as number) : undefined,
        isActive: m.isActive !== false,
      };
      const analysis: DBMeetingAnalysis = {
        meetingId: id,
        summary: Array.isArray(m.summary) ? { points: m.summary as string[] } : undefined,
        actionItems: Array.isArray(m.actionItems)
          ? (m.actionItems as Array<{ task: string; owner?: string; dueDate?: string; done?: boolean }>).map((a) => ({
              text: a.task,
              assignee: a.owner,
              dueDate: a.dueDate,
              done: a.done,
            }))
          : undefined,
        decisions: Array.isArray(m.decisions) ? (m.decisions as string[]) : undefined,
        topics: Array.isArray(m.topics) ? (m.topics as string[]) : undefined,
        fullSummary: typeof m.fullSummary === 'string' ? (m.fullSummary as string) : undefined,
        createdAt: meta.createdAt,
      };
      await db.meetings.put(meta);
      await db.meetingAnalyses.put(analysis);
    }
  });

  localStorage.setItem(`${oldKey}:backup`, raw);
  localStorage.removeItem(oldKey);
  console.log(`[blend:migration] migrated ${oldMeetings.length} meetings to IndexedDB`);
}
