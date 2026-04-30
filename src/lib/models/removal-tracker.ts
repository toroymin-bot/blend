/**
 * Model Removal Tracker — Tori 21102594 PR #4.
 *
 * Registry는 build-time JSON이라 런타임에 한도 적용하지 않음 (읽기 전용 FS).
 * 대신: 사용자가 마지막으로 본 모델 ID 셋을 localStorage 에 저장 → 다음 방문 시
 * 현재 registry와 비교해 사라진 모델만 알림 큐에 추가.
 *
 * 알림은 다음과 같이 표시:
 *   - 사용자가 활성 채팅에서 쓰던 모델이 사라진 경우만 즉시 노출
 *   - 그 외(rarely-used) 모델은 dismiss 한 번에 영구 무시
 *
 * 20개 한도(Tori spec §4)는 build-time `scripts/update-models.ts`에서 적용 권장.
 * 이 모듈은 사용자 영향 알림에 집중.
 */

import { AVAILABLE_MODELS } from '@/data/available-models';

const LS_LAST_SEEN  = 'blend:last-seen-model-ids';
const LS_DISMISSED  = 'blend:dismissed-removal-notices';

export interface RemovedModelNotice {
  id: string;
  removedAt: number;
}

/**
 * 페이지 진입 시 호출 (mount once). 현 registry와 비교해 사라진 모델 반환.
 * dismissed 처리된 모델은 제외.
 */
export function detectRemovedModels(): RemovedModelNotice[] {
  if (typeof window === 'undefined') return [];

  const currentIds = new Set(AVAILABLE_MODELS.map((m) => m.id));
  let lastSeen: string[] = [];
  try {
    lastSeen = JSON.parse(localStorage.getItem(LS_LAST_SEEN) || '[]');
  } catch { /* ignore */ }

  let dismissed: string[] = [];
  try {
    dismissed = JSON.parse(localStorage.getItem(LS_DISMISSED) || '[]');
  } catch { /* ignore */ }
  const dismissedSet = new Set(dismissed);

  const removed: RemovedModelNotice[] = [];
  const now = Date.now();
  for (const id of lastSeen) {
    if (!currentIds.has(id) && !dismissedSet.has(id)) {
      removed.push({ id, removedAt: now });
    }
  }

  // Update last-seen (다음 비교 baseline)
  try {
    localStorage.setItem(LS_LAST_SEEN, JSON.stringify([...currentIds]));
  } catch { /* quota — 무시 */ }

  return removed;
}

export function dismissRemovalNotice(modelId: string): void {
  if (typeof window === 'undefined') return;
  let dismissed: string[] = [];
  try {
    dismissed = JSON.parse(localStorage.getItem(LS_DISMISSED) || '[]');
  } catch { /* ignore */ }
  if (!dismissed.includes(modelId)) {
    dismissed.push(modelId);
    try {
      localStorage.setItem(LS_DISMISSED, JSON.stringify(dismissed));
    } catch { /* ignore */ }
  }
}

export function dismissAllRemovalNotices(): void {
  if (typeof window === 'undefined') return;
  const currentIds = AVAILABLE_MODELS.map((m) => m.id);
  let lastSeen: string[] = [];
  try {
    lastSeen = JSON.parse(localStorage.getItem(LS_LAST_SEEN) || '[]');
  } catch { /* ignore */ }
  let dismissed: string[] = [];
  try {
    dismissed = JSON.parse(localStorage.getItem(LS_DISMISSED) || '[]');
  } catch { /* ignore */ }
  const dismissedSet = new Set(dismissed);
  for (const id of lastSeen) {
    if (!currentIds.includes(id)) dismissedSet.add(id);
  }
  try {
    localStorage.setItem(LS_DISMISSED, JSON.stringify([...dismissedSet]));
  } catch { /* ignore */ }
}
