// Telegram Bot 전송 유틸 (Tori 명세 v3 §6)

import type { Env } from '../types';

interface SendOptions {
  parseMode?: 'MarkdownV2' | 'HTML' | 'plain';
  disablePreview?: boolean;
}

export async function sendTelegramMessage(
  env: Env,
  text: string,
  opts: SendOptions = {},
): Promise<void> {
  const { parseMode = 'MarkdownV2', disablePreview = true } = opts;

  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is not set');
  }
  if (!env.TELEGRAM_CHAT_ID) {
    throw new Error('TELEGRAM_CHAT_ID is not set');
  }

  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body: Record<string, unknown> = {
    chat_id: env.TELEGRAM_CHAT_ID,
    text,
    disable_web_page_preview: disablePreview,
  };
  if (parseMode !== 'plain') body.parse_mode = parseMode;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text();
    // MarkdownV2 escape 누락 시 fallback: parse_mode 제거
    if (parseMode === 'MarkdownV2') {
      const fallback = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text,
          disable_web_page_preview: disablePreview,
        }),
      });
      if (fallback.ok) return;
    }
    throw new Error(`telegram ${res.status}: ${detail.slice(0, 300)}`);
  }
}
