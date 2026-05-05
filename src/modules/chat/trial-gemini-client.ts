/**
 * Gemini 2.0 Flash direct client — uses NEXT_PUBLIC trial key.
 * Called only when user has no API keys AND selected model is gemini-2.0-flash
 * AND trial count not exhausted.
 *
 * Security note: the trial key is exposed in the JS bundle. This is accepted
 * because it's a Google free-tier key with no payment method attached —
 * worst case is rate limit hit, no financial loss. If abuse becomes an issue,
 * rotate the key in Vercel env vars and rebuild.
 */

export const TRIAL_KEY_AVAILABLE = typeof process.env.NEXT_PUBLIC_BLEND_TRIAL_GEMINI_KEY === 'string'
  && process.env.NEXT_PUBLIC_BLEND_TRIAL_GEMINI_KEY.length > 0;

// [2026-05-02 Roy 핫픽스] 멀티모달 part 지원 — text + image_url(data URL).
// 이전엔 content: string only라 BYOK→trial 자동 fallback 시 사용자가 붙여넣은
// 이미지가 누락 ("어떤 텍스트?" 환각 응답). Gemini 2.5 Flash는 비전 지원이므로
// inlineData(base64)로 변환해 그대로 전달.
// chat-api.ts의 MultimodalPart와 호환 (optional text/url 형태) — 호출부에서 동일
// toApiContent helper 결과를 그대로 넘길 수 있도록.
type TrialPart = { type: 'text' | 'image_url'; text?: string; url?: string };
type TrialContent = string | TrialPart[];

interface TrialMessage {
  role: 'user' | 'assistant' | 'system';
  content: TrialContent;
}

interface SendTrialMessageParams {
  messages: TrialMessage[];
  systemPrompt?: string;
  onChunk: (text: string) => void;
  onDone: (fullText: string) => void;
  onError: (err: Error) => void;
  signal?: AbortSignal;
  /** [2026-05-05 PM-44 Roy] usage-store records.chatId 트래킹용. */
  chatId?: string;
}

/** data URL → { mimeType, base64 } 분해. 'data:image/png;base64,iVBORw...' 형식. */
function parseDataUrl(url: string): { mimeType: string; data: string } | null {
  const match = url.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

/** TrialContent → Gemini parts[]. 문자열은 단일 text part, 멀티모달은 각 part 변환. */
function toGeminiParts(content: TrialContent): Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> {
  if (typeof content === 'string') return [{ text: content }];
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  for (const p of content) {
    if (p.type === 'text') {
      if (p.text) parts.push({ text: p.text });
    } else if (p.type === 'image_url' && p.url) {
      const parsed = parseDataUrl(p.url);
      if (parsed) parts.push({ inlineData: parsed });
      // data URL 외(예: http URL)는 trial Gemini가 fetch 불가 → skip.
    }
  }
  // Gemini는 빈 parts 거부 → 안전망
  if (parts.length === 0) parts.push({ text: '' });
  return parts;
}

export async function sendTrialMessage({
  messages,
  systemPrompt,
  onChunk,
  onDone,
  onError,
  signal,
  chatId,
}: SendTrialMessageParams): Promise<void> {
  const key = process.env.NEXT_PUBLIC_BLEND_TRIAL_GEMINI_KEY;
  if (!key) {
    onError(new Error('Trial unavailable'));
    return;
  }

  // Gemini format: contents array with user/model roles
  // System prompt goes into systemInstruction field (Gemini 1.5+ API)
  const contents = messages
    .filter((m) => m.role !== 'system') // system messages handled separately
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: toGeminiParts(m.content),
    }));

  const body: any = { contents };
  if (systemPrompt && systemPrompt.trim().length > 0) {
    body.systemInstruction = {
      parts: [{ text: systemPrompt }],
    };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${key}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      onError(new Error(`Gemini ${res.status}: ${errText.slice(0, 200)}`));
      return;
    }

    if (!res.body) {
      onError(new Error('No response body'));
      return;
    }

    // Parse SSE stream
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE format: lines starting with "data: "
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // keep incomplete last line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;

        try {
          const data = JSON.parse(jsonStr);
          const chunk = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (typeof chunk === 'string' && chunk.length > 0) {
            full += chunk;
            onChunk(chunk);
          }
        } catch {
          // ignore malformed JSON chunk
        }
      }
    }

    // [2026-05-05 PM-44 Roy] trial path도 records 자동 트래킹 추가 (chat-api와 동일 패턴).
    // 이전: trial 사용 시 records 누락 → dashboard heatmap/topModels 데이터 부족.
    // Gemini 2.5 Flash 가격 = $0 (free tier) → cost=0, token은 추정 (응답 글자수 기반).
    // 정확한 토큰 카운트는 Gemini 비-stream API에서만 제공 — stream에서는 추정 OK.
    try {
      if (typeof window !== 'undefined' && full.length > 0) {
        const estTokens = Math.max(1, Math.ceil(full.length / 4));
        // dynamic import — bundle 분리 + SSR 안전.
        const { useUsageStore } = await import('@/stores/usage-store');
        useUsageStore.getState().addRecord({
          timestamp: Date.now(),
          model: 'gemini-2.5-flash',
          provider: 'google',
          inputTokens: 0, // user 메시지 토큰은 stream에서 미제공
          outputTokens: estTokens,
          cost: 0, // Gemini Flash free tier
          chatId: chatId ?? 'trial-unknown',
        });
      }
    } catch { /* 추적 실패는 본 응답 흐름 막지 않음 */ }

    onDone(full);
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      onDone(''); // aborted, treat as clean done
      return;
    }
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}
