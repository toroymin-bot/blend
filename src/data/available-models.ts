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
const PICK_FROM_PROVIDER: Record<ProviderId, string[][]> = {
  google: [
    ['gemini-2.5-flash'],                                                    // trial/free
    ['gemini-3.1-pro', 'gemini-3.1-pro-preview', 'gemini-3-pro', 'gemini-3-pro-preview', 'gemini-2.5-pro'],
  ],
  anthropic: [
    ['claude-opus-4-7', 'claude-opus-4-6', 'claude-opus-4-5'],
    ['claude-sonnet-4-6', 'claude-sonnet-4-5-20250929'],
    ['claude-haiku-4-5', 'claude-haiku-4-5-20251001'],
  ],
  openai: [
    ['gpt-5.4', 'gpt-5.3', 'gpt-4o'],
    ['gpt-5.4-mini', 'gpt-4o-mini'],
    ['gpt-5.2', 'o3', 'o1'],
  ],
  deepseek: [
    ['deepseek-chat', 'deepseek-v4-pro'],
    ['deepseek-reasoner', 'deepseek-v4-flash'],
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
