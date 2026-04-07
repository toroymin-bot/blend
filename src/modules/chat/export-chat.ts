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

export function downloadChatAsPDF(chat: Chat) {
  const safeTitle = chat.title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const dateStr = new Date(chat.createdAt).toLocaleString('ko-KR');

  const messagesHtml = chat.messages.map((msg) => {
    const role = msg.role === 'user' ? '사용자' : 'AI';
    const time = new Date(msg.createdAt).toLocaleTimeString('ko-KR');
    const bgColor = msg.role === 'user' ? '#dbeafe' : '#f3f4f6';
    const align = msg.role === 'user' ? 'right' : 'left';
    const safeContent = msg.content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
    const costInfo = msg.cost !== undefined
      ? `<div style="font-size:10px;color:#6b7280;margin-top:4px;">${msg.model} · $${msg.cost.toFixed(4)}</div>`
      : '';
    return `
      <div style="margin-bottom:16px;text-align:${align};">
        <div style="display:inline-block;max-width:80%;background:${bgColor};border-radius:12px;padding:10px 14px;text-align:left;">
          <div style="font-size:11px;color:#6b7280;margin-bottom:4px;font-weight:600;">${role} · ${time}</div>
          <div style="font-size:13px;color:#111827;line-height:1.6;">${safeContent}</div>
          ${costInfo}
        </div>
      </div>
    `;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>${safeTitle}</title>
  <style>
    @media print {
      body { margin: 0; }
      .no-print { display: none; }
    }
    body {
      font-family: -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
      background: #fff;
      color: #111;
      padding: 32px;
      max-width: 800px;
      margin: 0 auto;
    }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .meta { font-size: 12px; color: #6b7280; margin-bottom: 24px; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin-bottom: 24px; }
    .print-btn {
      display: inline-block;
      margin-bottom: 20px;
      padding: 8px 20px;
      background: #2563eb;
      color: #fff;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">PDF로 저장 (인쇄)</button>
  <h1>${safeTitle}</h1>
  <div class="meta">모델: ${chat.model} · 날짜: ${dateStr} · 메시지: ${chat.messages.length}개</div>
  <hr>
  ${messagesHtml}
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (win) {
    win.onload = () => {
      setTimeout(() => win.print(), 300);
    };
  }
  setTimeout(() => URL.revokeObjectURL(url), 10000);
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
