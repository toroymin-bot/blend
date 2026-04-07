// Blend - Model Registry Module (Reusable: any multi-LLM project)
// Defines all supported AI models with pricing and capabilities

import { AIModel } from '@/types';

export const DEFAULT_MODELS: AIModel[] = [
  // OpenAI
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
  // Anthropic
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
    id: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    contextLength: 200000,
    inputPrice: 0.8,
    outputPrice: 4,
    features: ['vision', 'streaming'],
    enabled: true,
  },
  // Google
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
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'google',
    contextLength: 1048576,
    inputPrice: 1.25,
    outputPrice: 10,
    features: ['vision', 'streaming', 'thinking'],
    enabled: true,
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
