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
// Curated whitelist — only these IDs (or their fallbacks) appear
// in the main dropdown. Order here = order in dropdown.
// ============================================================
const FEATURED_MODEL_IDS = [
  'gemini-2.5-flash',   // trial / free
  'claude-opus-4-7',    // Anthropic flagship
  'claude-sonnet-4-6',  // Anthropic balanced
  'gpt-5.4',            // OpenAI flagship
  'gpt-5.4-mini',       // OpenAI fast
  'gemini-3.1-pro',     // Google flagship
  'deepseek-chat',      // DeepSeek value
] as const;

/** Fallback chain: if the preferred ID isn't in the registry, try these in order */
const FEATURED_FALLBACKS: Record<string, string[]> = {
  'gemini-3.1-pro':  ['gemini-2.5-pro', 'gemini-2.5-flash'],
  'claude-opus-4-7': ['claude-opus-4-6', 'claude-opus-4-5'],
  'gpt-5.4':         ['gpt-5.3', 'gpt-5.2', 'gpt-4o'],
  'gpt-5.4-mini':    ['gpt-4o-mini'],
};

/** Top models for the main dropdown — explicit whitelist, stable order */
export function getFeaturedModels(): AvailableModel[] {
  const available = new Map(AVAILABLE_MODELS.map((m) => [m.id, m]));
  const result: AvailableModel[] = [];

  for (const preferredId of FEATURED_MODEL_IDS) {
    if (available.has(preferredId)) {
      result.push(available.get(preferredId)!);
      continue;
    }
    // Try fallbacks
    for (const fb of FEATURED_FALLBACKS[preferredId] ?? []) {
      if (available.has(fb)) {
        result.push(available.get(fb)!);
        break;
      }
    }
    // If neither preferred nor fallback found, slot is silently omitted
  }

  return result;
}

/** Infer provider from model id (registry lookup) */
export function inferProvider(modelId: string): ProviderId | null {
  return AVAILABLE_MODELS.find((x) => x.id === modelId)?.provider ?? null;
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
