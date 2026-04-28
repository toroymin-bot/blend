/**
 * Auto Summarization — 옛 메시지 자동 요약 (Tori 18644993 PR #4).
 *
 * 채팅 세션이 RECENT_WINDOW(10)개를 초과하면, 그 이전 메시지들을 Haiku로
 * 요약. 이 요약을 augmentation-layer가 보강 prompt 생성 시 함께 전달하면
 * Bridge가 짧은 윈도우 너머의 컨텍스트(예: 30분 전 묘사)도 살릴 수 있음.
 *
 * 캐시 정책:
 *   - 키: sessionId + 메시지 ID 범위 (start...end)
 *   - 입력 메시지 셋이 동일하면 재사용 (sliding window는 확장 시에만 새로 생성)
 *   - 인메모리 (TTL 6시간 — Haiku 호출 비용 절감 vs 재요약 정확도 trade-off)
 */

import type { BridgeMessage } from './context-bridge';

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const SUMMARY_MAX_TOKENS = 300;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6시간

interface CachedSummary {
  text: string;
  range: [string, string]; // [firstMsgId, lastMsgId]
  timestamp: number;
}

const cache = new Map<string, CachedSummary>();

function buildCacheKey(sessionId: string, oldMessages: BridgeMessage[]): string {
  const ids = oldMessages
    .map((m) => (m as unknown as { id?: string }).id ?? '')
    .filter(Boolean);
  if (ids.length === 0) return '';
  return `${sessionId}::${ids[0]}...${ids[ids.length - 1]}::${ids.length}`;
}

function formatContent(c: unknown): string {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c.map((p) => {
      if (typeof p === 'string') return p;
      const part = p as { type?: string; text?: string };
      if (part.type === 'text') return part.text ?? '';
      if (part.type === 'image_url') return '[image]';
      return '';
    }).join(' ');
  }
  return '';
}

async function callHaikuSummary(params: {
  apiKey: string;
  conversationText: string;
  lang: 'ko' | 'en';
  signal?: AbortSignal;
}): Promise<string> {
  const system = params.lang === 'ko'
    ? `다음 대화를 2-3문장으로 한국어로 요약하세요.
초점:
- 다뤄진 주제
- 핵심 결정사항
- 추후 다시 참조될 가능성이 있는 묘사·이름·숫자

요약문만 출력. 다른 설명·접두사 없이.`
    : `Summarize the following conversation in 2-3 sentences in English.
Focus on:
- Subjects discussed
- Key decisions
- References (descriptions, names, numbers) that may be needed later

Output the summary only — no preamble.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': params.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: SUMMARY_MAX_TOKENS,
      system,
      messages: [{ role: 'user', content: params.conversationText }],
    }),
    signal: params.signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: { message?: string } })?.error?.message ??
      `Haiku summary error: ${res.status}`
    );
  }

  const data = await res.json() as { content?: Array<{ text?: string }> };
  return (data.content?.[0]?.text ?? '').trim();
}

/**
 * 옛 메시지 요약 (캐시 확인 후 Haiku 호출).
 * sessionId 모르면 빈 문자열 사용 가능 — 단, 캐시 key 충돌 가능성.
 *
 * 호출 실패 시 throw — caller가 catch에서 augmentation 호출 시 olderSummary
 * 없이 진행 (recent 10개만으로 보강).
 */
export async function getOrCreateOlderSummary(
  oldMessages: BridgeMessage[],
  sessionId: string,
  lang: 'ko' | 'en',
  apiKey: string,
  signal?: AbortSignal,
): Promise<string> {
  if (!oldMessages.length) return '';
  if (!apiKey) return '';

  const key = buildCacheKey(sessionId, oldMessages);
  if (key) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.text;
    }
  }

  const conversation = oldMessages
    .map((m) => `${m.role}: ${formatContent((m as unknown as { content: unknown }).content)}`)
    .join('\n');

  const summary = await callHaikuSummary({
    apiKey,
    conversationText: conversation,
    lang,
    signal,
  });

  if (key && summary) {
    const ids = oldMessages.map((m) => (m as unknown as { id?: string }).id ?? '');
    cache.set(key, {
      text: summary,
      range: [ids[0] ?? '', ids[ids.length - 1] ?? ''],
      timestamp: Date.now(),
    });
  }

  return summary;
}

/** 디버깅·테스트용. */
export function _clearOlderSummaryCache(): void {
  cache.clear();
}

export const RECENT_WINDOW_FOR_SUMMARY = 10;
