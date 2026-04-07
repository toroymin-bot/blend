// Blend - Core Type Definitions (Modular, Reusable)

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: string[];   // base64 data URLs for multimodal (vision) messages
  model?: string;
  createdAt: number;
  tokens?: { input: number; output: number };
  cost?: number;
}

export interface Chat {
  id: string;
  title: string;
  messages: ChatMessage[];
  model: string;
  folderId?: string;
  createdAt: number;
  updatedAt: number;
  tags?: string[];
}

export interface ChatFolder {
  id: string;
  name: string;
  color?: string;
  order: number;
}

export interface AIModel {
  id: string;
  name: string;
  provider: AIProvider;
  contextLength: number;
  inputPrice: number;  // per 1M tokens
  outputPrice: number; // per 1M tokens
  features: ModelFeature[];
  enabled: boolean;
}

export type AIProvider = 'openai' | 'anthropic' | 'google' | 'custom';

export type ModelFeature = 'vision' | 'streaming' | 'function_calling' | 'thinking';

export interface APIKeyConfig {
  provider: AIProvider;
  key: string;
  isValid?: boolean;
  lastChecked?: number;
}

export interface Prompt {
  id: string;
  title: string;
  content: string;
  tags: string[];
  variables?: string[];
  isFavorite: boolean;
  createdAt: number;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  model: string;
  icon?: string;
  plugins?: string[];
  createdAt: number;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  language: 'ko' | 'en';
  fontSize: number;
  sendOnEnter: boolean;
  streamResponse: boolean;
  defaultModel: string;
  dailyCostLimit: number; // USD, 0 = disabled
}

export interface UsageStats {
  date: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  requestCount: number;
}
