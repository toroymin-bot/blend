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
  agentId?: string | null;  // 채팅별 에이전트 (null = 수동 모델, AUTO_MATCH_AGENT_ID = 자동 매칭)
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
  description?: string;   // short user-facing description (English)
  descriptionKo?: string; // Korean description
}

export type AIProvider = 'openai' | 'anthropic' | 'google' | 'deepseek' | 'groq' | 'custom';

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
  description?: string;
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
  usageCount?: number;
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
// [2026-04-29 Tori 19857410 §4.3] has_updates / permission_required 추가 — 로컬 소스 자동 체크 결과 표시.
export type DataSourceStatus =
  | 'idle'
  | 'syncing'
  | 'error'
  | 'connected'
  | 'has_updates'
  | 'permission_required';

export interface LocalSourceConfig {
  type: 'local';
  label: string; // user-visible name for the directory
  // [2026-04-29 Tori 19857410 §3] 브라우저 capability — UI 안내·자동 체크 분기에 사용.
  capability?: 'fs_access_api' | 'drag_drop_only';
  /** Drag&Drop 모드에선 매 세션 재선택 필요. */
  needsReselection?: boolean;
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
  // Tori 핫픽스 (2026-04-25): 채팅에서 RAG 활성화 여부 (연결 시 자동 true)
  isActive?: boolean;

  // [2026-04-26 Tori 16384118 §3] Picker + 자동 동기화 + 비용
  selections?: DataSourceSelection[];      // 사용자가 명시 선택한 폴더/파일 (max 20)
  syncProgress?: number;                   // 0-100
  syncedCount?: number;
  totalCount?: number;
  errorReason?: 'no_key' | 'oauth_expired' | 'limit_exceeded' | 'unknown';
  webhookSubscriptionId?: string;          // Worker가 발급
  webhookExpiresAt?: number;               // 갱신 필요 시점 (ms)
  todayEmbeddingCost?: number;             // $ 단위 (자정 리셋)
  totalEmbeddingCost?: number;

  // [2026-04-29 Tori 19857410 §4.2] 로컬 변경 감지용 — 마지막 동기화 시점 파일 메타.
  // path → lastModified 매핑. 페이지 진입 시 현재와 비교해 has_updates 판단.
  localFileSnapshot?: Array<{ path: string; lastModified: number }>;
}

// [2026-04-26 Tori 16384118 §3.1] 폴더/파일 명시 선택
export type SelectionKind = 'file' | 'folder';

export interface DataSourceSelection {
  id: string;                              // Drive/OneDrive file/folder ID
  kind: SelectionKind;
  name: string;
  path: string;                            // 사용자 표시용 절대 경로

  // 폴더 전용
  includeSubfolders?: boolean;             // 기본 false
  fileCountCap?: number;                   // 기본 200

  // 인덱싱 상태 (현재 selection 단위)
  indexedFileCount: number;
  totalFileCount: number;
  approxBytes?: number;                    // 비용 추정용
}

// ── Meeting Analysis ──────────────────────────────────────────────────────────

export interface TranscriptSegment {
  speaker: string;      // "화자 1", "화자 2", ...
  text: string;
  startTime?: number;   // 초 단위
  endTime?: number;
}

export interface ActionItem {
  task: string;
  owner?: string;       // 담당자 (화자 이름)
  deadline?: string;
  priority: 'high' | 'medium' | 'low';
}

export interface MeetingAnalysis {
  id: string;
  title: string;
  source: 'file' | 'youtube';
  sourceUrl?: string;
  createdAt: number;
  rawTranscript: string;
  segments: TranscriptSegment[];
  topics: string[];
  actionItems: ActionItem[];
  decisions: string[];
  summary: {
    oneLiner: string;
    bullets: string[];
    full: string;
  };
  mindmap?: string; // [2026-04-16] markdown mindmap structure generated by AI
}
