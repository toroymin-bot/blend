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

interface TrialMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface SendTrialMessageParams {
  messages: TrialMessage[];
  systemPrompt?: string;
  onChunk: (text: string) => void;
  onDone: (fullText: string) => void;
  onError: (err: Error) => void;
  signal?: AbortSignal;
}

export async function sendTrialMessage({
  messages,
  systemPrompt,
  onChunk,
  onDone,
  onError,
  signal,
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
      parts: [{ text: m.content }],
    }));

  const body: any = { contents };
  if (systemPrompt && systemPrompt.trim().length > 0) {
    body.systemInstruction = {
      parts: [{ text: systemPrompt }],
    };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-001:streamGenerateContent?alt=sse&key=${key}`;

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

    onDone(full);
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      onDone(''); // aborted, treat as clean done
      return;
    }
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}
