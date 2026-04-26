// Webhook payload + queue item types.

export interface QueueItem {
  service: 'google_drive' | 'onedrive';
  fileId: string;
  changeType: 'created' | 'updated' | 'deleted';
  observedAt: number;
}

export interface QueueState {
  items: QueueItem[];
  lastUpdated: number;
}

export interface SubscriptionRecord {
  datasourceId: string;
  service: 'google_drive' | 'onedrive';
  subscriptionId: string;
  expiresAt: number;
  // OAuth 토큰은 Worker가 보관하지 않음 — Picker 등록 시 클라이언트가 만료 임박마다 재등록
  registeredAt: number;
}

export interface Env {
  DS_QUEUE: KVNamespace;
  SHARED_CLIENT_TOKEN: string;
  TIMEZONE: string;
}
