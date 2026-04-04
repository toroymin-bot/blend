// Blend - Chat Export Module (Reusable: any chat app needing export)

import { Chat } from '@/types';

export function exportChatAsText(chat: Chat): string {
  const lines: string[] = [];
  lines.push(`# ${chat.title}`);
  lines.push(`모델: ${chat.model}`);
  lines.push(`날짜: ${new Date(chat.createdAt).toLocaleString('ko-KR')}`);
  lines.push('---');
  lines.push('');

  for (const msg of chat.messages) {
    const role = msg.role === 'user' ? '👤 사용자' : '🤖 AI';
    const time = new Date(msg.createdAt).toLocaleTimeString('ko-KR');
    lines.push(`### ${role} (${time})`);
    lines.push(msg.content);
    if (msg.cost !== undefined) {
      lines.push(`> 모델: ${msg.model} | 비용: $${msg.cost.toFixed(4)} | 토큰: ${msg.tokens?.input}+${msg.tokens?.output}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function exportChatAsMarkdown(chat: Chat): string {
  return exportChatAsText(chat);
}

export function downloadChat(chat: Chat, format: 'txt' | 'md' = 'md') {
  const content = exportChatAsText(chat);
  const ext = format;
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${chat.title.replace(/[^a-zA-Z0-9가-힣]/g, '_')}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportAllChatsAsJSON(chats: Chat[]) {
  const blob = new Blob([JSON.stringify(chats, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `blend-chats-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
