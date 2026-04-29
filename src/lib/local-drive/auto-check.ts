/**
 * Local Drive — Auto-check on page load (Tori 19857410 §4).
 *
 * 데이터 소스 페이지 진입 시 호출. 각 로컬 소스에 대해:
 *  1) IndexedDB 핸들 복구 (loadHandle)
 *  2) 권한 확인 (queryPermission — 사용자 제스처 X — granted 만 가능)
 *  3) 변경 감지 (lastModified 비교)
 *  → 결과를 콜백으로 통보. UI는 카드 dot 색상·문구 갱신.
 *
 * 사용자 제스처 없이 requestPermission 부르면 거부됨 → 'permission_required' 상태로
 * 마킹만 하고, [다시 연결] 버튼 클릭 시 verifyPermission 호출.
 */

import { loadHandle } from './handle-store';
import { scanLocalDirectory } from '@/lib/connectors/local-connector';

export type LocalCheckOutcome =
  | 'connected'           // 권한 OK + 변경 없음
  | 'has_updates'         // 권한 OK + 변경 감지
  | 'permission_required' // 권한 만료 — 다시 연결 필요
  | 'missing'             // 핸들 자체가 사라짐 (브라우저 데이터 삭제 등)
  | 'error';              // 알 수 없는 오류

export interface LocalCheckResult {
  sourceId: string;
  outcome: LocalCheckOutcome;
  /** has_updates 인 경우 추가 / 변경 / 삭제된 파일 수. */
  changes?: { added: number; modified: number; removed: number };
  /** 변경 감지 시점에 스캔된 최신 파일 수. */
  currentFileCount?: number;
}

export interface IndexedFileSnapshot {
  path: string;
  lastModified: number;
}

export interface LocalCheckInput {
  sourceId: string;
  /** 이전 동기화 시 인덱싱된 파일 메타. 없으면 변경 감지 skip. */
  prevSnapshot?: IndexedFileSnapshot[];
}

export async function checkOneLocalSource(
  input: LocalCheckInput
): Promise<LocalCheckResult> {
  if (typeof window === 'undefined') {
    return { sourceId: input.sourceId, outcome: 'error' };
  }

  let handle;
  try {
    handle = await loadHandle(input.sourceId);
  } catch {
    return { sourceId: input.sourceId, outcome: 'error' };
  }
  if (!handle) {
    return { sourceId: input.sourceId, outcome: 'missing' };
  }

  // queryPermission만 사용 — 사용자 제스처 없이 안전.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const h = handle as any;
  let permission: PermissionState | undefined;
  try {
    if (typeof h.queryPermission === 'function') {
      permission = await h.queryPermission({ mode: 'read' });
    }
  } catch {
    permission = undefined;
  }
  if (permission !== 'granted') {
    return { sourceId: input.sourceId, outcome: 'permission_required' };
  }

  // 디렉토리만 변경 감지 — 단일 파일 핸들은 lastModified 직접 비교
  if (handle.kind === 'file') {
    try {
      const file = await (handle as FileSystemFileHandle).getFile();
      const prev = input.prevSnapshot?.[0]?.lastModified ?? 0;
      if (prev && file.lastModified !== prev) {
        return {
          sourceId: input.sourceId,
          outcome: 'has_updates',
          changes: { added: 0, modified: 1, removed: 0 },
          currentFileCount: 1,
        };
      }
      return { sourceId: input.sourceId, outcome: 'connected', currentFileCount: 1 };
    } catch {
      return { sourceId: input.sourceId, outcome: 'error' };
    }
  }

  // Directory handle → 재귀 스캔
  try {
    const current = await scanLocalDirectory(handle as FileSystemDirectoryHandle);
    const currentFileCount = current.length;
    if (!input.prevSnapshot) {
      return { sourceId: input.sourceId, outcome: 'connected', currentFileCount };
    }
    const prevByPath = new Map(input.prevSnapshot.map((s) => [s.path, s.lastModified]));
    const currentByPath = new Map(current.map((c) => [c.path, c.lastModified]));

    let added = 0;
    let modified = 0;
    let removed = 0;
    for (const c of current) {
      const prev = prevByPath.get(c.path);
      if (prev === undefined) added += 1;
      else if (prev !== c.lastModified) modified += 1;
    }
    for (const s of input.prevSnapshot) {
      if (!currentByPath.has(s.path)) removed += 1;
    }
    if (added > 0 || modified > 0 || removed > 0) {
      return {
        sourceId: input.sourceId,
        outcome: 'has_updates',
        changes: { added, modified, removed },
        currentFileCount,
      };
    }
    return { sourceId: input.sourceId, outcome: 'connected', currentFileCount };
  } catch {
    return { sourceId: input.sourceId, outcome: 'error' };
  }
}

/**
 * 모든 로컬 소스 일괄 체크. 병렬 실행 (개별 실패는 격리).
 */
export async function checkAllLocalSources(
  inputs: LocalCheckInput[]
): Promise<LocalCheckResult[]> {
  if (inputs.length === 0) return [];
  const results = await Promise.all(
    inputs.map((i) =>
      checkOneLocalSource(i).catch((): LocalCheckResult => ({
        sourceId: i.sourceId,
        outcome: 'error',
      }))
    )
  );
  return results;
}
