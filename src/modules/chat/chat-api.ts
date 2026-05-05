// Blend - Chat API Module (Reusable: any project calling LLM APIs)
// Handles streaming responses from OpenAI, Anthropic, Google

import { AIProvider } from '@/types';
import { executeAITool, toOpenAITools, toAnthropicTools, toGeminiFunctionDeclarations } from '@/lib/ai-tools';
import { trackUsage } from '@/lib/analytics';
import { calculateCost, getModelById } from '@/modules/models/model-registry';

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
  /** [2026-05-05 PM-44 Roy] 사용자 활성 대화 ID — usage-store records.chatId에 저장.
   *  이전엔 hardcoded 'chat'으로 모든 record 같은 chatId → dashboard 대화 카운트 항상 1.
   *  caller가 명시 전달 (chat-view = activeChatId, compare = 'compare', meeting = 'meeting'). */
  chatId?: string;
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toGoogleParts(content: MessageContent | any[]): object[] {
  if (typeof content === 'string') return [{ text: content }];
  // [2026-05-02 Roy] functionCall/functionResponse parts는 그대로 통과
  // (handleGoogle의 tool chain에서 caller가 push한 그대로 보낸다).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (content as any[]).map((part: any) => {
    if (part.functionCall) return { functionCall: part.functionCall };
    if (part.functionResponse) return { functionResponse: part.functionResponse };
    if (part.inlineData) return { inlineData: part.inlineData };
    if (part.type === 'text') return { text: part.text ?? '' };
    if (part.text) return { text: part.text };
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

// [2026-05-02 PM2 Roy] 한도 enforcement — 모든 AI 호출 직전 체크.
// d1:billing-limit (BillingView 설정) + useUsageStore.getTodayCost/getThisMonthCost
// 비교. autoStop=true && 초과 → throw (사용자에 친절한 메시지). notify80=true &&
// 80% 도달 → window event dispatch (cost-alert-toast가 수신).
async function enforceLimits(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem('d1:billing-limit');
    if (!raw) return;
    const limit = JSON.parse(raw) as {
      dailyUsd?: number;
      monthlyUsd?: number;
      notify80?: boolean;
      autoStop?: boolean;
    };
    const { useUsageStore } = await import('@/stores/usage-store');
    const today = useUsageStore.getState().getTodayCost();
    const month = useUsageStore.getState().getThisMonthCost();

    const dailyOver = (limit.dailyUsd ?? 0) > 0 && today >= limit.dailyUsd!;
    const monthlyOver = (limit.monthlyUsd ?? 0) > 0 && month >= limit.monthlyUsd!;

    if (limit.autoStop && (dailyOver || monthlyOver)) {
      // [2026-05-05 PM-30 Roy] 환율은 src/lib/currency.ts (xe.com 매월 1일 기준).
      const { getCurrentFxRates } = await import('@/lib/currency');
      const krwPerUsd = getCurrentFxRates().krwPerUsd;
      const which = dailyOver ? '일일' : '월간';
      const limitUsd = dailyOver ? limit.dailyUsd! : limit.monthlyUsd!;
      const usedUsd = dailyOver ? today : month;
      throw new Error(
        `🛑 ${which} 비용 한도(${
          `₩${Math.round(limitUsd * krwPerUsd).toLocaleString('ko-KR')}`
        }) 초과로 자동 정지 — 현재 ${
          `₩${Math.round(usedUsd * krwPerUsd).toLocaleString('ko-KR')}`
        } 사용. 설정 → 비용 관리에서 한도 조정 또는 자동 정지 끄기.`,
      );
    }

    if (limit.notify80) {
      const dailyPct = (limit.dailyUsd ?? 0) > 0 ? today / limit.dailyUsd! : 0;
      const monthlyPct = (limit.monthlyUsd ?? 0) > 0 ? month / limit.monthlyUsd! : 0;
      if (dailyPct >= 0.8 || monthlyPct >= 0.8) {
        window.dispatchEvent(new CustomEvent('blend:cost-alert', {
          detail: {
            used: dailyPct >= 0.8 ? today : month,
            limit: dailyPct >= 0.8 ? limit.dailyUsd : limit.monthlyUsd,
            paused: dailyPct >= 1 || monthlyPct >= 1,
            which: dailyPct >= 0.8 ? 'daily' : 'monthly',
          },
        }));
      }
    }
  } catch (e) {
    // 자동 정지로 throw된 경우만 caller에 전파, 그 외는 silent (한도 체크 실패가
    // 본 채팅 흐름을 막으면 안 됨).
    if (e instanceof Error && e.message.startsWith('🛑')) throw e;
  }
}

export async function sendChatRequest(req: ChatRequest) {
  const { messages, model, provider, apiKey, baseUrl, stream = true, onChunk, onDone, onError, signal, enableTools = true, onToolUse, chatId } = req;
  // [2026-05-02 Roy] enableTools=true (default) + 모델/provider가 지원하면 tool 활성.
  const useTools = enableTools && supportsTools(provider, model);

  // 한도 체크 — autoStop && 초과 시 throw → onError로 전달 → 사용자에 친절 안내
  try {
    await enforceLimits();
  } catch (e) {
    onError?.((e as Error).message);
    return;
  }

  // [2026-05-02 Roy] 모든 sendChatRequest 호출 자동 비용 추적 — onDone wrap.
  // 이전 회귀: 호출자(chat-view-design1, meeting-runner, model-compare 등)가
  // 각자 onDone에서 트래킹 코드 박아야 했음 → meeting/datasource는 추적 누락.
  // 한 곳에서 처리 → caller 코드 수정 없이 모든 경로 커버.
  // - usage 미제공(stream off, 일부 provider, abort 등) 또는 0 token 시 silent skip.
  // - cost는 model-registry pricing 기반. registry에 없는 모델이면 cost=0(token만).
  // [2026-05-02 PM2] localStorage `blend:usage`에도 addRecord 호출 — Billing
  // 화면 '아직 사용 기록이 없어요' 표시되던 회귀 차단. 한도 80%/100% 알림+
  // 자동정지 enforcement도 여기서 동작.
  const trackingOnDone: typeof onDone = (fullText, usage) => {
    try {
      if (usage && (usage.input > 0 || usage.output > 0)) {
        const m = getModelById(model);
        const cost = m ? calculateCost(m, usage.input, usage.output) : 0;
        // 1) Cloudflare counter (Telegram 비즈니스 리포트용)
        trackUsage({
          provider,
          model,
          inputTokens: usage.input,
          outputTokens: usage.output,
          cost,
        });
        // 2) localStorage usage-store (앱 내부 Billing 화면용 + 한도 enforcement)
        if (typeof window !== 'undefined') {
          import('@/stores/usage-store').then(({ useUsageStore }) => {
            useUsageStore.getState().addRecord({
              timestamp: Date.now(),
              model,
              provider,
              inputTokens: usage.input,
              outputTokens: usage.output,
              cost,
              // [2026-05-05 PM-44 Roy] caller chatId 우선 — dashboard 대화 카운트 정확.
              // 미전달 시 'unknown' (hardcoded 'chat' 회귀 차단 — 모든 record 같은 chatId로
              // 들어가던 버그).
              chatId: chatId ?? 'unknown',
            });
            // 한도 enforcement는 enforceLimits()가 다음 호출 직전 체크 (이건 사후 기록)
          }).catch(() => {});
        }
      }
    } catch {
      // 추적 실패는 본 응답 흐름 절대 막지 않음
    }
    onDone?.(fullText, usage);
  };

  try {
    if (provider === 'openai') {
      await handleOpenAI(messages, model, apiKey, stream, onChunk, trackingOnDone, signal, useTools, onToolUse);
    } else if (provider === 'anthropic') {
      await handleAnthropic(messages, model, apiKey, stream, onChunk, trackingOnDone, signal, useTools, onToolUse);
    } else if (provider === 'google') {
      await handleGoogle(messages, model, apiKey, stream, onChunk, trackingOnDone, signal, useTools, onToolUse);
    } else if (provider === 'deepseek') {
      await handleOpenAICompat(messages, model, apiKey, ENDPOINTS.deepseek, stream, onChunk, trackingOnDone, signal);
    } else if (provider === 'groq') {
      await handleOpenAICompat(messages, model, apiKey, ENDPOINTS.groq, stream, onChunk, trackingOnDone, signal);
    } else if (provider === 'custom' && baseUrl) {
      await handleCustom(messages, model, apiKey, baseUrl, stream, onChunk, trackingOnDone, signal);
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
  useTools = false,
  onToolUse?: (toolName: string) => void,
  toolTurn = 0,
) {
  const systemMsg = messages.find((m) => m.role === 'system');
  const userMsgs = messages.filter((m) => m.role !== 'system');

  const body: Record<string, unknown> = {
    model,
    // 2026-04-28: 4096 → 8192. 큰 첨부(번역/직역) 요청 시 4K 제한이 응답을
    // 잘라 사용자가 "요약했다"고 인식하던 회귀 차단. Claude Sonnet 4.6은 8K+
    // 출력 문제없이 처리.
    max_tokens: 8192,
    system: systemMsg ? (typeof systemMsg.content === 'string' ? systemMsg.content : undefined) : undefined,
    // [2026-05-02 Roy] tool_result 메시지 통과 — userMsgs에 caller가 추가한
    // tool_use/tool_result content blocks를 그대로 전달.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: userMsgs.map((m: any) => {
      if (Array.isArray(m.content) && m.content.length > 0 && (m.content[0].type === 'tool_use' || m.content[0].type === 'tool_result')) {
        return { role: m.role, content: m.content };
      }
      return { role: m.role, content: toAnthropicContent(m.content) };
    }),
    stream,
  };
  if (useTools && toolTurn < MAX_TOOL_TURNS) {
    body.tools = toAnthropicTools();
  }

  const res = await fetch(ENDPOINTS.anthropic, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic API error: ${res.status}`);
  }

  if (stream && res.body) {
    let fullText = '';
    let usage: { input: number; output: number } | undefined;
    let inputTokens = 0;
    let stopReason: string | undefined;
    // [2026-05-02 Roy] Anthropic content_block 누적 — index별 type/id/name/input(json).
    // text block은 fullText로, tool_use block은 별도 처리.
    const blocks: Array<{ type?: string; id?: string; name?: string; jsonAccum?: string; text?: string }> = [];
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
          if (json.type === 'message_start' && json.message?.usage) {
            inputTokens = json.message.usage.input_tokens ?? 0;
          }
          if (json.type === 'content_block_start') {
            const idx = json.index ?? 0;
            const cb = json.content_block ?? {};
            blocks[idx] = { type: cb.type, id: cb.id, name: cb.name, jsonAccum: '', text: '' };
          }
          if (json.type === 'content_block_delta') {
            const idx = json.index ?? 0;
            const block = blocks[idx];
            if (!block) continue;
            if (json.delta?.type === 'text_delta' && json.delta?.text) {
              fullText += json.delta.text;
              block.text = (block.text ?? '') + json.delta.text;
              onChunk?.(json.delta.text);
            }
            if (json.delta?.type === 'input_json_delta' && typeof json.delta?.partial_json === 'string') {
              block.jsonAccum = (block.jsonAccum ?? '') + json.delta.partial_json;
            }
          }
          if (json.type === 'message_delta') {
            if (json.delta?.stop_reason) stopReason = json.delta.stop_reason;
            if (json.usage) {
              usage = {
                input: inputTokens || json.usage.input_tokens || 0,
                output: json.usage.output_tokens || 0,
              };
            }
          }
        } catch {}
      }
    }

    // tool_use blocks 처리 — execute → tool_result content append → 재 stream
    const toolUseBlocks = blocks.filter((b) => b?.type === 'tool_use');
    if (stopReason === 'tool_use' && toolUseBlocks.length > 0 && toolTurn < MAX_TOOL_TURNS) {
      // assistant turn (text + tool_use blocks)
      const assistantContent = blocks.filter(Boolean).map((b) => {
        if (b!.type === 'text') return { type: 'text', text: b!.text ?? '' };
        if (b!.type === 'tool_use') {
          let parsedInput: Record<string, unknown> = {};
          try { parsedInput = JSON.parse(b!.jsonAccum ?? '{}'); } catch {}
          return { type: 'tool_use', id: b!.id, name: b!.name, input: parsedInput };
        }
        return null;
      }).filter(Boolean);

      // tool_result 메시지 — Anthropic은 user role에 tool_result content block로 전달
      const toolResultBlocks: Array<{ type: string; tool_use_id: string; content: string }> = [];
      for (const b of toolUseBlocks) {
        if (!b!.id || !b!.name) continue;
        onToolUse?.(b!.name);
        let parsedInput: Record<string, unknown> = {};
        try { parsedInput = JSON.parse(b!.jsonAccum ?? '{}'); } catch {}
        const result = await executeAITool(b!.name, parsedInput);
        toolResultBlocks.push({ type: 'tool_result', tool_use_id: b!.id, content: JSON.stringify(result) });
      }

      const newMessages: ChatRequestMessage[] = [
        ...messages,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { role: 'assistant', content: assistantContent as any },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { role: 'user', content: toolResultBlocks as any },
      ];
      return handleAnthropic(newMessages, model, apiKey, stream, onChunk, onDone, signal, useTools, onToolUse, toolTurn + 1);
    }

    onDone?.(fullText, usage);
  } else {
    const json = await res.json();
    const contentBlocks = json.content ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const textBlocks = contentBlocks.filter((b: any) => b.type === 'text');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolBlocks = contentBlocks.filter((b: any) => b.type === 'tool_use');
    const text = textBlocks.map((b: { text?: string }) => b.text ?? '').join('');
    const usage = json.usage ? { input: json.usage.input_tokens, output: json.usage.output_tokens } : undefined;
    if (json.stop_reason === 'tool_use' && toolBlocks.length > 0 && toolTurn < MAX_TOOL_TURNS) {
      const toolResultBlocks: Array<{ type: string; tool_use_id: string; content: string }> = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const b of toolBlocks as any[]) {
        onToolUse?.(b.name);
        const result = await executeAITool(b.name, b.input ?? {});
        toolResultBlocks.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(result) });
      }
      const newMessages: ChatRequestMessage[] = [
        ...messages,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { role: 'assistant', content: contentBlocks as any },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { role: 'user', content: toolResultBlocks as any },
      ];
      return handleAnthropic(newMessages, model, apiKey, stream, onChunk, onDone, signal, useTools, onToolUse, toolTurn + 1);
    }
    onDone?.(text, usage);
  }
}

/** 마지막 user 메시지에서 도구 키워드 감지 — function 우선 시그널 */
function detectGeminiToolIntent(messages: ChatRequestMessage[]): boolean {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUser) return false;
  const text = typeof lastUser.content === 'string'
    ? lastUser.content
    : lastUser.content.map((p) => p.text ?? '').join(' ');
  // 명확한 도구 트리거 키워드 (한국어/영어). function calling이 더 적절한 경우.
  return /환율|얼마|원화|달러|위안|엔화|파운드|유로|exchange.*rate|currency|convert|날씨|기온|비.*와|미세먼지|weather|temperature|forecast|계산|complete.*calc|=|복리|이자|평방|sqrt|pow|지금.*몇.*시|몇 시|현재.*시간|현재.*시각|시간.*뭐|시간.*몇|today.*date|current.*time|time.*now/i.test(text);
}

async function handleGoogle(
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

  // [2026-05-02 Roy] Gemini는 tools array에 google_search OR function_declarations
  // 둘 중 하나만 — 동시 X. user message 분석해 분기:
  //   - 도구 키워드(환율/날씨/계산/시간) → function_declarations
  //   - 그 외 → google_search grounding (실시간 정보 자동 검색)
  // useTools=false면 grounding 우선, image 모델은 둘 다 비활성.
  const supportsGrounding =
    !isImageModel &&
    /^gemini-2\.5|^gemini-3/.test(model) &&
    !/embedding|tts|imagen|veo|lyria/i.test(model);
  const wantsFunction = useTools && supportsGrounding && toolTurn < MAX_TOOL_TURNS && detectGeminiToolIntent(messages);
  // tool_response 메시지가 user/model role에 functionResponse part로 들어와 있으면
  // 그건 function turn 계속 → function_declarations 유지.
  const isToolContinuation = toolTurn > 0;

  let tools: object[] | undefined;
  if (wantsFunction || isToolContinuation) {
    tools = toGeminiFunctionDeclarations();
  } else if (supportsGrounding) {
    tools = [{ google_search: {} }];
  }

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
    // [2026-05-02 Roy] functionCall parts 누적 — Gemini는 stream 도중 functionCall
    // 보내면 끝까지 모은 다음 execute → functionResponse → 재호출.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const functionCalls: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastModelParts: any[] = [];

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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const p of partsArr as any[]) {
              if (p.functionCall) {
                functionCalls.push(p.functionCall);
              }
              lastModelParts.push(p);
            }
          }
          if (json.usageMetadata) {
            usage = {
              input: json.usageMetadata.promptTokenCount ?? 0,
              output: json.usageMetadata.candidatesTokenCount ?? 0,
            };
          }
        } catch {}
      }
    }

    // functionCall 처리 — execute → functionResponse → 재호출
    if (useTools && functionCalls.length > 0 && toolTurn < MAX_TOOL_TURNS) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const responseParts: any[] = [];
      for (const fc of functionCalls) {
        if (!fc.name) continue;
        onToolUse?.(fc.name);
        const result = await executeAITool(fc.name, fc.args ?? {});
        responseParts.push({
          functionResponse: { name: fc.name, response: result },
        });
      }
      const newMessages: ChatRequestMessage[] = [
        ...messages,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { role: 'assistant', content: lastModelParts as any },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { role: 'user', content: responseParts as any },
      ];
      return handleGoogle(newMessages, model, apiKey, stream, onChunk, onDone, signal, useTools, onToolUse, toolTurn + 1);
    }

    onDone?.(fullText, usage);
  } else {
    const json = await res.json();
    const partsArr = json.candidates?.[0]?.content?.parts ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fnCalls = (partsArr as any[]).filter((p) => p.functionCall);
    const content = partsArr.length ? extractGoogleParts(partsArr) : '';
    const usage = json.usageMetadata
      ? { input: json.usageMetadata.promptTokenCount ?? 0, output: json.usageMetadata.candidatesTokenCount ?? 0 }
      : undefined;
    if (useTools && fnCalls.length > 0 && toolTurn < MAX_TOOL_TURNS) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const responseParts: any[] = [];
      for (const p of fnCalls) {
        const fc = p.functionCall;
        onToolUse?.(fc.name);
        const result = await executeAITool(fc.name, fc.args ?? {});
        responseParts.push({ functionResponse: { name: fc.name, response: result } });
      }
      const newMessages: ChatRequestMessage[] = [
        ...messages,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { role: 'assistant', content: partsArr as any },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { role: 'user', content: responseParts as any },
      ];
      return handleGoogle(newMessages, model, apiKey, stream, onChunk, onDone, signal, useTools, onToolUse, toolTurn + 1);
    }
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
