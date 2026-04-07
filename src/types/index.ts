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
  isError?: boolean;
}

export interface Chat {
  id: string;
  title: string;
  messages: ChatMessage[];
  model: string;
  folderId?: string;
  pinned?: boolean;
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
  baseUrl?: string;    // custom endpoint (OpenAI-compatible)
  description?: string; // short user-facing description
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

// ── Multi-Source RAG (Enterprise) ─────────────────────────────────────────────

export type DataSourceType = 'local' | 'google-drive' | 'onedrive' | 'webdav';
export type DataSourceStatus = 'idle' | 'syncing' | 'error' | 'connected';

export interface LocalSourceConfig {
  type: 'local';
  label: string; // user-visible name for the directory
}

export interface GoogleDriveConfig {
  type: 'google-drive';
  clientId: string;
  accessToken?: string;
  tokenExpiry?: number;
  folderId?: string;
  folderName?: string;
}

export interface OneDriveConfig {
  type: 'onedrive';
  clientId: string;
  tenantId?: string; // 'common' for personal/multi-tenant
  accessToken?: string;
  tokenExpiry?: number;
  folderId?: string;
  folderName?: string;
}

export interface WebDAVConfig {
  type: 'webdav';
  serverUrl: string;    // e.g. http://192.168.1.10:5005
  basePath?: string;    // e.g. /RAG
  username: string;
  password: string;
}

export type DataSourceConfig =
  | LocalSourceConfig
  | GoogleDriveConfig
  | OneDriveConfig
  | WebDAVConfig;

export interface DataSource {
  id: string;
  name: string;
  type: DataSourceType;
  status: DataSourceStatus;
  config: DataSourceConfig;
  fileCount?: number;
  indexedCount?: number;
  lastSync?: number;
  error?: string;
}
