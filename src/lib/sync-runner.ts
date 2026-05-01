// [2026-05-01 Roy] 백그라운드 동기화 — 컴포넌트 lifecycle 분리.
// 이전엔 D1DataSourcesView 안의 useState/useRef로 관리해서 사용자가 다른 메뉴
// 가면 컴포넌트 unmount → progress 사라지고 동기화도 끊겨 보였음.
// 이 모듈은:
//   - 진행률을 zustand store(source.syncStage / syncCurrent / syncProgress)에 직접 기록
//   - AbortController를 module-level Map에 보관 — 컴포넌트 lifecycle 무관
//   - runSync는 promise로 진행, 컴포넌트가 사라져도 store가 갱신되어 다시
//     마운트 시 자연스럽게 진행 화면 복원

import type { DataSource } from '@/types';
import { useDataSourceStore } from '@/stores/datasource-store';
import { useAPIKeyStore } from '@/stores/api-key-store';
import { useDocumentStore } from '@/stores/document-store';
import { indexSource } from '@/lib/source-indexer';
import { scanLocalDirectory } from '@/lib/connectors/local-connector';
import { verifyPermission } from '@/lib/local-drive/handle-store';

// sourceId → AbortController. module-level이라 컴포넌트 unmount해도 살아 있음.
const abortControllers = new Map<string, AbortController>();

export function isSyncing(sourceId: string): boolean {
  return abortControllers.has(sourceId);
}

export function cancelSync(sourceId: string): void {
  const ctrl = abortControllers.get(sourceId);
  if (ctrl) ctrl.abort();
  abortControllers.delete(sourceId);
  const ds = useDataSourceStore.getState();
  ds.setStatus(sourceId, 'idle');
  ds.updateSource(sourceId, {
    syncStage: 'done',
    syncCurrent: '',
    syncProgress: 0,
  });
}

interface RunSyncOptions {
  /** 'ko' | 'en' — 친절 에러 메시지 분기에 사용 */
  lang: 'ko' | 'en';
}

export async function runSync(sourceId: string, opts: RunSyncOptions): Promise<void> {
  const dsStore = useDataSourceStore.getState();
  const source = dsStore.sources.find((s) => s.id === sourceId);
  if (!source) return;

  // 같은 source에 이전 진행 있으면 abort
  abortControllers.get(sourceId)?.abort();
  const ctrl = new AbortController();
  abortControllers.set(sourceId, ctrl);

  dsStore.setStatus(sourceId, 'syncing');
  dsStore.updateSource(sourceId, {
    syncProgress: 0,
    syncedCount: 0,
    syncStage: 'scanning',
    syncCurrent: '',
  });

  try {
    // 임베딩 키 확보 — OpenAI 또는 Google. 없으면 명확히 거부.
    const apiStore = useAPIKeyStore.getState();
    const openaiKey = apiStore.getKey('openai');
    const googleKey = apiStore.getKey('google');
    const embeddingKey = openaiKey || googleKey;
    const embeddingProvider = openaiKey ? 'openai' : googleKey ? 'google' : null;
    if (!embeddingKey || !embeddingProvider) {
      dsStore.setStatus(sourceId, 'error', opts.lang === 'ko'
        ? 'OpenAI 또는 Google API 키가 필요해요 (설정 → API 키)'
        : 'OpenAI or Google API key required (Settings → API Keys)');
      return;
    }

    // 로컬 드라이브는 핸들 권한 재확인.
    let dirHandle: FileSystemDirectoryHandle | undefined;
    if (source.config.type === 'local') {
      const handle = dsStore.getHandle(sourceId);
      if (!handle) {
        dsStore.setStatus(sourceId, 'permission_required');
        return;
      }
      const ok = await verifyPermission(handle, 'read');
      if (!ok) {
        dsStore.setStatus(sourceId, 'permission_required');
        return;
      }
      dirHandle = handle;
    }

    const result = await indexSource(
      source,
      embeddingKey,
      embeddingProvider,
      dirHandle,
      (p) => {
        // store에 직접 기록 — 컴포넌트가 마운트되어 있든 없든 갱신됨.
        useDataSourceStore.getState().updateSource(sourceId, {
          syncStage: p.stage,
          syncCurrent: p.current,
          syncProgress: p.total > 0 ? Math.round((p.done / p.total) * 100) : 0,
          syncedCount: p.done,
          totalCount: p.total,
        });
      },
      ctrl.signal,
    );

    if (result.cancelled) {
      dsStore.setStatus(sourceId, 'idle');
      dsStore.updateSource(sourceId, { syncStage: 'done', syncCurrent: '' });
      return;
    }

    // 로컬은 snapshot도 갱신 (변경 감지 baseline)
    if (source.config.type === 'local' && dirHandle) {
      const files = await scanLocalDirectory(dirHandle);
      dsStore.updateSource(sourceId, {
        localFileSnapshot: files.map((f) => ({ path: f.path, lastModified: f.lastModified })),
      });
    }

    // [2026-05-01 Roy] 결과 분류:
    //   indexed > 0 && errors > 0 → 'partial' (일부 성공/일부 실패)
    //   indexed === 0 && errors > 0 → 'error' (전체 실패)
    //   errors === 0 → 'connected' (모두 성공)
    // 사용자가 '동기화 일부 실패'를 'sync 전체 실패'로 오인하지 않게 status 분리.
    const totalFiles = result.indexed + result.errors.length;
    const isPartial = result.errors.length > 0 && result.indexed > 0;
    const isFullError = result.errors.length > 0 && result.indexed === 0;

    const errorMsg = (() => {
      if (result.errors.length === 0) return undefined;
      const ko = opts.lang === 'ko';
      // 부분 성공이면 'X/Y개 성공, Z개 실패' 톤. 전체 실패면 'X/Y개 실패' 톤.
      const summary = isPartial
        ? (ko
            ? `${result.indexed}/${totalFiles}개 동기화 성공, ${result.errors.length}개 실패`
            : `${result.indexed}/${totalFiles} synced, ${result.errors.length} failed`)
        : (ko
            ? `${result.errors.length}/${totalFiles}개 파일 실패`
            : `${result.errors.length}/${totalFiles} files failed`);
      if (result.errors[0]) {
        const firstReason = result.errors[0].replace(/^[^:]+:\s*/, '').slice(0, 200);
        return `${summary} — ${firstReason}`;
      }
      return summary;
    })();
    dsStore.updateSource(sourceId, {
      fileCount: result.indexed,
      indexedCount: result.indexed,
      syncProgress: 100,
      syncStage: 'done',
      syncCurrent: '',
      lastSync: Date.now(),
      error: errorMsg,
      // [2026-05-01 Roy] 카드에서 'X 성공 · Y 실패' 명시 표시용
      successCount: result.indexed,
      errorCount: result.errors.length,
    });
    // [2026-05-01 Roy] setStatus의 3번째 인자가 undefined면 error를 덮어쓰는 store 동작 회피.
    // errorMsg를 명시적으로 같이 넘겨야 'error string + status' 둘 다 일관되게 유지됨.
    const finalStatus = isFullError ? 'error' : isPartial ? 'partial' : 'connected';
    dsStore.setStatus(sourceId, finalStatus, errorMsg);
    // RAG 채팅에서 즉시 새 청크 인식되도록 문서 store 강제 reload
    void useDocumentStore.getState().loadFromDB({ force: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Sync failed';
    dsStore.setStatus(sourceId, 'error', msg);
    dsStore.updateSource(sourceId, { syncStage: 'done', syncCurrent: '' });
  } finally {
    abortControllers.delete(sourceId);
  }
}
