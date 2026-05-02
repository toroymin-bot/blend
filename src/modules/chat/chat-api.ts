// Blend - Chat API Module (Reusable: any project calling LLM APIs)
// Handles streaming responses from OpenAI, Anthropic, Google

import { AIProvider } from '@/types';
import { executeAITool, toOpenAITools, toAnthropicTools, toGeminiFunctionDeclarations } from '@/lib/ai-tools';

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
  /** [2026-05-02 Roy] AI 도구 자동 사용 (시간/날씨/환율/계산기). default true.
   *  사용자가 별도 명령어 없이 "오늘 날씨 어때?" 묻기만 해도 모델이 자체 판단으로
   *  도구 호출. BYOK이라 추가 turn에 따른 LLM 비용은 사용자 부담.
   *  image-gen 모델 / embedding 모델 등 tool 미지원은 caller가 false로 명시. */
  enableTools?: boolean;
  /** Tool execution 진행 알림 — 'weather' 도구 사용 중 → UI indicator */
  onToolUse?: (toolName: string) => void;
}

/** Tool call recursion 한도 — 무한 루프 방지. 사용자 한 메시지에 도구 3번까지. */
const MAX_TOOL_TURNS = 3;

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
  deepseek: 'https://api.deepseek.com/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  custom: '',
};

/** Tool 사용 가능 여부 — image-gen, embedding, audio 등은 chat completion API X */
function supportsTools(provider: AIProvider, model: string): boolean {
  if (/image|embedding|tts|whisper|audio|imagen|veo|lyria/i.test(model)) return false;
  // OpenAI: gpt-3.5+, gpt-4*, gpt-5*, o1/o3 모두 tool 지원
  // Anthropic: Claude 3+ 모두 지원
  // Google: gemini 1.5+ / 2.x / 3.x 지원
  if (provider === 'google' && /^gemini-(1\.0|2\.0)/.test(model)) return false;
  return ['openai', 'anthropic', 'google', 'deepseek', 'groq'].includes(provider);
}

export async function sendChatRequest(req: ChatRequest) {
  const { messages, model, provider, apiKey, baseUrl, stream = true, onChunk, onDone, onError, signal, enableTools = true, onToolUse } = req;
  // [2026-05-02 Roy] enableTools=true (default) + 모델/provider가 지원하면 tool 활성.
  const useTools = enableTools && supportsTools(provider, model);

  try {
    if (provider === 'openai') {
      await handleOpenAI(messages, model, apiKey, stream, onChunk, onDone, signal, useTools, onToolUse);
    } else if (provider === 'anthropic') {
      await handleAnthropic(messages, model, apiKey, stream, onChunk, onDone, signal, useTools, onToolUse);
    } else if (provider === 'google') {
      await handleGoogle(messages, model, apiKey, stream, onChunk, onDone, signal, useTools, onToolUse);
    } else if (provider === 'deepseek') {
      await handleOpenAICompat(messages, model, apiKey, ENDPOINTS.deepseek, stream, onChunk, onDone, signal);
    } else if (provider === 'groq') {
      await handleOpenAICompat(messages, model, apiKey, ENDPOINTS.groq, stream, onChunk, onDone, signal);
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
  signal?: AbortSignal,
  useTools = false,
  onToolUse?: (toolName: string) => void,
  toolTurn = 0,
) {
  // [2026-05-02 Roy] tools 활성 시 OpenAI tools array 추가. tool_choice='auto'.
  // 모델이 호출 결정 시 tool_calls가 stream으로 옴 → 누적 → execute → 재 stream.
  const body: Record<string, unknown> = {
    model,
    // OpenAI는 'tool' role 메시지를 지원 — caller가 tool_call_id를 가진 메시지를
    // messages에 push했을 때도 그대로 통과.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: messages.map((m: any) => {
      // tool_calls가 있으면 그대로 전달 (assistant + tool_calls 형태)
      if (m.tool_calls) return { role: m.role, content: m.content, tool_calls: m.tool_calls };
      if (m.role === 'tool') return { role: 'tool', content: m.content, tool_call_id: m.tool_call_id };
      return { role: m.role, content: toOpenAIContent(m.content) };
    }),
    stream,
    stream_options: stream ? { include_usage: true } : undefined,
  };
  if (useTools && toolTurn < MAX_TOOL_TURNS) {
    body.tools = toOpenAITools();
    body.tool_choice = 'auto';
  }

  const res = await fetch(ENDPOINTS.openai, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI API error: ${res.status}`);
  }

  if (stream && res.body) {
    let fullText = '';
    let usage: { input: number; output: number } | undefined;
    let finishReason: string | undefined;
    // tool_calls 누적 — index별로 id/name/arguments delta를 merge.
    const toolCallsAccum: Array<{ id?: string; name?: string; arguments?: string }> = [];
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
          const choice = json.choices?.[0];
          const content = choice?.delta?.content;
          if (content) {
            fullText += content;
            onChunk?.(content);
          }
          // [2026-05-02 Roy] tool_calls delta merge — index별 id/name/arguments 누적.
          const tc = choice?.delta?.tool_calls;
          if (Array.isArray(tc)) {
            for (const t of tc) {
              const idx = t.index ?? 0;
              if (!toolCallsAccum[idx]) toolCallsAccum[idx] = {};
              if (t.id) toolCallsAccum[idx].id = t.id;
              if (t.function?.name) toolCallsAccum[idx].name = t.function.name;
              if (t.function?.arguments) {
                toolCallsAccum[idx].arguments = (toolCallsAccum[idx].arguments ?? '') + t.function.arguments;
              }
            }
          }
          if (choice?.finish_reason) finishReason = choice.finish_reason;
          if (json.usage) {
            usage = { input: json.usage.prompt_tokens, output: json.usage.completion_tokens };
          }
        } catch {}
      }
    }

    // tool_calls 처리 — execute → result 메시지 → 재 stream.
    if (finishReason === 'tool_calls' && toolCallsAccum.length > 0 && toolTurn < MAX_TOOL_TURNS) {
      const newMessages: ChatRequestMessage[] = [
        ...messages,
        // assistant turn with tool_calls
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { role: 'assistant', content: fullText || '', tool_calls: toolCallsAccum.map((t) => ({
          id: t.id,
          type: 'function',
          function: { name: t.name, arguments: t.arguments ?? '{}' },
        })) } as any,
      ];
      // 각 tool 실행 후 'tool' role 메시지로 result append
      for (const t of toolCallsAccum) {
        if (!t.name || !t.id) continue;
        onToolUse?.(t.name);
        let parsedArgs: Record<string, unknown> = {};
        try { parsedArgs = JSON.parse(t.arguments ?? '{}'); } catch {}
        const result = await executeAITool(t.name, parsedArgs);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        newMessages.push({ role: 'tool', tool_call_id: t.id, content: JSON.stringify(result) } as any);
      }
      // 재 stream — 이번 turn은 toolTurn+1
      return handleOpenAI(newMessages, model, apiKey, stream, onChunk, onDone, signal, useTools, onToolUse, toolTurn + 1);
    }

    onDone?.(fullText, usage);
  } else {
    const json = await res.json();
    const message = json.choices?.[0]?.message;
    const content = message?.content || '';
    const usage = json.usage ? { input: json.usage.prompt_tokens, output: json.usage.completion_tokens } : undefined;
    // non-stream tool_calls 처리
    if (useTools && Array.isArray(message?.tool_calls) && message.tool_calls.length > 0 && toolTurn < MAX_TOOL_TURNS) {
      const newMessages: ChatRequestMessage[] = [
        ...messages,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { role: 'assistant', content, tool_calls: message.tool_calls } as any,
      ];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const t of message.tool_calls as any[]) {
        onToolUse?.(t.function?.name);
        let parsedArgs: Record<string, unknown> = {};
        try { parsedArgs = JSON.parse(t.function?.arguments ?? '{}'); } catch {}
        const result = await executeAITool(t.function?.name, parsedArgs);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        newMessages.push({ role: 'tool', tool_call_id: t.id, content: JSON.stringify(result) } as any);
      }
      return handleOpenAI(newMessages, model, apiKey, stream, onChunk, onDone, signal, useTools, onToolUse, toolTurn + 1);
    }
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
  signal?: AbortSignal,
  // [2026-05-02 Roy] 시그니처 통일 — Anthropic tool 본격 처리는 다음 commit.
  // useTools/onToolUse 받아도 무시 (Anthropic SSE input_json_delta + tool_use
  // content_block 분기가 OpenAI 대비 복잡, 별도 sprint).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _useTools = false,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _onToolUse?: (toolName: string) => void,
) {
  void toAnthropicTools; // 다음 commit에서 사용 — import 보존
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
      // 2026-04-28: 4096 → 8192. 큰 첨부(번역/직역) 요청 시 4K 제한이 응답을
      // 잘라 사용자가 "요약했다"고 인식하던 회귀 차단. Claude Sonnet 4.6은 8K+
      // 출력 문제없이 처리.
      max_tokens: 8192,
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
  signal?: AbortSignal,
  // [2026-05-02 Roy] 시그니처 통일. Gemini는 tools array에 google_search OR
  // function_declarations 둘 중 하나만 — 동시 X. grounding 우선 유지, function
  // calling은 별도 commit에서 처리.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _useTools = false,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _onToolUse?: (toolName: string) => void,
) {
  void toGeminiFunctionDeclarations; // import 보존
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${stream ? 'streamGenerateContent' : 'generateContent'}?key=${apiKey}${stream ? '&alt=sse' : ''}`;

  const systemMsg = messages.find((m) => m.role === 'system');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: toGoogleParts(m.content),
    }));

  // Image-generation models need responseModalities to include IMAGE
  const isImageModel = /image/i.test(model);
  const generationConfig = isImageModel
    ? { responseModalities: ['TEXT', 'IMAGE'] }
    : undefined;

  // [2026-05-02 Roy] Gemini Grounding (Google Search) — 자연스러운 자동 검색.
  // 사용자가 '오늘 환율', '최신 뉴스', '어제 경기 결과' 같은 실시간 정보 물으면
  // Gemini가 자체 판단으로 Google 검색 → 답변 + 출처. 별도 메뉴/명령어 없이
  // chat에 자연 통합. 비용은 BYOK ($0.035/1k grounded responses, 사용자 부담).
  // Gemini 2.5+ 모델만 지원 — 다른 모델/이미지 모델은 비활성.
  const supportsGrounding =
    !isImageModel &&
    /^gemini-2\.5|^gemini-3/.test(model) &&
    !/embedding|tts|imagen|veo|lyria/i.test(model);
  const tools = supportsGrounding
    ? [{ google_search: {} }]
    : undefined;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      systemInstruction: systemMsg ? { parts: [{ text: typeof systemMsg.content === 'string' ? systemMsg.content : '' }] } : undefined,
      ...(generationConfig ? { generationConfig } : {}),
      ...(tools ? { tools } : {}),
    }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Google API error: ${res.status}`);
  }

  // Helper: extract text + inline images from Google parts array
  const extractGoogleParts = (partsArr: any[]): string => {
    let result = '';
    for (const part of partsArr) {
      if (part.text) {
        result += part.text;
      } else if (part.inlineData?.data && part.inlineData?.mimeType) {
        // Embed image as markdown so the chat renderer shows it
        result += `\n![generated image](data:${part.inlineData.mimeType};base64,${part.inlineData.data})\n`;
      }
    }
    return result;
  };

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
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        try {
          const json = JSON.parse(trimmed.slice(6));
          const partsArr = json.candidates?.[0]?.content?.parts;
          if (partsArr?.length) {
            const chunk = extractGoogleParts(partsArr);
            if (chunk) {
              fullText += chunk;
              onChunk?.(chunk);
            }
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
    const partsArr = json.candidates?.[0]?.content?.parts ?? [];
    const content = partsArr.length ? extractGoogleParts(partsArr) : '';
    const usage = json.usageMetadata
      ? { input: json.usageMetadata.promptTokenCount ?? 0, output: json.usageMetadata.candidatesTokenCount ?? 0 }
      : undefined;
    onDone?.(content, usage);
  }
}

// ── DeepSeek / Groq — OpenAI-compatible with fixed base URL ──────────────────
async function handleOpenAICompat(
  messages: ChatRequestMessage[],
  model: string,
  apiKey: string,
  endpoint: string,
  stream: boolean,
  onChunk?: (text: string) => void,
  onDone?: (fullText: string, usage?: { input: number; output: number }) => void,
  signal?: AbortSignal
) {
  const res = await fetch(endpoint, {
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
    throw new Error(err.error?.message || `API error: ${res.status}`);
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
