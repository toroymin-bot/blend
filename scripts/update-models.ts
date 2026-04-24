#!/usr/bin/env tsx
/**
 * Queries each provider's /models endpoint and writes a normalized
 * registry to src/data/available-models.generated.json.
 *
 * Runs every 3 hours via cron. Commits if content changed.
 *
 * Required env vars (server-only, not bundled):
 *   ANTHROPIC_MODELS_KEY   — Anthropic API key (read-only models access OK)
 *   OPENAI_MODELS_KEY      — OpenAI API key
 *   GOOGLE_MODELS_KEY      — Gemini API key (can reuse NEXT_PUBLIC_BLEND_TRIAL_GEMINI_KEY)
 *   DEEPSEEK_MODELS_KEY    — DeepSeek API key
 *   GROQ_MODELS_KEY        — Groq API key
 *
 * If a provider key is missing, that provider is skipped (not an error).
 */

import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

// ============================================================
// Types
// ============================================================
type ProviderId = 'openai' | 'anthropic' | 'google' | 'deepseek' | 'groq';

interface NormalizedModel {
  id: string;                    // API model ID (e.g. "claude-opus-4-7")
  provider: ProviderId;
  displayName: string;           // "Claude Opus 4.7"
  description_ko: string;
  description_en: string;
  tier: 'flagship' | 'balanced' | 'fast' | 'reasoning' | 'trial';
  contextWindow?: number;        // tokens
  createdAt?: number;            // unix seconds, from provider
  deprecated: boolean;           // true if provider marks it for retirement
  supportsVision: boolean;
  supportsStreaming: boolean;
}

interface RegistryOutput {
  generatedAt: string;           // ISO8601
  providers: ProviderId[];       // which providers succeeded this run
  errors: { provider: ProviderId; message: string }[];
  models: NormalizedModel[];
}

// ============================================================
// Human-curated metadata overrides
// ============================================================
const META_OVERRIDES: Record<string, Partial<NormalizedModel>> = {
  // Anthropic
  'claude-opus-4-7': {
    displayName: 'Claude Opus 4.7',
    description_ko: '글쓰기 · 추론 · 코딩 최고 성능',
    description_en: 'Best for writing, reasoning, and code',
    tier: 'flagship',
  },
  'claude-opus-4-6': {
    displayName: 'Claude Opus 4.6',
    description_ko: '이전 플래그십 · 1M 컨텍스트',
    description_en: 'Previous flagship · 1M context',
    tier: 'flagship',
  },
  'claude-opus-4-5': {
    displayName: 'Claude Opus 4.5',
    description_ko: '이전 플래그십',
    description_en: 'Previous flagship',
    tier: 'flagship',
  },
  'claude-sonnet-4-6': {
    displayName: 'Claude Sonnet 4.6',
    description_ko: '일상 업무에 균형형',
    description_en: 'Balanced for everyday work',
    tier: 'balanced',
  },
  'claude-haiku-4-5': {
    displayName: 'Claude Haiku 4.5',
    description_ko: '빠르고 경제적',
    description_en: 'Fast and economical',
    tier: 'fast',
  },
  'claude-3-5-haiku-20241022': {
    displayName: 'Claude 3.5 Haiku',
    description_ko: '빠른 Anthropic 모델',
    description_en: 'Fast Anthropic model',
    tier: 'fast',
  },

  // OpenAI
  'gpt-4o': {
    displayName: 'GPT-4o',
    description_ko: '강력한 범용 성능',
    description_en: 'Strong all-around performance',
    tier: 'flagship',
  },
  'gpt-4o-mini': {
    displayName: 'GPT-4o mini',
    description_ko: '빠르고 경제적인 OpenAI 모델',
    description_en: 'Fast and affordable OpenAI model',
    tier: 'fast',
  },

  // Google
  'gemini-2.5-flash': {
    displayName: 'Gemini 2.5 Flash',
    description_ko: '체험 가능 · 무료 AI',
    description_en: 'Free trial available',
    tier: 'trial',
  },
  'gemini-2.5-pro': {
    displayName: 'Gemini 2.5 Pro',
    description_ko: 'Google 플래그십',
    description_en: 'Google flagship',
    tier: 'flagship',
  },
  'gemini-2.0-flash': {
    displayName: 'Gemini 2.0 Flash',
    description_ko: '빠른 Google 모델',
    description_en: 'Fast Google model',
    tier: 'fast',
  },
  'gemini-2.0-flash-lite': {
    displayName: 'Gemini 2.0 Flash Lite',
    description_ko: '초경량 Google 모델',
    description_en: 'Ultra-light Google model',
    tier: 'fast',
  },

  // DeepSeek
  'deepseek-chat': {
    displayName: 'DeepSeek V3',
    description_ko: '초저가 고성능',
    description_en: 'Ultra-cheap, high quality',
    tier: 'balanced',
  },
  'deepseek-reasoner': {
    displayName: 'DeepSeek R1',
    description_ko: '수학 · 코딩 추론',
    description_en: 'Math & code reasoning',
    tier: 'reasoning',
  },

  // Groq
  'llama-3.3-70b-versatile': {
    displayName: 'Llama 3.3 70B',
    description_ko: '무료 · 초고속',
    description_en: 'Free · ultra-fast',
    tier: 'fast',
  },
};

// ============================================================
// Heuristic classification for unknown models
// ============================================================
function classifyUnknown(id: string, provider: ProviderId): Partial<NormalizedModel> {
  const lower = id.toLowerCase();
  let tier: NormalizedModel['tier'] = 'balanced';
  if (/opus|pro|ultra/.test(lower)) tier = 'flagship';
  else if (/haiku|mini|nano|flash|lite/.test(lower)) tier = 'fast';
  else if (/sonnet|chat|versatile/.test(lower)) tier = 'balanced';
  else if (/think|reason|o[134]|r[123]/.test(lower)) tier = 'reasoning';

  const displayName = id
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return {
    displayName,
    description_ko: `${provider} 모델`,
    description_en: `${provider} model`,
    tier,
  };
}

// ============================================================
// Provider fetchers
// ============================================================
async function fetchAnthropic(key: string): Promise<NormalizedModel[]> {
  const res = await fetch('https://api.anthropic.com/v1/models?limit=100', {
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const models: NormalizedModel[] = [];

  for (const m of data.data ?? []) {
    const id = m.id as string;
    // Skip very old models
    if (/claude-3-haiku-|claude-3-sonnet-|claude-3-opus-|claude-instant/.test(id)) continue;

    const override = META_OVERRIDES[id];
    const classified = override ?? classifyUnknown(id, 'anthropic');

    models.push({
      id,
      provider: 'anthropic',
      displayName: classified.displayName ?? id,
      description_ko: classified.description_ko ?? 'Anthropic 모델',
      description_en: classified.description_en ?? 'Anthropic model',
      tier: classified.tier ?? 'balanced',
      createdAt: m.created_at ? Math.floor(new Date(m.created_at).getTime() / 1000) : undefined,
      deprecated: false,
      supportsVision: true,
      supportsStreaming: true,
    });
  }

  return models;
}

async function fetchOpenAI(key: string): Promise<NormalizedModel[]> {
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const models: NormalizedModel[] = [];

  for (const m of data.data ?? []) {
    const id = m.id as string;
    if (!/^(gpt-|o[1234])/.test(id)) continue;
    if (/embedding|moderation|whisper|tts|dall-e|image|instruct/.test(id)) continue;
    if (/-\d{4}-\d{2}-\d{2}$/.test(id)) continue; // skip dated variants
    if (/gpt-3\.5|gpt-4$|gpt-4-0/.test(id)) continue; // skip retired

    const override = META_OVERRIDES[id];
    const classified = override ?? classifyUnknown(id, 'openai');

    models.push({
      id,
      provider: 'openai',
      displayName: classified.displayName ?? id,
      description_ko: classified.description_ko ?? 'OpenAI 모델',
      description_en: classified.description_en ?? 'OpenAI model',
      tier: classified.tier ?? 'balanced',
      createdAt: m.created,
      deprecated: false,
      supportsVision: /gpt-4o|gpt-5|o[34]/.test(id),
      supportsStreaming: true,
    });
  }

  return models;
}

async function fetchGoogle(key: string): Promise<NormalizedModel[]> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
  if (!res.ok) throw new Error(`Google ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const models: NormalizedModel[] = [];

  for (const m of data.models ?? []) {
    const id = (m.name as string).replace(/^models\//, '');
    const methods: string[] = m.supportedGenerationMethods ?? [];
    if (!methods.includes('generateContent')) continue;

    // Skip legacy, embedding, TTS, image-only, experimental
    if (/gemini-1\.[05]|bison|gecko|embed|aqa|tts|image|robotics|lyria|banana|deep-research|computer-use/.test(id)) continue;
    // Skip dated preview snapshots like gemini-2.5-flash-preview-04-17 (keep the alias)
    if (/-preview-\d{2}-\d{2}$/.test(id)) continue;

    const override = META_OVERRIDES[id];
    const classified = override ?? classifyUnknown(id, 'google');

    models.push({
      id,
      provider: 'google',
      displayName: classified.displayName ?? id,
      description_ko: classified.description_ko ?? 'Google 모델',
      description_en: classified.description_en ?? 'Google model',
      tier: classified.tier ?? 'balanced',
      contextWindow: m.inputTokenLimit,
      deprecated: false,
      supportsVision: true,
      supportsStreaming: true,
    });
  }

  return models;
}

async function fetchDeepSeek(key: string): Promise<NormalizedModel[]> {
  const res = await fetch('https://api.deepseek.com/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const models: NormalizedModel[] = [];

  for (const m of data.data ?? []) {
    const id = m.id as string;
    const override = META_OVERRIDES[id];
    const classified = override ?? classifyUnknown(id, 'deepseek');

    models.push({
      id,
      provider: 'deepseek',
      displayName: classified.displayName ?? id,
      description_ko: classified.description_ko ?? 'DeepSeek 모델',
      description_en: classified.description_en ?? 'DeepSeek model',
      tier: classified.tier ?? 'balanced',
      deprecated: false,
      supportsVision: false,
      supportsStreaming: true,
    });
  }

  return models;
}

async function fetchGroq(key: string): Promise<NormalizedModel[]> {
  const res = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const models: NormalizedModel[] = [];

  for (const m of data.data ?? []) {
    const id = m.id as string;
    if (!/llama-3\.[123]|llama3|mixtral/.test(id)) continue;
    if (/guard|whisper/.test(id)) continue;

    const override = META_OVERRIDES[id];
    const classified = override ?? classifyUnknown(id, 'groq');

    models.push({
      id,
      provider: 'groq',
      displayName: classified.displayName ?? id,
      description_ko: classified.description_ko ?? 'Groq 모델 (무료)',
      description_en: classified.description_en ?? 'Groq model (free)',
      tier: classified.tier ?? 'fast',
      createdAt: m.created,
      deprecated: false,
      supportsVision: false,
      supportsStreaming: true,
    });
  }

  return models;
}

// ============================================================
// Main
// ============================================================
async function main() {
  const output: RegistryOutput = {
    generatedAt: new Date().toISOString(),
    providers: [],
    errors: [],
    models: [],
  };

  const fetchers: { id: ProviderId; key?: string; fn: (k: string) => Promise<NormalizedModel[]> }[] = [
    { id: 'anthropic', key: process.env.ANTHROPIC_MODELS_KEY, fn: fetchAnthropic },
    { id: 'openai',    key: process.env.OPENAI_MODELS_KEY,    fn: fetchOpenAI },
    { id: 'google',    key: process.env.GOOGLE_MODELS_KEY,    fn: fetchGoogle },
    { id: 'deepseek',  key: process.env.DEEPSEEK_MODELS_KEY,  fn: fetchDeepSeek },
    { id: 'groq',      key: process.env.GROQ_MODELS_KEY,      fn: fetchGroq },
  ];

  for (const f of fetchers) {
    if (!f.key) {
      output.errors.push({ provider: f.id, message: 'API key missing, skipped' });
      continue;
    }
    try {
      const models = await f.fn(f.key);
      output.models.push(...models);
      output.providers.push(f.id);
      console.log(`✓ ${f.id}: ${models.length} models`);
    } catch (err: any) {
      output.errors.push({ provider: f.id, message: err.message ?? String(err) });
      console.error(`✗ ${f.id}: ${err.message}`);
    }
  }

  // Sort: tier priority within provider
  const tierOrder = { flagship: 0, reasoning: 1, balanced: 2, fast: 3, trial: 4 };
  output.models.sort((a, b) => {
    if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
    if (a.tier !== b.tier) return tierOrder[a.tier] - tierOrder[b.tier];
    return a.displayName.localeCompare(b.displayName);
  });

  const outPath = join(process.cwd(), 'src/data/available-models.generated.json');
  mkdirSync(dirname(outPath), { recursive: true });

  // Only write if content changed (ignore generatedAt timestamp)
  const newContent = JSON.stringify(output, null, 2);
  let changed = true;
  if (existsSync(outPath)) {
    try {
      const existing = JSON.parse(readFileSync(outPath, 'utf-8'));
      const normalize = (o: any) => JSON.stringify({ ...o, generatedAt: '' });
      if (normalize(existing) === normalize(output)) changed = false;
    } catch {}
  }

  if (changed) {
    writeFileSync(outPath, newContent);
    console.log(`\nWrote ${outPath}`);
    console.log(`Total: ${output.models.length} models from ${output.providers.length}/5 providers`);
    if (output.errors.length > 0) {
      console.log(`Skipped:\n${output.errors.map((e) => `  ${e.provider}: ${e.message}`).join('\n')}`);
    }
  } else {
    console.log('\nNo changes.');
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
