/**
 * Model Adapter — 모델 종류별 메시지 변환 (Tori 18644993 PR #3).
 *
 * Context Bridge(PR #1)와 Augmentation Layer(PR #2)를 한 곳에서 묶어
 * "다음 모델에 보낼 prompt"를 결정. 호출자는 모델 종류 식별 + 보강 호출
 * 한 번으로 끝남.
 *
 * 4개 어댑터:
 *   - text     : 텍스트 모델 (GPT, Claude, Gemini 등)
 *   - image    : 이미지 생성 (DALL-E, gpt-image-1, Imagen 등)
 *   - vision   : 비전 모델 (이미지 첨부 시)
 *   - audio    : 음성 처리 (Whisper STT, TTS)
 *
 * Bridge가 필요 없거나 (같은 모델 / 첫 메시지 / Anthropic 키 없음) 호출
 * 실패한 경우 → 원본 메시지 그대로 반환 (silent fallback). 사용자 흐름
 * 절대 막지 않음.
 */

import { checkContextBridge, type BridgeMessage } from './context-bridge';
import { augmentForModelSwitch, type TargetModelType } from './augmentation-layer';

export type { TargetModelType } from './augmentation-layer';

export interface AdapterInput {
  /** 직전 세션 메시지들 (마지막 user 메시지 포함하지 않은 history). */
  sessionMessages: BridgeMessage[];
  /** 현재 사용자 입력 (마지막 user 메시지). */
  currentUserMessage: string;
  /** 라우팅된 다음 모델 ID (auto 등 가상 ID 배제, resolved id 권장). */
  targetModel: string;
  /** 사용자가 첨부한 이미지 수 — vision 추론에 사용. */
  attachedImageCount?: number;
  /** Anthropic API key (Haiku 호출용). 없으면 보강 skip. */
  anthropicKey: string | undefined;
  /** 답변 언어. */
  lang: 'ko' | 'en';
  /** 사용자 중단 시 전파. */
  signal?: AbortSignal;
  /** PR #4 — 세션 ID (older summary 캐시 분리). */
  sessionId?: string;
}

export interface AdapterResult {
  /**
   * 다음 모델에 보낼 prompt. 보강 성공 시 Haiku 결과, 실패/skip 시 원본.
   * 호출자는 이걸로 마지막 user 메시지를 교체 (text/vision) 또는 직접
   * generate API에 전달 (image).
   */
  finalPrompt: string;
  /** 보강 시도 여부 (skip / 실패와 무관하게 시도 자체를 했나). */
  bridgeAttempted: boolean;
  /** 보강 성공 여부. */
  bridgeApplied: boolean;
  /** 캐시 hit 여부 (성공 시). */
  fromCache: boolean;
  /** 보강 안 된 사유 (디버깅용). */
  reason: 'first_message' | 'same_model' | 'model_switch' | 'no_anthropic_key' | 'haiku_error';
  /** 모델 종류 (UI 표시용). */
  type: TargetModelType;
}

// ── 모델 → 종류 추론 ─────────────────────────────────────────────
/**
 * 모델 ID로부터 종류를 추론. 첨부 이미지가 있으면 vision 우선.
 * 사용자 의도(자연어 키워드)는 호출자가 별도 detectCategory로 결정해서
 * targetModel을 그것에 맞게 라우팅해야 함.
 */
export function inferTargetModelType(
  modelId: string,
  attachedImageCount = 0
): TargetModelType {
  const lower = (modelId || '').toLowerCase();
  if (/^(dall-e|gpt-image|imagen|stable-diffusion|flux|sdxl)/.test(lower)) {
    return 'image';
  }
  if (/whisper|stt-|tts-|audio-/.test(lower)) {
    return 'audio';
  }
  if (attachedImageCount > 0) {
    return 'vision';
  }
  return 'text';
}

// ── 공통 어댑터 실행 ─────────────────────────────────────────────
async function runAdapter(
  input: AdapterInput,
  type: TargetModelType
): Promise<AdapterResult> {
  const bridge = checkContextBridge(input.sessionMessages, input.targetModel);

  // 보강이 필요 없으면 즉시 반환 (Haiku 호출 안 함)
  if (!bridge.needsAugmentation) {
    return {
      finalPrompt: input.currentUserMessage,
      bridgeAttempted: false,
      bridgeApplied: false,
      fromCache: false,
      reason: bridge.reason,
      type,
    };
  }

  // Anthropic 키 없으면 silent skip
  if (!input.anthropicKey) {
    return {
      finalPrompt: input.currentUserMessage,
      bridgeAttempted: false,
      bridgeApplied: false,
      fromCache: false,
      reason: 'no_anthropic_key',
      type,
    };
  }

  // Haiku 호출 시도
  try {
    const aug = await augmentForModelSwitch({
      sessionMessages: input.sessionMessages,
      currentUserMessage: input.currentUserMessage,
      targetModel: input.targetModel,
      targetModelType: type,
      lang: input.lang,
      apiKey: input.anthropicKey,
      signal: input.signal,
      sessionId: input.sessionId,
    });

    if (!aug.augmentedPrompt || !aug.augmentedPrompt.trim()) {
      // 빈 응답 — 원본 보존
      return {
        finalPrompt: input.currentUserMessage,
        bridgeAttempted: true,
        bridgeApplied: false,
        fromCache: aug.fromCache,
        reason: 'haiku_error',
        type,
      };
    }

    return {
      finalPrompt: aug.augmentedPrompt,
      bridgeAttempted: true,
      bridgeApplied: true,
      fromCache: aug.fromCache,
      reason: 'model_switch',
      type,
    };
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.warn('[ModelAdapter] Haiku augmentation failed:', (err as Error)?.message);
    }
    return {
      finalPrompt: input.currentUserMessage,
      bridgeAttempted: true,
      bridgeApplied: false,
      fromCache: false,
      reason: 'haiku_error',
      type,
    };
  }
}

// ── 4개 어댑터 (얇은 래퍼 — 모두 같은 runAdapter, 종류만 다름) ────
export const adaptForText   = (i: AdapterInput) => runAdapter(i, 'text');
export const adaptForImage  = (i: AdapterInput) => runAdapter(i, 'image');
export const adaptForVision = (i: AdapterInput) => runAdapter(i, 'vision');
export const adaptForAudio  = (i: AdapterInput) => runAdapter(i, 'audio');

/**
 * 종류 자동 추론 → 적절한 어댑터 호출. 호출자가 종류 모를 때 편의 함수.
 */
export async function adaptForModel(input: AdapterInput): Promise<AdapterResult> {
  const type = inferTargetModelType(input.targetModel, input.attachedImageCount ?? 0);
  return runAdapter(input, type);
}
