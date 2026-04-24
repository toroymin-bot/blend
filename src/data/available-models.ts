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

/** Top models for the main dropdown (best 1-2 per provider, tier-aware) */
export function getFeaturedModels(): AvailableModel[] {
  const byProvider = new Map<ProviderId, AvailableModel[]>();
  for (const m of AVAILABLE_MODELS) {
    const list = byProvider.get(m.provider) ?? [];
    list.push(m);
    byProvider.set(m.provider, list);
  }

  const featured: AvailableModel[] = [];

  // Trial model first (Gemini 2.5 Flash)
  const trial = AVAILABLE_MODELS.find((m) => m.tier === 'trial');
  if (trial) featured.push(trial);

  // Top pick from each provider
  const order: ModelTier[] = ['flagship', 'balanced', 'reasoning', 'fast'];
  const providers: ProviderId[] = ['anthropic', 'openai', 'google', 'deepseek', 'groq'];

  for (const p of providers) {
    const list = byProvider.get(p) ?? [];
    for (const tier of order) {
      const m = list.find((x) => x.tier === tier && !featured.includes(x));
      if (m) { featured.push(m); break; }
    }
  }

  return featured;
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
