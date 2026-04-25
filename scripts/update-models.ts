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
import { generateMeta } from './generate-descriptions.js';

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
    description_ko: '글을 가장 잘 써요',
    description_en: 'Best at writing',
    tier: 'flagship',
  },
  'claude-opus-4-6': {
    displayName: 'Claude Opus 4.6',
    description_ko: '글쓰기에 강해요',
    description_en: 'Strong at writing',
    tier: 'flagship',
  },
  'claude-opus-4-5': {
    displayName: 'Claude Opus 4.5',
    description_ko: '깊이 생각해요',
    description_en: 'Thinks deeply',
    tier: 'flagship',
  },
  'claude-sonnet-4-6': {
    displayName: 'Claude Sonnet 4.6',
    description_ko: '매일 쓰기에 좋아요',
    description_en: 'Good for daily tasks',
    tier: 'balanced',
  },
  'claude-haiku-4-5': {
    displayName: 'Claude Haiku 4.5',
    description_ko: '가장 빠르고 가벼워요',
    description_en: 'Fastest and lightest',
    tier: 'fast',
  },
  'claude-haiku-4-5-20251001': {
    displayName: 'Claude Haiku 4.5',
    description_ko: '가장 빠르고 가벼워요',
    description_en: 'Fastest and lightest',
    tier: 'fast',
  },
  'claude-sonnet-4-5-20250929': {
    displayName: 'Claude Sonnet 4.5',
    description_ko: '매일 쓰기에 좋아요',
    description_en: 'Good for daily tasks',
    tier: 'balanced',
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
    description_ko: '코딩과 문제 해결을 잘해요',
    description_en: 'Strong at code and problems',
    tier: 'flagship',
  },
  'gpt-5.4-mini': {
    displayName: 'GPT-5.4 mini',
    description_ko: '저렴하고 가벼워요',
    description_en: 'Cheap and light',
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
    description_ko: '어려운 추론을 해요',
    description_en: 'Deep reasoning',
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
    description_ko: '긴 문서를 잘 봐요',
    description_en: 'Great with long documents',
    tier: 'flagship',
  },
  'gemini-3-pro': {
    displayName: 'Gemini 3 Pro',
    description_ko: '긴 문서를 잘 봐요',
    description_en: 'Great with long documents',
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
    description_en: 'Solves math and code',
    tier: 'reasoning',
  },
  'deepseek-v4-pro': {
    displayName: 'DeepSeek V4 Pro',
    description_ko: '저렴한데 잘해요',
    description_en: 'Cheap but capable',
    tier: 'flagship',
  },
  'deepseek-v4-flash': {
    displayName: 'DeepSeek V4 Flash',
    description_ko: '싸고 빨라요',
    description_en: 'Cheap and fast',
    tier: 'fast',
  },

  // ============================================
  // Groq (llama-*, mixtral-*)
  // ============================================
  'llama-3.3-70b-versatile': {
    displayName: 'Llama 3.3 70B',
    description_ko: '무료로 아주 빨라요',
    description_en: 'Free and very fast',
    tier: 'fast',
  },

  // ===== AUTO-APPEND BELOW (do not delete this line) =====
  'gemma-3-4b-it': {
    displayName: "Gemma 3 4B IT",
    description_ko: "가볍고 빨라요",
    description_en: "Lightweight and fast",
    tier: "fast",
  },  // auto-generated 2026-04-25

  'gpt-5.5': {
    displayName: "GPT-5.5",
    description_ko: "최신 모델로 더 똑똑해요",
    description_en: "Smarter with the latest updates",
    tier: "balanced",
  },  // auto-generated 2026-04-24
  'gpt-5.5-pro': {
    displayName: "GPT-5.5 Pro",
    description_ko: "가장 강력한 모델이에요",
    description_en: "Our most powerful model",
    tier: "flagship",
  },  // auto-generated 2026-04-24

  'claude-opus-4-5-20251101': {
    displayName: "Claude Opus 4.5",
    description_ko: "가장 정확하게 써내려가요",
    description_en: "Writes with the highest accuracy",
    tier: "flagship",
  },  // auto-generated 2026-04-24
  'claude-opus-4-1-20250805': {
    displayName: "Claude Opus 4.1",
    description_ko: "가장 창의적인 글을 써요",
    description_en: "Best for creative writing",
    tier: "flagship",
  },  // auto-generated 2026-04-24
  'claude-opus-4-20250514': {
    displayName: "Claude Opus 4.2",
    description_ko: "가장 긴 글을 잘 써요",
    description_en: "Best at very long writing",
    tier: "flagship",
  },  // auto-generated 2026-04-24
  'claude-sonnet-4-20250514': {
    displayName: "Claude Sonnet 4.2",
    description_ko: "최신 일상 업무에 좋아요",
    description_en: "Good for daily tasks, latest version",
    tier: "balanced",
  },  // auto-generated 2026-04-24
  'gpt-4-turbo': {
    displayName: "GPT-4 Turbo",
    description_ko: "최신 정보를 잘 알아요",
    description_en: "Up-to-date knowledge",
    tier: "balanced",
  },  // auto-generated 2026-04-24
  'gpt-4o-audio-preview': {
    displayName: "GPT-4o Audio Preview",
    description_ko: "음성 대화에 특화됐어요",
    description_en: "Specialized for audio conversations",
    tier: "balanced",
  },  // auto-generated 2026-04-24
  'gpt-4o-realtime-preview': {
    displayName: "GPT-4o Realtime Preview",
    description_ko: "최신 정보에 빠르게 답해요",
    description_en: "Responds quickly with latest info",
    tier: "balanced",
  },  // auto-generated 2026-04-24
  'o1': {
    displayName: "OpenAI O1",
    description_ko: "어려운 추론을 잘해요",
    description_en: "Good at complex reasoning",
    tier: "reasoning",
  },  // auto-generated 2026-04-24
  'gpt-4o-mini-realtime-preview': {
    displayName: "GPT-4o Mini",
    description_ko: "가장 빠르고 가벼워요",
    description_en: "Fastest and lightest",
    tier: "fast",
  },  // auto-generated 2026-04-24
  'gpt-4o-mini-audio-preview': {
    displayName: "GPT-4o Mini Audio Preview",
    description_ko: "음성 대화에 좋아요",
    description_en: "Good for voice conversations",
    tier: "fast",
  },  // auto-generated 2026-04-24
  'o3-mini': {
    displayName: "O3 Mini",
    description_ko: "가볍고 추론을 잘해요",
    description_en: "Lightweight, good at reasoning",
    tier: "fast",
  },  // auto-generated 2026-04-24
  'gpt-4o-mini-search-preview': {
    displayName: "GPT-4o Mini Search Preview",
    description_ko: "최신 정보를 잘 찾아요",
    description_en: "Good at finding latest info",
    tier: "fast",
  },  // auto-generated 2026-04-24
  'gpt-4o-transcribe': {
    displayName: "GPT-4o Transcribe",
    description_ko: "음성을 글로 바꿔요",
    description_en: "Transcribes speech to text",
    tier: "balanced",
  },  // auto-generated 2026-04-24
  'gpt-4o-mini-transcribe': {
    displayName: "GPT-4o Mini Transcribe",
    description_ko: "음성 인식을 잘해요",
    description_en: "Good at speech recognition",
    tier: "fast",
  },  // auto-generated 2026-04-24
  'o1-pro': {
    displayName: "O1 Pro",
    description_ko: "가장 심층 추론을 해요",
    description_en: "Deepest reasoning power",
    tier: "flagship",
  },  // auto-generated 2026-04-24
  'o3': {
    displayName: "GPT-5.3",
    description_ko: "더 깊게 추론해요",
    description_en: "Deeper reasoning",
    tier: "reasoning",
  },  // auto-generated 2026-04-24
  'o4-mini': {
    displayName: "O4 Mini",
    description_ko: "가볍고 빨라요",
    description_en: "Light and fast",
    tier: "fast",
  },  // auto-generated 2026-04-24
  'gpt-4.1': {
    displayName: "GPT-4.1",
    description_ko: "최신 정보를 잘 알아요",
    description_en: "Good with up-to-date information",
    tier: "balanced",
  },  // auto-generated 2026-04-24
  'gpt-4.1-mini': {
    displayName: "GPT-4.1 Mini",
    description_ko: "가볍고 빨라요",
    description_en: "Light and fast",
    tier: "fast",
  },  // auto-generated 2026-04-24
  'gpt-4.1-nano': {
    displayName: "GPT-4.1 Nano",
    description_ko: "가장 가볍고 빨라요",
    description_en: "Lightest and fastest",
    tier: "fast",
  },  // auto-generated 2026-04-24
  'gpt-4o-transcribe-diarize': {
    displayName: "GPT-4o Transcribe",
    description_ko: "음성 기록을 잘해요",
    description_en: "Good at transcribing audio",
    tier: "balanced",
  },  // auto-generated 2026-04-24
  'gpt-5-chat-latest': {
    displayName: "GPT-5 Chat",
    description_ko: "일상 대화에 좋아요",
    description_en: "Good for everyday conversations",
    tier: "balanced",
  },  // auto-generated 2026-04-24
  'gpt-5': {
    displayName: "GPT-5",
    description_ko: "가장 강력한 모델이에요",
    description_en: "Our most powerful model",
    tier: "flagship",
  },  // auto-generated 2026-04-24
  'gpt-5-mini': {
    displayName: "GPT-5 Mini",
    description_ko: "가볍고 아주 빨라요",
    description_en: "Lightweight and very fast",
    tier: "fast",
  },  // auto-generated 2026-04-24
  'gpt-5-nano': {
    displayName: "GPT-5 Nano",
    description_ko: "가볍고 아주 빨라요",
    description_en: "Extremely fast and light",
    tier: "fast",
  },  // auto-generated 2026-04-24
  'gpt-realtime': {
    displayName: "GPT Realtime",
    description_ko: "최신 정보를 빠르게 찾아요",
    description_en: "Fast access to real-time info",
    tier: "fast",
  },  // auto-generated 2026-04-24
  'gpt-audio': {
    displayName: "GPT-Audio",
    description_ko: "음성 이해를 잘해요",
    description_en: "Good at understanding audio",
    tier: "balanced",
  },  // auto-generated 2026-04-24
  'gpt-5-codex': {
    displayName: "GPT-5 Codex",
    description_ko: "코딩에 가장 강해요",
    description_en: "Best at coding",
    tier: "balanced",
  },  // auto-generated 2026-04-24
  'gpt-5-pro': {
    displayName: "GPT-5 Pro",
    description_ko: "가장 강력한 모델이에요",
    description_en: "Our most powerful model",
    tier: "flagship",
  },  // auto-generated 2026-04-24
  'gpt-audio-mini': {
    displayName: "GPT Audio Mini",
    description_ko: "음성 이해에 특화됐어요",
    description_en: "Specialized in audio understanding",
    tier: "fast",
  },  // auto-generated 2026-04-24
  'gpt-5-search-api': {
    displayName: "GPT-5 Search API",
    description_ko: "최신 정보를 검색해요",
    description_en: "Searches for the latest information",
    tier: "balanced",
  },  // auto-generated 2026-04-24
  'gpt-realtime-mini': {
    displayName: "GPT Realtime Mini",
    description_ko: "실시간 정보에 강해요",
    description_en: "Strong at real-time information",
    tier: "fast",
  },  // auto-generated 2026-04-24
  'gpt-5.1-chat-latest': {
    displayName: "GPT-5.1 Chat",
    description_ko: "최신 모델이에요",
    description_en: "Latest model",
    tier: "balanced",
  },  // auto-generated 2026-04-24
  'gpt-5.1': {
    displayName: "GPT-5.1",
    description_ko: "최신 정보를 잘 알아요",
    description_en: "Good at up-to-date information",
    tier: "balanced",
  },  // auto-generated 2026-04-24
  'gpt-5.1-codex': {
    displayName: "GPT-5.1 Codex",
    description_ko: "코딩에 특화되었어요",
    description_en: "Specialized for coding",
    tier: "balanced",
  },  // auto-generated 2026-04-24
  'gpt-5.1-codex-mini': {
    displayName: "GPT-5.1 Codex Mini",
    description_ko: "코딩에 특화된 경량 모델이에요",
    description_en: "Lightweight, specialized for code",
    tier: "fast",
  },  // auto-generated 2026-04-24
  'gpt-5.1-codex-max': {
    displayName: "GPT-5.1 Codex Max",
    description_ko: "코딩과 문제 해결에 가장 강해요",
    description_en: "Best at code and problem-solving",
    tier: "flagship",
  },  // auto-generated 2026-04-24
  'gpt-5.2-chat-latest': {
    displayName: "GPT-5.2 Chat",
    description_ko: "최신 모델이에요",
    description_en: "Our latest model",
    tier: "balanced",
  },  // auto-generated 2026-04-24
  'gpt-5.2-codex': {
    displayName: "GPT-5.2 Codex",
    description_ko: "코딩과 추론을 잘해요",
    description_en: "Strong at coding and reasoning",
    tier: "reasoning",
  },  // auto-generated 2026-04-24
  'gpt-5.3-codex': {
    displayName: "GPT-5.3 Codex",
    description_ko: "코딩에 특화됐어요",
    description_en: "Specialized for coding",
    tier: "balanced",
  },  // auto-generated 2026-04-24
  'gpt-realtime-1.5': {
    displayName: "GPT Realtime 1.5",
    description_ko: "가장 빠르게 답변해요",
    description_en: "Responds fastest",
    tier: "fast",
  },  // auto-generated 2026-04-24
  'gpt-audio-1.5': {
    displayName: "GPT-Audio 1.5",
    description_ko: "음성 이해를 잘해요",
    description_en: "Good at understanding audio",
    tier: "balanced",
  },  // auto-generated 2026-04-24
  'gpt-4o-search-preview': {
    displayName: "GPT-4o Search Preview",
    description_ko: "최신 정보를 검색해요",
    description_en: "Searches for the latest info",
    tier: "balanced",
  },  // auto-generated 2026-04-24
  'gpt-5.3-chat-latest': {
    displayName: "GPT-5.3 Chat",
    description_ko: "일상 대화에 좋아요",
    description_en: "Good for daily conversations",
    tier: "balanced",
  },  // auto-generated 2026-04-24
  'gpt-5.4-pro': {
    displayName: "GPT-5.4 Pro",
    description_ko: "가장 강력한 문제 해결을 해요",
    description_en: "Most powerful for problems and code",
    tier: "flagship",
  },  // auto-generated 2026-04-24
  'gemini-2.0-flash-001': {
    displayName: "Gemini 2.0 Flash",
    description_ko: "빠르고 저렴해요",
    description_en: "Fast and affordable",
    tier: "fast",
  },  // auto-generated 2026-04-24
  'gemini-2.0-flash-lite-001': {
    displayName: "Gemini 2.0 Flash Lite",
    description_ko: "가장 빠르고 가벼워요",
    description_en: "Fastest and lightest",
    tier: "fast",
  },  // auto-generated 2026-04-24
  'gemini-2.0-flash-lite': {
    displayName: "Gemini 2.0 Flash Lite",
    description_ko: "가장 빠르고 가벼워요",
    description_en: "Fastest and lightest",
    tier: "fast",
  },  // auto-generated 2026-04-24
  'gemma-3-1b-it': {
    displayName: "Gemma 3.1B IT",
    description_ko: "오픈소스 구글 모델이에요",
    description_en: "Open-source Google model",
    tier: "fast",
  },  // auto-generated 2026-04-24
  'gemma-3n-e4b-it': {
    displayName: "Gemma 3 Nano",
    description_ko: "오픈소스 구글 모델이에요",
    description_en: "Open-source Google model",
    tier: "fast",
  },  // auto-generated 2026-04-24
  'gemma-3n-e2b-it': {
    displayName: "Gemma 3 Nano",
    description_ko: "가볍고 빨라요",
    description_en: "Lightweight and fast",
    tier: "fast",
  },  // auto-generated 2026-04-24
  'gemma-4-26b-a4b-it': {
    displayName: "Gemma 4 26B IT",
    description_ko: "오픈소스 구글 모델이에요",
    description_en: "Open-source Google model",
    tier: "balanced",
  },  // auto-generated 2026-04-24
  'gemma-4-31b-it': {
    displayName: "Gemma 4 31B IT",
    description_ko: "오픈소스 구글 모델이에요",
    description_en: "Open-source Google model",
    tier: "balanced",
  },  // auto-generated 2026-04-24
  'gemini-flash-latest': {
    displayName: "Gemini Flash",
    description_ko: "가장 빠르고 저렴해요",
    description_en: "Fastest and most affordable",
    tier: "fast",
  },  // auto-generated 2026-04-24
  'gemini-flash-lite-latest': {
    displayName: "Gemini Flash Lite",
    description_ko: "가장 빠르고 가벼워요",
    description_en: "Fastest and lightest",
    tier: "fast",
  },  // auto-generated 2026-04-24
  'gemini-3.1-pro-preview-customtools': {
    displayName: "Gemini 3.1 Pro Preview",
    description_ko: "도구를 잘 써요",
    description_en: "Great with custom tools",
    tier: "flagship",
  },  // auto-generated 2026-04-24
  'gemini-3.1-flash-lite-preview': {
    displayName: "Gemini 3.1 Flash Lite Preview",
    description_ko: "가볍고 빨라요",
    description_en: "Lightweight and fast",
    tier: "fast",
  },  // auto-generated 2026-04-24
  'llama-3.1-8b-instant': {
    displayName: "Llama 3.1 8B Instant",
    description_ko: "무료로 아주 빨라요",
    description_en: "Free and very fast",
    tier: "fast",
  },  // auto-generated 2026-04-24

  'gemma-3-27b-it': {
    displayName: "Gemma 3 27B",
    description_ko: "어려운 문제를 풀어요",
    description_en: "Solves complex problems",
    tier: "reasoning",
  },  // auto-generated 2026-04-24
  'gemini-pro-latest': {
    displayName: "Gemini 1.5 Pro",
    description_ko: "어려운 문제를 풀어요",
    description_en: "Solves difficult problems",
    tier: "reasoning",
  },  // auto-generated 2026-04-24
  'gemini-3-pro-preview': {
    displayName: "Gemini 3 Pro Preview",
    description_ko: "미리 써볼 수 있어요",
    description_en: "You can try it out early",
    tier: "trial",
  },  // auto-generated 2026-04-24
  'gemini-3-flash-preview': {
    displayName: "Gemini 3 Flash Preview",
    description_ko: "빠르게 응답해요",
    description_en: "Fast, early preview model",
    tier: "fast",
  },  // auto-generated 2026-04-24
  'gemini-3.1-pro-preview': {
    displayName: "Gemini 3.1 Pro",
    description_ko: "어려운 문제를 풀어요",
    description_en: "Solves complex problems",
    tier: "reasoning",
  },  // auto-generated 2026-04-24

};

// ============================================================
// Heuristic classification for unknown models
// ============================================================

/** Brand / keyword capitalization used when building displayName tokens */
const BRAND_NORMALIZE: Record<string, string> = {
  // Brand names — proper capitalization
  gpt:      'GPT',
  claude:   'Claude',
  gemini:   'Gemini',
  gemma:    'Gemma',
  deepseek: 'DeepSeek',
  llama:    'Llama',
  mixtral:  'Mixtral',
  // Variant keywords
  opus:     'Opus',
  sonnet:   'Sonnet',
  haiku:    'Haiku',
  pro:      'Pro',
  flash:    'Flash',
  mini:     'mini',   // keep lowercase (OpenAI convention)
  nano:     'nano',
  lite:     'Lite',
  ultra:    'Ultra',
  chat:     'Chat',
  reasoner: 'Reasoner',
};

function classifyUnknown(id: string, provider: ProviderId): Partial<NormalizedModel> {
  const lower = id.toLowerCase();
  let tier: NormalizedModel['tier'] = 'balanced';
  if (/opus|pro|ultra/.test(lower)) tier = 'flagship';
  else if (/haiku|mini|nano|flash|lite/.test(lower)) tier = 'fast';
  else if (/sonnet|chat|versatile/.test(lower)) tier = 'balanced';
  else if (/think|reason|o[134]|r[123]/.test(lower)) tier = 'reasoning';

  const displayName = id
    .split(/[-_]/)
    .map((w) => {
      const normalized = BRAND_NORMALIZE[w.toLowerCase()];
      if (normalized) return normalized;
      if (/^\d/.test(w)) return w; // numbers stay as-is
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
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

  // Build alias set first so we can drop dated snapshots only when a
  // non-dated alias exists (Anthropic ships Haiku 4.5 only as a dated ID).
  const rawIds: string[] = (data.data ?? []).map((m: any) => m.id);
  const allIds = new Set(rawIds);
  const hasAliasFor = (datedId: string): boolean => {
    const base = datedId.replace(/-\d{8}$|-\d{4}-\d{2}-\d{2}$/, '');
    return base !== datedId && allIds.has(base);
  };

  for (const m of data.data ?? []) {
    const id = m.id as string;
    // Skip very old models
    if (/claude-3-haiku-|claude-3-sonnet-|claude-3-opus-|claude-instant/.test(id)) continue;
    // Drop dated snapshot ONLY when its alias is present in the same response
    if ((/-\d{8}$/.test(id) || /-\d{4}-\d{2}-\d{2}$/.test(id)) && hasAliasFor(id)) continue;

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

  // ================================================================
  // AI-generate descriptions for unknown models
  // ================================================================
  const geminiKey = process.env.GOOGLE_MODELS_KEY;
  const newlyGenerated: Record<string, any> = {};

  if (geminiKey) {
    // Find models that ended up with heuristic fallback descriptions
    const needsGeneration = output.models.filter((m) => {
      const isHeuristic =
        m.description_ko === `${m.provider} 모델` ||
        m.description_en === `${m.provider} model`;
      return isHeuristic && !META_OVERRIDES[m.id];
    });

    if (needsGeneration.length > 0) {
      console.log(`\n🤖 Generating AI descriptions for ${needsGeneration.length} new models...`);

      for (const m of needsGeneration) {
        const generated = await generateMeta(
          { id: m.id, provider: m.provider, createdAt: m.createdAt },
          geminiKey
        );

        if (generated) {
          m.displayName    = generated.displayName;
          m.description_ko = generated.description_ko;
          m.description_en = generated.description_en;
          m.tier           = generated.tier;
          newlyGenerated[m.id] = generated;
        } else {
          console.warn(`  ⚠ Generation failed for ${m.id}, keeping heuristic`);
        }

        // Gemini Flash free tier: ~15 req/min — throttle slightly
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  } else {
    console.log('\n(GOOGLE_MODELS_KEY missing, skipping AI description generation)');
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

  // Persist newly AI-generated metas into META_OVERRIDES so next run is free
  if (Object.keys(newlyGenerated).length > 0) {
    await persistNewMetas(newlyGenerated);
  }

  process.exit(0);
}

// ============================================================
// Append AI-generated metas back into META_OVERRIDES in this file.
// Next run will use the static lookup instead of calling Gemini again.
// ============================================================
async function persistNewMetas(newMetas: Record<string, any>) {
  const scriptPath = join(process.cwd(), 'scripts/update-models.ts');
  const source = readFileSync(scriptPath, 'utf-8');

  const marker = '// ===== AUTO-APPEND BELOW (do not delete this line) =====';
  const markerIdx = source.indexOf(marker);
  if (markerIdx === -1) {
    console.warn('  ⚠ AUTO-APPEND marker not found in update-models.ts, skipping persistence');
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const additions = Object.entries(newMetas)
    .map(([id, meta]) =>
      `  '${id}': {\n` +
      `    displayName: ${JSON.stringify(meta.displayName)},\n` +
      `    description_ko: ${JSON.stringify(meta.description_ko)},\n` +
      `    description_en: ${JSON.stringify(meta.description_en)},\n` +
      `    tier: ${JSON.stringify(meta.tier)},\n` +
      `  },  // auto-generated ${today}`
    )
    .join('\n');

  const insertPoint = markerIdx + marker.length;
  const updated = source.slice(0, insertPoint) + '\n' + additions + '\n' + source.slice(insertPoint);

  writeFileSync(scriptPath, updated);
  console.log(`  ✓ Persisted ${Object.keys(newMetas).length} new entries to META_OVERRIDES`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
