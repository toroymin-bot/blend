// Blend - Chat API Module (Reusable: any project calling LLM APIs)
// Handles streaming responses from OpenAI, Anthropic, Google

import { AIProvider } from '@/types';

// Multimodal content: either plain text or an array of text/image parts
export interface MultimodalPart {
  type: 'text' | 'image_url';
  text?: string;
  url?: string; // base64 data URL  e.g. "data:image/jpeg;base64,..."
}

export type MessageContent = string | MultimodalPart[];

export interface ChatRequestMessage {
  role: string;
  content: MessageContent;
}

interface ChatRequest {
  messages: ChatRequestMessage[];
  model: string;
  provider: AIProvider;
  apiKey: string;
  baseUrl?: string;  // custom OpenAI-compatible endpoint
  stream?: boolean;
  onChunk?: (text: string) => void;
  onDone?: (fullText: string, usage?: { input: number; output: number }) => void;
  onError?: (error: string) => void;
  signal?: AbortSignal;
}

// ── Helpers to convert internal format to provider-specific format ────────────

/** Convert our MessageContent to OpenAI content (string | array) */
function toOpenAIContent(content: MessageContent): string | object[] {
  if (typeof content === 'string') return content;
  return content.map((part) => {
    if (part.type === 'text') return { type: 'text', text: part.text ?? '' };
    // image_url
    return { type: 'image_url', image_url: { url: part.url ?? '', detail: 'auto' } };
  });
}

/** Convert our MessageContent to Anthropic content blocks */
function toAnthropicContent(content: MessageContent): string | object[] {
  if (typeof content === 'string') return content;
  return content.map((part) => {
    if (part.type === 'text') return { type: 'text', text: part.text ?? '' };
    // Parse "data:<mediaType>;base64,<data>"
    const url = part.url ?? '';
    const match = url.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      return { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } };
    }
    return { type: 'text', text: '[image not supported]' };
  });
}

/** Convert our MessageContent to Google parts array */
function toGoogleParts(content: MessageContent): object[] {
  if (typeof content === 'string') return [{ text: content }];
  return content.map((part) => {
    if (part.type === 'text') return { text: part.text ?? '' };
    const url = part.url ?? '';
    const match = url.match(/^data:([^;]+);base64,(.+)$/);
    if (match) return { inlineData: { mimeType: match[1], data: match[2] } };
    return { text: '[image not supported]' };
  });
}

const ENDPOINTS: Record<AIProvider, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  google: '', // constructed dynamically
  custom: '',
};

export async function sendChatRequest(req: ChatRequest) {
  const { messages, model, provider, apiKey, baseUrl, stream = true, onChunk, onDone, onError, signal } = req;

  try {
    if (provider === 'openai') {
      await handleOpenAI(messages, model, apiKey, stream, onChunk, onDone, signal);
    } else if (provider === 'anthropic') {
      await handleAnthropic(messages, model, apiKey, stream, onChunk, onDone, signal);
    } else if (provider === 'google') {
      await handleGoogle(messages, model, apiKey, stream, onChunk, onDone, signal);
    } else if (provider === 'custom' && baseUrl) {
      await handleCustom(messages, model, apiKey, baseUrl, stream, onChunk, onDone, signal);
    }
  } catch (e: any) {
    if (e.name === 'AbortError') return;
    onError?.(e.message || 'Unknown error');
  }
}

async function handleOpenAI(
  messages: ChatRequestMessage[],
  model: string,
  apiKey: string,
  stream: boolean,
  onChunk?: (text: string) => void,
  onDone?: (fullText: string, usage?: { input: number; output: number }) => void,
  signal?: AbortSignal
) {
  const res = await fetch(ENDPOINTS.openai, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: messages.map((m) => ({ role: m.role, content: toOpenAIContent(m.content) })),
      stream,
      stream_options: stream ? { include_usage: true } : undefined,
    }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI API error: ${res.status}`);
  }

  if (stream && res.body) {
    let fullText = '';
    let usage: { input: number; output: number } | undefined;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let lineBuffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      lineBuffer += decoder.decode(value, { stream: true });
      const parts = lineBuffer.split('\n');
      lineBuffer = parts.pop() ?? '';

      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content;
          if (content) {
            fullText += content;
            onChunk?.(content);
          }
          if (json.usage) {
            usage = { input: json.usage.prompt_tokens, output: json.usage.completion_tokens };
          }
        } catch {}
      }
    }
    onDone?.(fullText, usage);
  } else {
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content || '';
    const usage = json.usage ? { input: json.usage.prompt_tokens, output: json.usage.completion_tokens } : undefined;
    onDone?.(content, usage);
  }
}

async function handleAnthropic(
  messages: ChatRequestMessage[],
  model: string,
  apiKey: string,
  stream: boolean,
  onChunk?: (text: string) => void,
  onDone?: (fullText: string, usage?: { input: number; output: number }) => void,
  signal?: AbortSignal
) {
  const systemMsg = messages.find((m) => m.role === 'system');
  const userMsgs = messages.filter((m) => m.role !== 'system');

  const res = await fetch(ENDPOINTS.anthropic, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemMsg ? (typeof systemMsg.content === 'string' ? systemMsg.content : undefined) : undefined,
      messages: userMsgs.map((m) => ({ role: m.role, content: toAnthropicContent(m.content) })),
      stream,
    }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic API error: ${res.status}`);
  }

  if (stream && res.body) {
    let fullText = '';
    let usage: { input: number; output: number } | undefined;
    // inputUsage is provided on message_start; output on message_delta
    let inputTokens = 0;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    // Buffer to handle chunks that don't end on a newline boundary
    let lineBuffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Append decoded bytes to buffer; keep stream: true so multi-byte chars are handled
      lineBuffer += decoder.decode(value, { stream: true });

      // Process all complete lines (split on \n, keep remainder in buffer)
      const parts = lineBuffer.split('\n');
      lineBuffer = parts.pop() ?? ''; // last element may be incomplete

      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        // Anthropic does not send [DONE] but guard anyway
        if (data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          // message_start carries input token count
          if (json.type === 'message_start' && json.message?.usage) {
            inputTokens = json.message.usage.input_tokens ?? 0;
          }
          // content_block_delta carries text deltas
          if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta' && json.delta?.text) {
            fullText += json.delta.text;
            onChunk?.(json.delta.text);
          }
          // message_delta carries output token count
          if (json.type === 'message_delta' && json.usage) {
            usage = {
              input: inputTokens || json.usage.input_tokens || 0,
              output: json.usage.output_tokens || 0,
            };
          }
        } catch {
          // Silently skip malformed JSON chunks
        }
      }
    }
    // Flush any remaining buffer content (shouldn't normally have a data line here)
    onDone?.(fullText, usage);
  } else {
    const json = await res.json();
    const content = json.content?.[0]?.text || '';
    const usage = json.usage ? { input: json.usage.input_tokens, output: json.usage.output_tokens } : undefined;
    onDone?.(content, usage);
  }
}

async function handleGoogle(
  messages: ChatRequestMessage[],
  model: string,
  apiKey: string,
  stream: boolean,
  onChunk?: (text: string) => void,
  onDone?: (fullText: string, usage?: { input: number; output: number }) => void,
  signal?: AbortSignal
) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${stream ? 'streamGenerateContent' : 'generateContent'}?key=${apiKey}${stream ? '&alt=sse' : ''}`;

  const systemMsg = messages.find((m) => m.role === 'system');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: toGoogleParts(m.content),
    }));

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      systemInstruction: systemMsg ? { parts: [{ text: typeof systemMsg.content === 'string' ? systemMsg.content : '' }] } : undefined,
    }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Google API error: ${res.status}`);
  }

  if (stream && res.body) {
    let fullText = '';
    let usage: { input: number; output: number } | undefined;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let lineBuffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      lineBuffer += decoder.decode(value, { stream: true });
      const parts = lineBuffer.split('\n');
      lineBuffer = parts.pop() ?? '';

      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        try {
          const json = JSON.parse(trimmed.slice(6));
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            fullText += text;
            onChunk?.(text);
          }
          // Collect usage from each chunk (last one wins)
          if (json.usageMetadata) {
            usage = {
              input: json.usageMetadata.promptTokenCount ?? 0,
              output: json.usageMetadata.candidatesTokenCount ?? 0,
            };
          }
        } catch {}
      }
    }
    onDone?.(fullText, usage);
  } else {
    const json = await res.json();
    const content = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const usage = json.usageMetadata
      ? { input: json.usageMetadata.promptTokenCount ?? 0, output: json.usageMetadata.candidatesTokenCount ?? 0 }
      : undefined;
    onDone?.(content, usage);
  }
}

// ── Custom / OpenAI-compatible endpoint (Ollama, OpenRouter, LM Studio…) ─────
async function handleCustom(
  messages: ChatRequestMessage[],
  model: string,
  apiKey: string,
  baseUrl: string,
  stream: boolean,
  onChunk?: (text: string) => void,
  onDone?: (fullText: string, usage?: { input: number; output: number }) => void,
  signal?: AbortSignal
) {
  // Normalise base URL: strip trailing slash, ensure /chat/completions path
  const base = baseUrl.replace(/\/+$/, '');
  const endpoint = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: messages.map((m) => ({ role: m.role, content: toOpenAIContent(m.content) })),
      stream,
      stream_options: stream ? { include_usage: true } : undefined,
    }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Custom API error: ${res.status}`);
  }

  if (stream && res.body) {
    let fullText = '';
    let usage: { input: number; output: number } | undefined;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let lineBuffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      lineBuffer += decoder.decode(value, { stream: true });
      const parts = lineBuffer.split('\n');
      lineBuffer = parts.pop() ?? '';
      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content;
          if (content) { fullText += content; onChunk?.(content); }
          if (json.usage) usage = { input: json.usage.prompt_tokens, output: json.usage.completion_tokens };
        } catch {}
      }
    }
    onDone?.(fullText, usage);
  } else {
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content || '';
    const usage = json.usage ? { input: json.usage.prompt_tokens, output: json.usage.completion_tokens } : undefined;
    onDone?.(content, usage);
  }
}
