// Blend - Model Registry Module (Reusable: any multi-LLM project)
// Defines all supported AI models with pricing and capabilities

import { AIModel } from '@/types';

export const DEFAULT_MODELS: AIModel[] = [
  // ── OpenAI ─────────────────────────────────────────────────────────────────
  {
    id: 'gpt-4.1',
    name: 'GPT-4.1',
    provider: 'openai',
    contextLength: 1047576,
    inputPrice: 2,
    outputPrice: 8,
    features: ['vision', 'streaming', 'function_calling'],
    enabled: true,
  },
  {
    id: 'gpt-4.1-mini',
    name: 'GPT-4.1 Mini',
    provider: 'openai',
    contextLength: 1047576,
    inputPrice: 0.4,
    outputPrice: 1.6,
    features: ['vision', 'streaming', 'function_calling'],
    enabled: true,
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    contextLength: 128000,
    inputPrice: 2.5,
    outputPrice: 10,
    features: ['vision', 'streaming', 'function_calling'],
    enabled: true,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    contextLength: 128000,
    inputPrice: 0.15,
    outputPrice: 0.6,
    features: ['vision', 'streaming', 'function_calling'],
    enabled: true,
  },
  {
    id: 'o3',
    name: 'o3',
    provider: 'openai',
    contextLength: 200000,
    inputPrice: 10,
    outputPrice: 40,
    features: ['streaming', 'thinking'],
    enabled: true,
  },
  {
    id: 'o4-mini',
    name: 'o4-mini',
    provider: 'openai',
    contextLength: 200000,
    inputPrice: 1.1,
    outputPrice: 4.4,
    features: ['vision', 'streaming', 'thinking'],
    enabled: true,
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    provider: 'openai',
    contextLength: 16385,
    inputPrice: 0.5,
    outputPrice: 1.5,
    features: ['streaming', 'function_calling'],
    enabled: false,
  },
  // ── Anthropic ──────────────────────────────────────────────────────────────
  {
    id: 'claude-opus-4-6',
    name: 'Claude Opus 4.6',
    provider: 'anthropic',
    contextLength: 200000,
    inputPrice: 15,
    outputPrice: 75,
    features: ['vision', 'streaming', 'thinking'],
    enabled: true,
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    contextLength: 200000,
    inputPrice: 3,
    outputPrice: 15,
    features: ['vision', 'streaming', 'thinking'],
    enabled: true,
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    contextLength: 200000,
    inputPrice: 0.8,
    outputPrice: 4,
    features: ['vision', 'streaming'],
    enabled: true,
  },
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    contextLength: 200000,
    inputPrice: 3,
    outputPrice: 15,
    features: ['vision', 'streaming'],
    enabled: false,
  },
  {
    id: 'claude-3-haiku-20240307',
    name: 'Claude 3 Haiku',
    provider: 'anthropic',
    contextLength: 200000,
    inputPrice: 0.25,
    outputPrice: 1.25,
    features: ['vision', 'streaming'],
    enabled: false,
  },
  // ── Google ─────────────────────────────────────────────────────────────────
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'google',
    contextLength: 1048576,
    inputPrice: 1.25,
    outputPrice: 10,
    features: ['vision', 'streaming', 'thinking'],
    enabled: true,
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'google',
    contextLength: 1048576,
    inputPrice: 0.15,
    outputPrice: 0.6,
    features: ['vision', 'streaming', 'thinking'],
    enabled: true,
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    contextLength: 1048576,
    inputPrice: 0.1,
    outputPrice: 0.4,
    features: ['vision', 'streaming'],
    enabled: true,
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    provider: 'google',
    contextLength: 2000000,
    inputPrice: 1.25,
    outputPrice: 5,
    features: ['vision', 'streaming'],
    enabled: false,
  },
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    provider: 'google',
    contextLength: 1048576,
    inputPrice: 0.075,
    outputPrice: 0.3,
    features: ['vision', 'streaming'],
    enabled: false,
  },
];

export function getModelById(id: string, customModels: AIModel[] = []): AIModel | undefined {
  return [...DEFAULT_MODELS, ...customModels].find((m) => m.id === id);
}

export function getModelsByProvider(provider: string): AIModel[] {
  return DEFAULT_MODELS.filter((m) => m.provider === provider);
}

export function calculateCost(model: AIModel, inputTokens: number, outputTokens: number): number {
  return (inputTokens * model.inputPrice + outputTokens * model.outputPrice) / 1_000_000;
}

export function getProviderColor(provider: string): string {
  const colors: Record<string, string> = {
    openai: '#10a37f',
    anthropic: '#d4a574',
    google: '#4285f4',
    custom: '#6b7280',
  };
  return colors[provider] || colors.custom;
}
