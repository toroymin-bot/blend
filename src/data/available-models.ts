/**
 * Single source of truth for available models, read by:
 *  - D1ChatView model dropdown
 *  - Settings → Models section
 *  - Compare view provider tabs
 *  - Chat request routing (provider inference)
 *
 * The JSON file is regenerated every 3 hours by scripts/update-models.ts.
 * Do NOT edit it by hand — edit META_OVERRIDES in the script instead.
 */

import generated from './available-models.generated.json';

export type ProviderId = 'openai' | 'anthropic' | 'google' | 'deepseek' | 'groq';

export type ModelTier = 'flagship' | 'balanced' | 'fast' | 'reasoning' | 'trial';

export interface AvailableModel {
  id: string;
  provider: ProviderId;
  displayName: string;
  description_ko: string;
  description_en: string;
  tier: ModelTier;
  contextWindow?: number;
  createdAt?: number;
  deprecated: boolean;
  supportsVision: boolean;
  supportsStreaming: boolean;
}

export interface ModelRegistry {
  generatedAt: string;
  providers: ProviderId[];
  errors: { provider: ProviderId; message: string }[];
  models: AvailableModel[];
}

const registry = generated as ModelRegistry;

export const AVAILABLE_MODELS: AvailableModel[] = registry.models;
export const REGISTRY_GENERATED_AT: string = registry.generatedAt;

// ============================================================
// Convenience selectors
// ============================================================

// ============================================================
// Curated dropdown — grouped by provider, each with 1-3 picks
// and a fallback chain per slot.
// ============================================================

/** Provider display order in the dropdown */
export const FEATURED_PROVIDER_ORDER: ProviderId[] = [
  'google',     // trial/free first for familiarity
  'anthropic',
  'openai',
  'deepseek',
  'groq',
];

/**
 * Per-provider picks, in preferred order. The first available ID wins per
 * slot — but fallbacks are only used when the preferred one is missing from
 * the registry (e.g. model retired, API not yet exposing new alias).
 */
// [2026-05-02 Roy] PICK_FROM_PROVIDER 라이브 버전 추적 — 최신 모델을 chain 앞쪽에.
// 사용자 불만: "API 키 관리 페이지의 모델 라벨이 채팅창 최신 모델과 안 맞음".
// 양쪽 다 getFeaturedModels()를 쓰지만 chain 앞쪽이 outdated였음 (gpt-5.4 fixed).
// 해결: 알려진 최신(5.5/4.7/3.1-pro)을 head, 이전 세대는 fallback.
// 다음 세대(5.6, 4.8 등) 출시되면 chain 앞에 추가만 하면 됨.
const PICK_FROM_PROVIDER: Record<ProviderId, string[][]> = {
  google: [
    ['gemini-2.5-flash'],                                                    // trial/free
    ['gemini-3.1-pro', 'gemini-3.1-pro-preview', 'gemini-3-pro', 'gemini-3-pro-preview', 'gemini-2.5-pro'],
  ],
  anthropic: [
    ['claude-opus-4-7', 'claude-opus-4-6', 'claude-opus-4-5-20251101', 'claude-opus-4-5'],
    ['claude-sonnet-4-6', 'claude-sonnet-4-5-20250929'],
    ['claude-haiku-4-5', 'claude-haiku-4-5-20251001'],
  ],
  openai: [
    ['gpt-5.5-pro', 'gpt-5.4-pro', 'gpt-5.4', 'gpt-5.3', 'gpt-4o'],
    ['gpt-5.5', 'gpt-5.4-mini', 'gpt-5-mini', 'gpt-4o-mini'],
    ['gpt-5.2', 'o3', 'o1'],
  ],
  deepseek: [
    ['deepseek-v4-pro', 'deepseek-chat'],
    ['deepseek-v4-flash', 'deepseek-reasoner'],
  ],
  groq: [
    ['llama-3.3-70b-versatile'],
  ],
};

/** Featured models grouped by provider, in display order */
export function getFeaturedModels(): AvailableModel[] {
  const byId = new Map(AVAILABLE_MODELS.map((m) => [m.id, m]));
  const result: AvailableModel[] = [];

  for (const provider of FEATURED_PROVIDER_ORDER) {
    const slots = PICK_FROM_PROVIDER[provider] ?? [];
    for (const fallbackChain of slots) {
      for (const id of fallbackChain) {
        if (byId.has(id)) {
          result.push(byId.get(id)!);
          break; // first match wins this slot
        }
      }
    }
  }

  return result;
}

/** Provider display labels for section headers in the dropdown */
export const PROVIDER_LABELS: Record<ProviderId, { ko: string; en: string }> = {
  google:    { ko: 'Google',    en: 'Google' },
  anthropic: { ko: 'Anthropic', en: 'Anthropic' },
  openai:    { ko: 'OpenAI',    en: 'OpenAI' },
  deepseek:  { ko: 'DeepSeek',  en: 'DeepSeek' },
  groq:      { ko: 'Groq',      en: 'Groq' },
};

/** Infer provider from model id (registry lookup) */
export function inferProvider(modelId: string): ProviderId | null {
  return AVAILABLE_MODELS.find((x) => x.id === modelId)?.provider ?? null;
}

/**
 * Auto-routing fallback chain — derived from registry, NOT hardcoded.
 *
 * Picks 1 cheap+fast model per provider so when a model is deprecated by the
 * provider (e.g. claude-3-5-haiku-20241022 retired), the 3-hour cron updates
 * the registry and this chain follows automatically without code changes.
 *
 * Tier preference per provider: fast → balanced → any non-deprecated.
 * Provider order is the same priority as the legacy hardcoded chain.
 */
const AUTO_PROVIDER_PRIORITY: ProviderId[] = ['openai', 'anthropic', 'google', 'deepseek', 'groq'];

// Auto fallback은 텍스트 채팅용 — audio/realtime/tts/image/codex/transcribe 전용 모델 제외.
// (registry tier='fast'에 이런 specialty 모델도 포함될 수 있음)
const NON_TEXT_CHAT_PATTERN = /audio|realtime|transcribe|tts|image-|codex|search-preview/i;
function isTextChatModel(id: string): boolean {
  return !NON_TEXT_CHAT_PATTERN.test(id);
}

/**
 * 이미지 생성 모델 자동 선택 — registry에서 동적 도출.
 * - 패턴 매칭으로 모든 gpt-image / dall-e 시리즈 발견
 * - 버전 숫자 기준 정렬 → 가장 높은 버전 자동 선택
 * - 3시간 cron이 새 모델(gpt-image-3, gpt-image-2.5 등)을 registry에 추가하면
 *   다음 호출부터 자동으로 그 모델 사용 — 코드 수정 X.
 * - dated snapshot(예: gpt-image-2-2026-04-21)은 제외 (alias 우선)
 *
 * 점수 = family bonus + 버전. gpt-image 시리즈 = +100, dall-e 시리즈 = +0
 *   → gpt-image-1(=101) > dall-e-3(=3)이 되어 gpt-image 시리즈 항상 우선.
 */
export function isImageGenModel(modelId: string | null | undefined): boolean {
  return typeof modelId === 'string' && /^(dall-e|gpt-image)-\d/.test(modelId);
}

function imageModelScore(id: string): number {
  const family = id.startsWith('gpt-image') ? 100 : 0;
  const m = id.match(/-(\d+(?:\.\d+)?)/);
  const version = m ? parseFloat(m[1]) : 0;
  return family + version;
}

export function getBestImageModel(): string {
  const candidates = AVAILABLE_MODELS.filter((m) =>
    m.provider === 'openai' &&
    !m.deprecated &&
    isImageGenModel(m.id) &&
    // dated snapshot 제외 — alias가 있으면 alias 우선 (예: 'gpt-image-2'가 있으면 'gpt-image-2-2026-04-21' 무시)
    !/-\d{4}-\d{2}-\d{2}$/.test(m.id),
  );
  candidates.sort((a, b) => imageModelScore(b.id) - imageModelScore(a.id));
  // registry가 어떤 이유로 비어있어도 무한 루프 X — undefined fallback은 호출자가 처리.
  return candidates[0]?.id ?? 'dall-e-3';
}

/**
 * [2026-05-03 Roy] Quality-aware image model resolver — registry에서 동적 도출.
 * 사용자가 'standard'(verification 불필요, 안정) / 'premium'(고품질, 인증 필요) 중 선택하면,
 * 3시간 cron이 새 모델 추가/구모델 폐기 시도 자동 반영. 카피/모달/설정도 dynamic 라벨 사용.
 *
 * - standard: 가장 최신 dall-e-* (alias)
 * - premium: 가장 최신 gpt-image-* (alias)
 * 못 찾으면 안전 fallback (dall-e-3 / gpt-image-2 — 코드 수정 시점 LTS).
 */
export function getImageModelByQuality(quality: 'standard' | 'premium'): string {
  const family = quality === 'premium' ? /^gpt-image-/ : /^dall-e-/;
  const candidates = AVAILABLE_MODELS.filter((m) =>
    m.provider === 'openai' &&
    !m.deprecated &&
    family.test(m.id) &&
    !/-\d{4}-\d{2}-\d{2}$/.test(m.id), // dated snapshot 제외
  );
  candidates.sort((a, b) => imageModelScore(b.id) - imageModelScore(a.id));
  return candidates[0]?.id ?? (quality === 'premium' ? 'gpt-image-2' : 'dall-e-3');
}

/**
 * [2026-05-03 Roy] 사용자에게 보여줄 모델 라벨 (한 줄). 카피 하드코딩 회피.
 * registry의 displayName 우선, 없으면 model id에서 친근한 라벨 도출.
 */
export function getImageModelLabel(modelId: string, lang: 'ko' | 'en' = 'en'): string {
  const m = AVAILABLE_MODELS.find((x) => x.id === modelId);
  if (m?.displayName) return m.displayName;
  // ID에서 친근한 라벨 도출 (예: 'gpt-image-2' → 'GPT Image 2', 'dall-e-3' → 'DALL-E 3')
  if (modelId.startsWith('gpt-image-')) {
    const v = modelId.replace('gpt-image-', '');
    return `GPT Image ${v}`;
  }
  if (modelId.startsWith('dall-e-')) {
    const v = modelId.replace('dall-e-', '');
    return `DALL-E ${v}`;
  }
  void lang; // 향후 KR/EN description 분기에 사용 예정
  return modelId;
}

export function getAutoFallbackChain(): Array<{ provider: ProviderId; apiModel: string }> {
  return AUTO_PROVIDER_PRIORITY.flatMap((provider) => {
    const ofProvider = AVAILABLE_MODELS.filter(
      (m) => m.provider === provider && !m.deprecated && isTextChatModel(m.id),
    );
    const fast = ofProvider.find((m) => m.tier === 'fast');
    const balanced = ofProvider.find((m) => m.tier === 'balanced');
    const any = ofProvider[0];
    const pick = fast || balanced || any;
    return pick ? [{ provider, apiModel: pick.id }] : [];
  });
}

/** Fallback heuristic when model isn't in registry */
export function inferProviderFromPattern(modelId: string): ProviderId {
  if (modelId.startsWith('claude-')) return 'anthropic';
  if (/^(gpt-|o[1234]|chatgpt-)/.test(modelId)) return 'openai';
  if (modelId.startsWith('gemini-')) return 'google';
  if (modelId.startsWith('deepseek-')) return 'deepseek';
  if (/^(llama|mixtral)/.test(modelId)) return 'groq';
  return 'openai';
}

/** Is this the Gemini trial model? */
export function isTrialModel(modelId: string): boolean {
  return modelId === 'gemini-2.5-flash';
}
