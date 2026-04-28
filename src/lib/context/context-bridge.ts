/**
 * Cross-Model 컨텍스트 연속성 — Context Bridge (Tori 18644993 PR #1).
 *
 * 채팅 세션 안에서 사용자가 모델을 전환할 때 (예: Claude → DALL-E),
 * "그려줘" 같은 짧은 지시만으로도 이전 대화의 묘사를 유지하도록
 * 보강(augmentation) 필요 여부를 판단한다.
 *
 * 이 모듈은 판단만 수행. 실제 보강(Haiku 호출)은 PR #2의
 * Augmentation Layer가 처리. ModelAdapter(PR #3)는 모델별 메시지
 * 변환을 담당.
 *
 * 핵심 가치: Blend의 "모든 AI를 가로질러 컨텍스트 유지" 차별화.
 */

/**
 * 보강 의사결정.
 *
 * @field needsAugmentation - true면 PR #2 Augmentation Layer 호출 필요.
 * @field previousModel     - 이전 assistant 응답의 모델 ID (undefined일 수 있음).
 * @field currentModel      - 현재 사용자가 선택한 모델 ID.
 * @field reason            - 판단 근거. 디버깅·UI 표시·로깅에 사용.
 */
export interface BridgeDecision {
  needsAugmentation: boolean;
  previousModel?: string;
  currentModel: string;
  reason: 'first_message' | 'same_model' | 'model_switch';
}

/**
 * 메시지 모델 식별을 위한 최소 인터페이스.
 *
 * D1Message·ChatMessage 등 다양한 메시지 타입과 호환되도록 의도적으로
 * 좁게 정의. role + 모델 필드(modelUsed 또는 model) 중 하나만 있으면 OK.
 */
export interface BridgeMessage {
  role: 'user' | 'assistant' | 'system';
  /** 새 design1 컨벤션 — `modelUsed` 우선. */
  modelUsed?: string;
  /** legacy 컨벤션 — `model` 도 허용. */
  model?: string;
}

function readMessageModel(m: BridgeMessage): string | undefined {
  return m.modelUsed ?? m.model;
}

/**
 * 모델 전환 감지.
 *
 *  - 첫 메시지(이전 assistant 응답 없음)        → 보강 불필요.
 *  - 직전 assistant가 동일 모델로 응답          → 보강 불필요.
 *  - 직전 assistant 모델과 현재 선택 모델 다름  → 보강 필요.
 *
 * "선택 모델"은 실제로 라우팅된 effective model을 넣어야 함.
 * 예: currentModel === 'auto' 같은 가상 ID는 의미 있는 비교 대상이
 * 못 되므로 호출자가 라우팅 후 resolved id를 전달할 것.
 */
export function checkContextBridge(
  messages: BridgeMessage[],
  selectedModel: string
): BridgeDecision {
  if (!selectedModel) {
    // 안전망 — selectedModel이 비어있으면 보강 안 함 (디버그 추적 용이).
    return {
      needsAugmentation: false,
      currentModel: selectedModel,
      reason: 'first_message',
    };
  }

  // 가장 최근 assistant 응답 검색 (역순 순회).
  let lastAssistant: BridgeMessage | undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'assistant') {
      lastAssistant = messages[i];
      break;
    }
  }

  if (!lastAssistant) {
    return {
      needsAugmentation: false,
      currentModel: selectedModel,
      reason: 'first_message',
    };
  }

  const previousModel = readMessageModel(lastAssistant);

  // 이전 응답의 모델 정보가 누락된 경우 — 보수적으로 동일 모델 가정 (보강 안 함).
  // 이전 메시지가 modelUsed/model 필드를 안 쓴 legacy 데이터일 가능성. 사용자
  // 좌절보다 보강 누락이 덜 위험 (보강은 보너스 기능).
  if (!previousModel) {
    return {
      needsAugmentation: false,
      currentModel: selectedModel,
      reason: 'same_model',
    };
  }

  if (previousModel === selectedModel) {
    return {
      needsAugmentation: false,
      previousModel,
      currentModel: selectedModel,
      reason: 'same_model',
    };
  }

  return {
    needsAugmentation: true,
    previousModel,
    currentModel: selectedModel,
    reason: 'model_switch',
  };
}

/**
 * 디버깅·로깅용 짧은 요약. UI 라벨로도 사용 가능.
 */
export function describeBridgeDecision(d: BridgeDecision, lang: 'ko' | 'en'): string {
  if (lang === 'ko') {
    if (d.reason === 'first_message') return '첫 메시지 — 보강 불필요';
    if (d.reason === 'same_model')    return `같은 모델 (${d.currentModel}) — 보강 불필요`;
    return `모델 전환 ${d.previousModel} → ${d.currentModel} — 보강 필요`;
  }
  if (d.reason === 'first_message') return 'first message — no augmentation';
  if (d.reason === 'same_model')    return `same model (${d.currentModel}) — no augmentation`;
  return `model switch ${d.previousModel} → ${d.currentModel} — augmentation needed`;
}
