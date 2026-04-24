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
  // ============================================
  // Anthropic (claude-*)
  // ============================================
  'claude-opus-4-7': {
    displayName: 'Claude Opus 4.7',
    description_ko: '글을 가장 잘 쓰고, 깊이 생각해요',
    description_en: 'Best at writing and deep thinking',
    tier: 'flagship',
  },
  'claude-opus-4-6': {
    displayName: 'Claude Opus 4.6',
    description_ko: '복잡한 일을 오래 붙잡고 해결해요',
    description_en: 'Tackles long, complex tasks',
    tier: 'flagship',
  },
  'claude-opus-4-5': {
    displayName: 'Claude Opus 4.5',
    description_ko: '복잡한 일을 깊게 생각해요',
    description_en: 'Thinks deeply on complex tasks',
    tier: 'flagship',
  },
  'claude-sonnet-4-6': {
    displayName: 'Claude Sonnet 4.6',
    description_ko: '빠르면서 똑똑해요 · 매일 쓰기 좋아요',
    description_en: 'Smart and quick · great for everyday',
    tier: 'balanced',
  },
  'claude-haiku-4-5': {
    displayName: 'Claude Haiku 4.5',
    description_ko: '가장 빠르고 가벼워요',
    description_en: 'Fastest and lightest',
    tier: 'fast',
  },
  'claude-3-5-haiku-20241022': {
    displayName: 'Claude 3.5 Haiku',
    description_ko: '가볍고 빠른 Anthropic 모델',
    description_en: 'Light and fast Anthropic model',
    tier: 'fast',
  },

  // ============================================
  // OpenAI (gpt-*, o*)
  // ============================================
  'gpt-5.4': {
    displayName: 'GPT-5.4',
    description_ko: '코딩과 문제 해결에 강해요',
    description_en: 'Strong at coding and solving problems',
    tier: 'flagship',
  },
  'gpt-5.4-mini': {
    displayName: 'GPT-5.4 mini',
    description_ko: '가볍고 빨라요',
    description_en: 'Light and fast',
    tier: 'fast',
  },
  'gpt-5.4-nano': {
    displayName: 'GPT-5.4 nano',
    description_ko: '아주 작고 아주 빨라요',
    description_en: 'Tiny and very fast',
    tier: 'fast',
  },
  'gpt-5.2': {
    displayName: 'GPT-5.2',
    description_ko: '어려운 문제를 천천히 풀어요',
    description_en: 'Thinks slowly to solve hard problems',
    tier: 'reasoning',
  },
  'gpt-5.2-pro': {
    displayName: 'GPT-5.2 Pro',
    description_ko: '제일 어려운 문제 전용',
    description_en: 'For the hardest problems',
    tier: 'reasoning',
  },
  'gpt-4o': {
    displayName: 'GPT-4o',
    description_ko: '코딩과 분석을 잘해요',
    description_en: 'Good at coding and analysis',
    tier: 'flagship',
  },
  'gpt-4o-mini': {
    displayName: 'GPT-4o mini',
    description_ko: '가볍고 빨라요',
    description_en: 'Light and fast',
    tier: 'fast',
  },

  // ============================================
  // Google (gemini-*)
  // ============================================
  'gemini-3.1-pro': {
    displayName: 'Gemini 3.1 Pro',
    description_ko: '구글의 최신 모델 · 긴 문서에 강해요',
    description_en: "Google's newest · great with long documents",
    tier: 'flagship',
  },
  'gemini-3-pro': {
    displayName: 'Gemini 3 Pro',
    description_ko: '이미지와 문서를 잘 이해해요',
    description_en: 'Great with images and documents',
    tier: 'flagship',
  },
  'gemini-2.5-pro': {
    displayName: 'Gemini 2.5 Pro',
    description_ko: '코딩 잘하는 구글 모델',
    description_en: 'Google model that codes well',
    tier: 'flagship',
  },
  'gemini-2.5-flash': {
    displayName: 'Gemini 2.5 Flash',
    description_ko: '무료로 써볼 수 있어요',
    description_en: 'Free to try',
    tier: 'trial',
  },
  'gemini-2.5-flash-lite': {
    displayName: 'Gemini 2.5 Flash Lite',
    description_ko: '가장 저렴한 구글 모델',
    description_en: "Google's cheapest",
    tier: 'fast',
  },
  'gemini-2.0-flash': {
    displayName: 'Gemini 2.0 Flash',
    description_ko: '빠른 구글 모델 (6월 은퇴 예정)',
    description_en: 'Fast Google model (retiring June)',
    tier: 'fast',
  },

  // ============================================
  // DeepSeek
  // ============================================
  'deepseek-chat': {
    displayName: 'DeepSeek V3',
    description_ko: '저렴한데 잘해요',
    description_en: 'Cheap but capable',
    tier: 'balanced',
  },
  'deepseek-reasoner': {
    displayName: 'DeepSeek R1',
    description_ko: '수학과 코딩을 잘 풀어요',
    description_en: 'Good at math and code',
    tier: 'reasoning',
  },

  // ============================================
  // Groq (llama-*, mixtral-*)
  // ============================================
  'llama-3.3-70b-versatile': {
    displayName: 'Llama 3.3 70B',
    description_ko: '무료 · 아주 빨라요',
    description_en: 'Free · very fast',
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
    // Skip dated snapshots like claude-sonnet-4-5-20250620
    if (/-\d{8}$/.test(id)) continue;
    if (/-\d{4}-\d{2}-\d{2}$/.test(id)) continue;

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
    // Skip dated snapshots like gemini-2.5-flash-20250115 or gemini-2.5-flash-exp-20250827
    if (/-\d{8}$/.test(id)) continue;
    if (/-\d{4}-\d{2}-\d{2}$/.test(id)) continue;

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
