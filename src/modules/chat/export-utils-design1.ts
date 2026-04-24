/**
 * Export helpers for Design1 chats.
 *
 * D1Chat has a simpler shape than the main `Chat` type (no token/cost
 * tracking, no tags/folders). This module wraps the existing export-chat
 * utilities by adapting D1Chat → Chat, then delegating.
 */

import type { Chat, ChatMessage } from '@/types';
import type { D1Chat } from '@/stores/d1-chat-store';
import {
  downloadChat,
  downloadChatAsJSON,
  downloadChatAsPDF,
} from './export-chat';

export type D1ExportFormat = 'md' | 'txt' | 'json' | 'pdf';

/** Adapt D1Chat (simple) to Chat (legacy) for reusing export-chat.ts. */
function adaptToChat(chat: D1Chat): Chat {
  const messages: ChatMessage[] = chat.messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    model: m.modelUsed ?? chat.model,
    createdAt: m.createdAt,
  }));
  return {
    id: chat.id,
    title: chat.title || 'Blend Chat',
    messages,
    model: chat.model,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
  };
}

export function exportD1Chat(chat: D1Chat, format: D1ExportFormat) {
  const adapted = adaptToChat(chat);
  switch (format) {
    case 'md':
      downloadChat(adapted, 'md');
      return;
    case 'txt':
      downloadChat(adapted, 'txt');
      return;
    case 'json':
      downloadChatAsJSON(adapted);
      return;
    case 'pdf':
      downloadChatAsPDF(adapted);
      return;
  }
}
