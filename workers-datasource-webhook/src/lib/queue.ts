// KV 큐 — datasourceId 별로 변경 이벤트 누적.
//
// Key: queue:{datasourceId}
// Value: QueueState JSON (60일 TTL)

import type { Env, QueueItem, QueueState } from '../types';

const QUEUE_TTL_SEC = 60 * 60 * 24 * 60; // 60일
const MAX_ITEMS = 500;                    // 큐 크기 제한 (FIFO)

export async function enqueue(env: Env, datasourceId: string, item: QueueItem): Promise<void> {
  const key = `queue:${datasourceId}`;
  const raw = await env.DS_QUEUE.get(key);
  const state: QueueState = raw
    ? (JSON.parse(raw) as QueueState)
    : { items: [], lastUpdated: 0 };
  // 중복 제거 — 같은 fileId+changeType이 이미 있으면 timestamp만 갱신
  const existingIdx = state.items.findIndex((i) => i.fileId === item.fileId && i.changeType === item.changeType);
  if (existingIdx >= 0) {
    state.items[existingIdx].observedAt = item.observedAt;
  } else {
    state.items.push(item);
    if (state.items.length > MAX_ITEMS) state.items.splice(0, state.items.length - MAX_ITEMS);
  }
  state.lastUpdated = Date.now();
  await env.DS_QUEUE.put(key, JSON.stringify(state), { expirationTtl: QUEUE_TTL_SEC });
}

export async function fetchQueue(env: Env, datasourceId: string): Promise<QueueState> {
  const raw = await env.DS_QUEUE.get(`queue:${datasourceId}`);
  return raw ? (JSON.parse(raw) as QueueState) : { items: [], lastUpdated: 0 };
}

export async function ackQueue(env: Env, datasourceId: string, fileIds: string[]): Promise<number> {
  const key = `queue:${datasourceId}`;
  const raw = await env.DS_QUEUE.get(key);
  if (!raw) return 0;
  const state = JSON.parse(raw) as QueueState;
  const removeSet = new Set(fileIds);
  const before = state.items.length;
  state.items = state.items.filter((i) => !removeSet.has(i.fileId));
  state.lastUpdated = Date.now();
  await env.DS_QUEUE.put(key, JSON.stringify(state), { expirationTtl: QUEUE_TTL_SEC });
  return before - state.items.length;
}
