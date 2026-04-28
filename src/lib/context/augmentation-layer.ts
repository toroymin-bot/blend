/**
 * Augmentation Layer — Cross-Model 컨텍스트 보강 (Tori 18644993 PR #2).
 *
 * Context Bridge(PR #1)가 "보강 필요"로 판단한 경우, Claude Haiku 4.5를
 * 호출해서 다음 모델(DALL-E / Vision / Audio 등)이 이해할 수 있는 보강된
 * 사용자 메시지를 생성.
 *
 * 예: 직전 대화에서 "주황 고양이"를 묘사한 뒤 사용자가 "그려줘"만 입력 →
 * Haiku가 "주황 고양이를 그려줘 — 이전 대화: ..." 같은 prompt 생성 →
 * DALL-E가 의미 보존된 그림 생성.
 *
 * 비용 통제: 동일 입력 SHA256 hash 기반 인메모리 캐시 (TTL 1h).
 * 서버리스 환경에선 휘발 — Redis/KV는 별도 phase.
 */

import type { BridgeMessage } from './context-bridge';

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const RECENT_WINDOW = 10;            // 최근 N개 메시지를 fully include
const CACHE_TTL_MS = 60 * 60 * 1000; // 1시간
const HAIKU_MAX_TOKENS = 1000;

/**
 * 다음 모델의 종류. 모델 ID로부터 추론(PR #3 ModelAdapter에서 정교화).
 * PR #2 단계에선 보강 시스템 프롬프트 분기에만 사용.
 */
export type TargetModelType = 'text' | 'image' | 'vision' | 'audio';

export interface AugmentInput {
  /** 보강이 필요한 시점의 직전 세션 메시지들 (assistant + user 섞여 있음). */
  sessionMessages: BridgeMessage[];
  /** 최근 사용자가 막 입력한 메시지 (아직 sessionMessages에 들어가지 않은 마지막 user input). */
  currentUserMessage: string;
  /** 라우팅된 다음 모델 ID. */
  targetModel: string;
  /** 모델 종류 — 보강 prompt가 모델 입력 형식 맞춰 생성. */
  targetModelType: TargetModelType;
  /** 답변 언어 — 한국어 사용자에겐 한국어 보강 prompt. */
  lang: 'ko' | 'en';
  /** Anthropic API key (사용자 BYOK). 없으면 호출 실패. */
  apiKey: string;
  /** AbortSignal — 사용자가 중단 시 전파. */
  signal?: AbortSignal;
}

export interface AugmentResult {
  /**
   * Haiku가 생성한 보강된 user prompt.
   * 호출자가 다음 모델 호출 시 마지막 user 메시지를 이걸로 교체.
   */
  augmentedPrompt: string;
  /** 캐시 hit 여부 (디버깅·UI 표시). */
  fromCache: boolean;
  /** 보강에 참고한 message ID들 (UI badge 호버 표시용). */
  sourceMessageIds: string[];
}

// ── 캐시 ─────────────────────────────────────────────────────────
interface CachedEntry {
  result: Omit<AugmentResult, 'fromCache'>;
  timestamp: number;
}
const cache = new Map<string, CachedEntry>();

async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function buildCacheKey(params: AugmentInput): Promise<string> {
  // 캐시 키: 최근 메시지(role+content 조합) + 사용자 메시지 + target 모델
  const recent = params.sessionMessages
    .slice(-RECENT_WINDOW)
    .map((m) => `${m.role}:${typeof (m as unknown as { content: unknown }).content === 'string' ? (m as unknown as { content: string }).content : JSON.stringify((m as unknown as { content: unknown }).content)}`)
    .join('|');
  const raw = JSON.stringify({ recent, user: params.currentUserMessage, target: params.targetModel });
  return sha256Hex(raw);
}

// ── 시스템 프롬프트 ──────────────────────────────────────────────
function buildAugmentationSystemPrompt(params: { targetModel: string; targetModelType: TargetModelType; lang: 'ko' | 'en' }): string {
  const { targetModelType, lang } = params;

  if (targetModelType === 'image') {
    return lang === 'ko'
      ? `당신은 이미지 생성 모델(${params.targetModel})에 전달할 영어 prompt를 작성하는 보조자입니다.

⚠️ 절대 규칙:
- 사용자의 마지막 메시지("${params.targetModel} 그려줘" 같은 짧은 지시)를 보고, 직전 대화에서 묘사된 대상·속성·스타일을 모두 포함한 한 문장 영어 prompt만 출력.
- 다른 설명 없이 prompt만 출력. 마크다운/큰따옴표/접두사 금지.
- 길이 제한: 200 단어 이내.
- 직전 대화에 묘사가 없으면 사용자 메시지 그대로 영어로 번역만.

좋은 예시:
  대화: "주황색 고양이가 창가에 앉아있어"
  사용자: "그려줘"
  출력: "An orange tabby cat sitting peacefully by a sunlit window, soft natural lighting, warm color palette, photorealistic style"

나쁜 예시:
  ❌ "Sure, here's a prompt: ..." (접두사 금지)
  ❌ "주황 고양이를 그려달라는 의미입니다" (해석 금지)`
      : `You generate English prompts for an image-generation model (${params.targetModel}).

⚠️ Strict rules:
- Read the user's last short instruction (like "draw it") and the prior conversation. Output a single English image prompt that includes all subjects/attributes/styles described before.
- Output only the prompt — no markdown, quotes, or preamble.
- Max 200 words.
- If no prior description exists, just translate the user's message to English.

Good example:
  Convo: "An orange tabby cat sitting by a window"
  User: "draw it"
  Output: "An orange tabby cat sitting peacefully by a sunlit window, soft natural lighting, warm color palette, photorealistic style"`;
  }

  if (targetModelType === 'vision') {
    return lang === 'ko'
      ? `당신은 비전 모델(${params.targetModel})에 전달할 한국어 prompt를 작성하는 보조자입니다.

⚠️ 규칙:
- 사용자가 "이게 뭐야", "분석해줘" 같은 짧은 지시를 했을 때, 직전 대화 맥락을 반영한 자연스러운 한국어 prompt 한 단락 출력.
- 어떤 이미지를 분석하는지, 무엇을 비교하는지 등 맥락을 명시.
- 다른 설명 없이 prompt만 출력.`
      : `You generate prompts for a vision model (${params.targetModel}).

⚠️ Rules:
- When the user gives a short instruction like "what is this" or "analyze", produce a natural-language prompt that incorporates the prior conversation context.
- Specify which image is being analyzed, what's being compared, etc.
- Output only the prompt.`;
  }

  if (targetModelType === 'audio') {
    return lang === 'ko'
      ? `당신은 음성 처리 모델(${params.targetModel})에 전달할 prompt를 작성하는 보조자입니다.
직전 대화의 맥락을 반영한 명확한 prompt 한 단락 출력. 다른 설명 금지.`
      : `Generate prompts for an audio model (${params.targetModel}). Incorporate prior conversation context. Output the prompt only.`;
  }

  // text
  return lang === 'ko'
    ? `당신은 텍스트 모델(${params.targetModel})에 전달할 prompt를 작성하는 보조자입니다.
직전 대화의 맥락을 살려 사용자의 마지막 메시지를 명확한 한 단락 prompt로 변환. 다른 설명 금지.`
    : `Generate prompts for a text model (${params.targetModel}). Carry forward the prior conversation context. Output only the prompt — no preamble.`;
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

function buildAugmentationUserPrompt(params: {
  olderSummary: string | null;
  recent: BridgeMessage[];
  currentUserMessage: string;
}): string {
  const lines: string[] = [];

  if (params.olderSummary) {
    lines.push('[Earlier conversation summary]');
    lines.push(params.olderSummary);
    lines.push('');
  }

  lines.push('[Recent messages]');
  for (const m of params.recent) {
    const content = formatContent((m as unknown as { content: unknown }).content);
    lines.push(`${m.role}: ${content}`);
  }
  lines.push('');
  lines.push(`[User just said] "${params.currentUserMessage}"`);
  lines.push('');
  lines.push('Generate the augmented prompt for the next model. Output the prompt only, nothing else.');

  return lines.join('\n');
}

// ── Anthropic API 호출 ──────────────────────────────────────────
async function callHaiku(params: {
  apiKey: string;
  system: string;
  userMessage: string;
  signal?: AbortSignal;
}): Promise<string> {
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
      max_tokens: HAIKU_MAX_TOKENS,
      system: params.system,
      messages: [{ role: 'user', content: params.userMessage }],
    }),
    signal: params.signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: { message?: string } })?.error?.message ??
      `Anthropic Haiku error: ${res.status}`
    );
  }

  const data = await res.json() as { content?: Array<{ text?: string }> };
  return (data.content?.[0]?.text ?? '').trim();
}

// ── 메인 진입점 ──────────────────────────────────────────────────
/**
 * Cross-model 보강 — Haiku로 다음 모델용 prompt 생성.
 * 호출 실패 시 throw. 호출자는 catch에서 fallback (원본 메시지 그대로 사용)
 * 처리 권장.
 */
export async function augmentForModelSwitch(input: AugmentInput): Promise<AugmentResult> {
  if (!input.apiKey) {
    throw new Error('augmentForModelSwitch: Anthropic apiKey required');
  }

  const cacheKey = await buildCacheKey(input);
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { ...cached.result, fromCache: true };
  }

  const recent = input.sessionMessages.slice(-RECENT_WINDOW);

  const system = buildAugmentationSystemPrompt({
    targetModel: input.targetModel,
    targetModelType: input.targetModelType,
    lang: input.lang,
  });

  const userPrompt = buildAugmentationUserPrompt({
    olderSummary: null, // PR #4에서 채워질 예정
    recent,
    currentUserMessage: input.currentUserMessage,
  });

  const augmentedPrompt = await callHaiku({
    apiKey: input.apiKey,
    system,
    userMessage: userPrompt,
    signal: input.signal,
  });

  const sourceMessageIds = recent
    .map((m) => (m as unknown as { id?: string }).id)
    .filter((id): id is string => typeof id === 'string');

  const result = { augmentedPrompt, fromCache: false, sourceMessageIds };

  cache.set(cacheKey, { result, timestamp: Date.now() });

  return result;
}

/** 테스트·디버깅용 — 캐시 비우기. */
export function _clearAugmentationCache(): void {
  cache.clear();
}
