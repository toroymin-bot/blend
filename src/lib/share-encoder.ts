// Share Link encoder/decoder (Tori 16384367 §7, Option A — URL base64)
// pako.gzip + base64 URL-safe로 페이로드 인코딩.
// 한도: ~4000자까지 안정. 긴 대화는 KV 옵션으로 마이그레이션 (옵션 B 후속).

import pako from 'pako';

export interface ShareMessage {
  role: 'user' | 'assistant';
  content: string;
  model?: string;
}

export interface SharePayload {
  v: 1;                            // schema version
  createdAt: number;
  expiresAt?: number;              // unix ms. 영구는 undefined.
  messages: ShareMessage[];
  options: {
    responseOnly: boolean;
    includeSystemInfo: boolean;
  };
}

export type SharePolicy = '24h' | '7d' | 'forever';

export function makeExpiresAt(policy: SharePolicy, now: number = Date.now()): number | undefined {
  switch (policy) {
    case '24h':     return now + 24 * 60 * 60 * 1000;
    case '7d':      return now + 7 * 24 * 60 * 60 * 1000;
    case 'forever': return undefined;
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  // Uint8Array → base64 → URL-safe
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function encodeShare(payload: SharePayload): string {
  const json = JSON.stringify(payload);
  const compressed = pako.gzip(json);
  return bytesToBase64Url(compressed);
}

export function decodeShare(token: string): SharePayload | null {
  try {
    const bytes = base64UrlToBytes(token);
    const json = pako.ungzip(bytes, { to: 'string' });
    const parsed = JSON.parse(json) as SharePayload;
    if (parsed.v !== 1 || !Array.isArray(parsed.messages)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isExpired(payload: SharePayload, now: number = Date.now()): boolean {
  return typeof payload.expiresAt === 'number' && payload.expiresAt < now;
}

export function relativeTime(ts: number, lang: 'ko' | 'en', now: number = Date.now()): string {
  const sec = Math.max(0, Math.floor((now - ts) / 1000));
  if (sec < 60) return lang === 'ko' ? `${sec}초 전` : `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return lang === 'ko' ? `${min}분 전` : `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return lang === 'ko' ? `${hr}시간 전` : `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return lang === 'ko' ? `${day}일 전` : `${day}d ago`;
}
