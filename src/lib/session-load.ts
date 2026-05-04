// [2026-05-04 Roy] 채팅 세션 부하 추적 — 응답 지연 예측 기반.
// 100% = baseLatency × 1.10 (모델 기준 응답 시간 대비 10% 느려진 시점).
// 70% 워닝, 90% 강력 경고, 100% 비활성 + 새 채팅 자동 이동.
// AI답게: 모델 교체 시 baseLatency 자동 적응 (Haiku 빠름 / Opus 느림).

export interface SessionLoadInputs {
  messageCount: number;
  totalTokens: number;
  ragChunks: number;
  dataSources: number;
  imageCount: number;
  sttCalls: number;
  ttsCalls: number;
  modelId?: string;
}

export interface SessionLoadResult {
  loadPct: number;          // 0~100 (clamped)
  estimatedDeltaMs: number; // 누적 응답 추가 지연 (ms)
  baseLatencyMs: number;    // 모델별 기본 응답시간
  thresholdMs: number;      // 100%에 해당하는 추가 지연 (= baseLatency × 0.10)
}

const BASE_LATENCY_BY_KEY: Array<[string, number]> = [
  ['haiku', 2000],
  ['flash', 2000],
  ['mini',  2000],
  ['sonnet', 5000],
  ['gpt-4o', 5000],
  ['gpt-4',  6000],
  ['opus', 8000],
  ['gemini-pro', 5000],
  ['deepseek', 4000],
  ['groq', 1500],
];
const DEFAULT_BASE_LATENCY = 5000;

function getBaseLatency(modelId?: string): number {
  if (!modelId) return DEFAULT_BASE_LATENCY;
  const lower = modelId.toLowerCase();
  for (const [k, v] of BASE_LATENCY_BY_KEY) {
    if (lower.includes(k)) return v;
  }
  return DEFAULT_BASE_LATENCY;
}

/** Roy 결정: 선형 (비선형 가속 X), 10% 느려짐 = 100% */
export function computeSessionLoad(i: SessionLoadInputs): SessionLoadResult {
  const baseLatencyMs = getBaseLatency(i.modelId);
  const thresholdMs = baseLatencyMs * 0.10;
  const estimatedDeltaMs =
      i.totalTokens * 0.5
    + i.ragChunks * 80
    + i.dataSources * 200
    + i.imageCount * 300
    + i.sttCalls * 150
    + i.ttsCalls * 50
    + (i.messageCount * i.messageCount) * 2;
  const loadPct = Math.min(100, Math.max(0, (estimatedDeltaMs / thresholdMs) * 100));
  return { loadPct, estimatedDeltaMs, baseLatencyMs, thresholdMs };
}

/** 색상 단계 — CSS transition으로 천천히 그라디에이션 효과 */
export function getLoadColor(pct: number): string {
  if (pct < 70) return '#1F2937';   // gray-800 (검은색에 가까움)
  if (pct < 90) return '#F97316';   // orange-500
  return '#DC2626';                  // red-600
}

/** 70/90/100 임계점 도달 여부 — useEffect에서 ref 비교용 */
export function getLoadStage(pct: number): 0 | 70 | 90 | 100 {
  if (pct >= 100) return 100;
  if (pct >= 90)  return 90;
  if (pct >= 70)  return 70;
  return 0;
}

/** 70%/90%/100% 도달 시 자동 시스템 메시지 본문 (한/영) */
export function getLoadStageMessage(stage: 70 | 90 | 100, lang: 'ko' | 'en' = 'ko'): string {
  if (stage === 70) {
    return lang === 'ko'
      ? '⚠️ 이 채팅의 사용량이 70%에 도달했어요.\n\n— 그동안 누적된 메시지·문서·이미지 때문에 응답 속도가 점점 느려질 수 있어요.\n— **권장:** 진행 중인 주제가 마무리되면 새 채팅을 시작해 보세요. 컨텍스트가 가벼울수록 답변이 더 빨라요.\n— 지금 당장 바꿀 필요는 없고, 이 채팅에서 계속 작업하셔도 괜찮아요.'
      : '⚠️ This chat has reached 70% of its capacity.\n\n— Accumulated messages, documents, and images are starting to slow responses.\n— **Tip:** Once your current topic wraps up, consider starting a new chat for a faster, lighter context.\n— No need to switch right now — you can keep going here.';
  }
  if (stage === 90) {
    return lang === 'ko'
      ? '🔴 이 채팅의 사용량이 90%에 도달했어요. **곧 자동 종료됩니다.**\n\n— 응답 지연이 눈에 띄게 길어지고 있어요.\n— **강력 권장:** 지금 진행 중인 답변을 받은 뒤, 바로 새 채팅으로 옮기세요.\n— 100% 도달 시 이 채팅창은 자동으로 비활성화되고, 잠시 후 새 채팅으로 이동돼요.'
      : '🔴 This chat is at 90% capacity. **It will auto-close shortly.**\n\n— Response delays are noticeably increasing.\n— **Strongly recommended:** finish reading the current reply, then move to a new chat.\n— At 100%, this chat will be disabled and you\'ll be moved to a fresh chat automatically.';
  }
  return lang === 'ko'
    ? '🚫 이 채팅이 100% 사용량에 도달해 비활성화됐어요.\n\n3초 뒤 자동으로 새 채팅으로 이동합니다. 작업하던 주제는 새 채팅에 이어서 질문해 주세요. (이전 대화는 사이드바 기록에 그대로 남아 있어요.)'
    : '🚫 This chat has reached 100% capacity and has been disabled.\n\nMoving you to a new chat in 3 seconds. Continue your topic there — the previous conversation stays in your history sidebar.';
}

/** rough token estimate from text (≈ 4 chars per token) */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
