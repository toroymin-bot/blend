// Worker와 통신 — subscription 메타 등록 + 큐 폴링/ack.
// SHARED_CLIENT_TOKEN은 NEXT_PUBLIC_DS_WEBHOOK_TOKEN ENV로 노출 (의도적 — 클라이언트 사이드 사용).
//
// 노트: 토큰이 NEXT_PUBLIC이라 클라이언트 번들에 포함됨. Worker는 이 토큰만으로
// 큐 read/write 가능. 사용자 격리는 datasourceId 기반. 토큰 누출 시 다른 사용자의
// 큐 메타를 읽을 수 있다는 한계 존재 — 명세 §3.7 BYOK 모델에선 데이터(파일/키) 자체는
// 안전하므로 acceptable. v2에서 사용자별 토큰 발급 검토.

interface SubscriptionMeta {
  datasourceId: string;
  service: 'google_drive' | 'onedrive';
  subscriptionId: string;
  expiresAt: number;
  registeredAt: number;
}

interface QueueItem {
  service: 'google_drive' | 'onedrive';
  fileId: string;
  changeType: 'created' | 'updated' | 'deleted';
  observedAt: number;
}

interface QueueState {
  items: QueueItem[];
  lastUpdated: number;
}

function workerUrl(): string {
  return process.env.NEXT_PUBLIC_DS_WEBHOOK_URL ?? '';
}
function workerToken(): string {
  return process.env.NEXT_PUBLIC_DS_WEBHOOK_TOKEN ?? '';
}

function authHeader() {
  return { Authorization: `Bearer ${workerToken()}`, 'Content-Type': 'application/json' };
}

export async function registerSubscriptionMeta(meta: SubscriptionMeta): Promise<void> {
  const url = workerUrl();
  if (!url) return; // worker 미배포 환경 → noop
  await fetch(`${url}/subscription/register`, {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify(meta),
  });
}

export async function fetchQueueForDataSource(datasourceId: string): Promise<QueueState> {
  const url = workerUrl();
  if (!url) return { items: [], lastUpdated: 0 };
  const res = await fetch(`${url}/queue/${encodeURIComponent(datasourceId)}`, {
    headers: { Authorization: `Bearer ${workerToken()}` },
  });
  if (!res.ok) return { items: [], lastUpdated: 0 };
  return (await res.json()) as QueueState;
}

export async function ackQueueItems(datasourceId: string, fileIds: string[]): Promise<number> {
  const url = workerUrl();
  if (!url || fileIds.length === 0) return 0;
  const res = await fetch(`${url}/queue/${encodeURIComponent(datasourceId)}/ack`, {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify({ fileIds }),
  });
  if (!res.ok) return 0;
  const data = (await res.json()) as { removed?: number };
  return data.removed ?? 0;
}

export type { QueueItem, QueueState, SubscriptionMeta };
