'use client';

// [2026-04-26 Tori 16384118 §3.7] 클라이언트 큐 폴링 hook
// Worker에 큐 메타가 있으면 클라이언트가 자체 OAuth 토큰으로 changes/delta API 호출 →
// 변경분 다운로드 → 임베딩 → IDB 저장 → ack.
// Worker는 fileId='*' 또는 '__renew__'만 마커로 보관하므로 BYOK 모델 유지.

import { useEffect, useRef } from 'react';
import { useDataSourceStore } from '@/stores/datasource-store';
import { useAPIKeyStore } from '@/stores/api-key-store';
import { useCostStore } from '@/stores/d1-cost-store';
import { fetchQueueForDataSource, ackQueueItems } from '@/lib/sync/webhook-registry';
import {
  fetchGoogleDriveChanges,
  subscribeGoogleDriveChanges,
} from '@/lib/sync/google-drive-subscribe';
import {
  fetchOneDriveDelta,
  subscribeOneDriveChanges,
} from '@/lib/sync/onedrive-subscribe';
import {
  downloadDriveFile,
  isTokenValid as googleTokenValid,
  type DriveFile,
} from '@/lib/connectors/google-drive-connector';
import {
  downloadOneDriveFile,
  isTokenValid as msTokenValid,
} from '@/lib/connectors/onedrive-connector';
import { parseDocument, generateEmbeddings } from '@/modules/plugins/document-plugin';
import { safeSetItem } from '@/lib/safe-storage';
import { saveDocument, getActiveDocIds, setActiveDocIds } from '@/lib/vector-db';
import type { DataSource, GoogleDriveConfig, OneDriveConfig } from '@/types';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5분
const PAGE_TOKEN_KEY = (id: string) => `blend:sync:${id}:pageToken`;
const DELTA_LINK_KEY = (id: string) => `blend:sync:${id}:deltaLink`;

function sourceTag(sourceId: string): string {
  return `__source:${sourceId}`;
}

function lsGet(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}
function lsSet(key: string, value: string) {
  // [2026-05-03 BUG-005-REGRESSION] safeSetItem으로 통일 — quota 초과 시 toast로 사용자 인지.
  safeSetItem(key, value, 'datasource-queue');
}

async function syncOneSource(
  source: DataSource,
  embeddingKey: string,
  embeddingProvider: 'openai' | 'google',
): Promise<void> {
  if (!process.env.NEXT_PUBLIC_DS_WEBHOOK_URL) return;

  const queue = await fetchQueueForDataSource(source.id);
  if (!queue.items.length) return;

  // 자동 동기화 일시정지 상태면 큐를 ack하지 않고 그대로 유지 (재개 시 처리).
  if (useCostStore.getState().paused) return;

  const fileIdsToAck: string[] = [];
  let needsRenew = false;

  // 마커 처리
  for (const item of queue.items) {
    if (item.fileId === '__renew__') {
      needsRenew = true;
      fileIdsToAck.push('__renew__');
    }
  }

  if (source.type === 'google-drive') {
    const cfg = source.config as GoogleDriveConfig;
    if (!cfg.accessToken || !googleTokenValid(cfg.tokenExpiry)) {
      // 토큰 만료 — 큐는 그대로 두고 종료. 사용자가 재연결 시 처리됨.
      useDataSourceStore.getState().updateSource(source.id, {
        errorReason: 'oauth_expired',
        status: 'error',
      });
      return;
    }
    if (needsRenew) {
      try {
        await subscribeGoogleDriveChanges(source.id, cfg.accessToken);
      } catch (e) {
        console.warn('[queue-polling] google renew failed:', (e as Error).message);
      }
    }

    const pageToken = lsGet(PAGE_TOKEN_KEY(source.id));
    if (!pageToken) {
      // 초기 토큰 미보유 — wildcard 들어왔으면 ack만 하고 다음 사이클에 picker가 등록한 startPageToken 사용.
      for (const it of queue.items) if (it.fileId === '*') fileIdsToAck.push('*');
      if (fileIdsToAck.length) await ackQueueItems(source.id, fileIdsToAck);
      return;
    }

    const { files, newStartPageToken } = await fetchGoogleDriveChanges({
      accessToken: cfg.accessToken,
      pageToken,
    });
    lsSet(PAGE_TOKEN_KEY(source.id), newStartPageToken);

    for (const f of files) {
      try {
        if (useCostStore.getState().paused) break;
        const driveFile: DriveFile = {
          id: f.id,
          name: f.name ?? f.id,
          mimeType: f.mimeType ?? 'application/octet-stream',
          modifiedTime: f.modifiedTime ?? '',
        };
        const raw = await downloadDriveFile(cfg.accessToken, driveFile);
        // [2026-05-01 Roy] queue polling — image PDF OCR fallback 활성.
        let doc = await parseDocument(raw, embeddingProvider
          ? { apiKey: embeddingKey, provider: embeddingProvider }
          : undefined);
        doc = { ...doc, name: `${sourceTag(source.id)}/${driveFile.name}` };
        if (embeddingKey) {
          doc = await generateEmbeddings(doc, embeddingKey, embeddingProvider);
        }
        await saveDocument(doc);
        const active = await getActiveDocIds();
        if (!active.includes(doc.id)) await setActiveDocIds([...active, doc.id]);
        fileIdsToAck.push(f.id);
      } catch (e) {
        console.warn('[queue-polling] google file failed:', f.id, (e as Error).message);
      }
    }
    // wildcard도 ack
    for (const it of queue.items) if (it.fileId === '*') fileIdsToAck.push('*');
    if (fileIdsToAck.length) await ackQueueItems(source.id, fileIdsToAck);
    useDataSourceStore.getState().updateSource(source.id, {
      lastSync: Date.now(),
      status: 'connected',
      errorReason: undefined,
    });
  } else if (source.type === 'onedrive') {
    const cfg = source.config as OneDriveConfig;
    if (!cfg.accessToken || !msTokenValid(cfg.tokenExpiry)) {
      useDataSourceStore.getState().updateSource(source.id, {
        errorReason: 'oauth_expired',
        status: 'error',
      });
      return;
    }
    if (needsRenew) {
      try {
        await subscribeOneDriveChanges(source.id, cfg.accessToken);
      } catch (e) {
        console.warn('[queue-polling] onedrive renew failed:', (e as Error).message);
      }
    }

    const deltaLink = lsGet(DELTA_LINK_KEY(source.id));
    const { items, newDeltaLink } = await fetchOneDriveDelta({
      accessToken: cfg.accessToken,
      deltaLink,
    });
    if (newDeltaLink) lsSet(DELTA_LINK_KEY(source.id), newDeltaLink);

    for (const it of items) {
      try {
        if (useCostStore.getState().paused) break;
        const raw = await downloadOneDriveFile(cfg.accessToken, {
          id: it.id,
          name: it.name ?? it.id,
          size: it.size,
        } as Parameters<typeof downloadOneDriveFile>[1]);
        // [2026-05-01 Roy] queue polling — image PDF OCR fallback 활성.
        let doc = await parseDocument(raw, embeddingProvider
          ? { apiKey: embeddingKey, provider: embeddingProvider }
          : undefined);
        doc = { ...doc, name: `${sourceTag(source.id)}/${it.name ?? it.id}` };
        if (embeddingKey) {
          doc = await generateEmbeddings(doc, embeddingKey, embeddingProvider);
        }
        await saveDocument(doc);
        const active = await getActiveDocIds();
        if (!active.includes(doc.id)) await setActiveDocIds([...active, doc.id]);
        fileIdsToAck.push(it.id);
      } catch (e) {
        console.warn('[queue-polling] onedrive file failed:', it.id, (e as Error).message);
      }
    }
    for (const q of queue.items) if (q.fileId === '*') fileIdsToAck.push('*');
    if (fileIdsToAck.length) await ackQueueItems(source.id, fileIdsToAck);
    useDataSourceStore.getState().updateSource(source.id, {
      lastSync: Date.now(),
      status: 'connected',
      errorReason: undefined,
    });
  }
}

export function useDataSourceQueuePolling() {
  const sources = useDataSourceStore((s) => s.sources);
  const getKey = useAPIKeyStore((s) => s.getKey);
  const tickingRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!process.env.NEXT_PUBLIC_DS_WEBHOOK_URL) return;

    let cancelled = false;

    async function tick() {
      if (tickingRef.current || cancelled) return;
      tickingRef.current = true;
      try {
        const embeddingKey = getKey('openai') || getKey('google') || '';
        const embeddingProvider: 'openai' | 'google' = getKey('openai') ? 'openai' : 'google';
        const targets = sources.filter(
          (s) => (s.type === 'google-drive' || s.type === 'onedrive') && s.isActive !== false,
        );
        for (const src of targets) {
          if (cancelled) break;
          try {
            await syncOneSource(src, embeddingKey, embeddingProvider);
          } catch (e) {
            // [2026-05-04] 'Failed to fetch'(네트워크 unreachable / DNS 실패 / CORS 차단)는
            // worker 미배포·오프라인·방화벽 등 환경적 원인이라 5분마다 노이즈만 됨 → debug로 강등.
            // 진짜 서버 오류(4xx/5xx body 또는 throw 메시지에 status 포함)는 warn 유지.
            const msg = (e as Error)?.message ?? '';
            const isNetwork = /failed to fetch|networkerror|load failed|fetch is not defined/i.test(msg);
            const log = isNetwork ? console.debug : console.warn;
            log('[queue-polling] source failed:', src.id, msg);
          }
        }
      } finally {
        tickingRef.current = false;
      }
    }

    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    const onFocus = () => tick();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [sources, getKey]);
}
