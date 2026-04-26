// Tori 명세 + 핫픽스 (2026-04-25) — 통합 활성 소스 셀렉터 훅
// Phase 3b (2026-04-26) — meeting 추가. d1:meetings localStorage 직접 읽음 (design1 meeting view 자체 store).

import { useEffect, useMemo, useState } from 'react';
import { useDocumentStore } from '@/stores/document-store';
import { useDataSourceStore } from '@/stores/datasource-store';
import type { ActiveSource } from '@/types/active-source';

// Phase 3b — d1:meetings localStorage 폴링형 reactive
type MeetingSnapshot = {
  id: string;
  title: string;
  isActive?: boolean;
  summary?: string[];
  actionItems?: { task: string; done?: boolean }[];
  decisions?: string[];
  topics?: string[];
  fullSummary?: string;
  createdAt?: number;
};

function loadActiveMeetings(): MeetingSnapshot[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('d1:meetings');
    if (!raw) return [];
    const arr = JSON.parse(raw) as MeetingSnapshot[];
    return Array.isArray(arr) ? arr.filter((m) => m.isActive !== false) : [];
  } catch { return []; }
}

function useActiveMeetings(): MeetingSnapshot[] {
  const [list, setList] = useState<MeetingSnapshot[]>(() => loadActiveMeetings());
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const refresh = () => setList(loadActiveMeetings());
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('d1:meetings-changed', refresh as EventListener);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('d1:meetings-changed', refresh as EventListener);
    };
  }, []);
  return list;
}

function dsServiceLabel(type: string): string {
  switch (type) {
    case 'google-drive': return 'Google Drive';
    case 'onedrive':     return 'OneDrive';
    case 'webdav':       return 'WebDAV';
    case 'local':        return 'Local';
    default:             return type;
  }
}

function dsServiceIcon(type: string): string {
  switch (type) {
    case 'google-drive': return '☁️';
    case 'onedrive':     return '📁';
    case 'webdav':       return '🌐';
    case 'local':        return '💾';
    default:             return '📦';
  }
}

export function useActiveSourceList(lang: 'ko' | 'en' = 'ko'): ActiveSource[] {
  const documents     = useDocumentStore((s) => s.documents);
  const activeDocIds  = useDocumentStore((s) => s.activeDocIds);
  const embedProgress = useDocumentStore((s) => s.embedProgress);
  const dataSources   = useDataSourceStore((s) => s.sources);
  const meetings      = useActiveMeetings();

  return useMemo(() => {
    const result: ActiveSource[] = [];

    // 1) 활성 문서
    documents
      .filter((d) => activeDocIds.has(d.id))
      .forEach((d) => {
        // [2026-04-26] D-1 — 진행 상태 우선순위:
        //   embedProgress.embedding → syncing (percent 표시)
        //   embedProgress.error     → error
        //   첫 chunk에 embedding    → ready
        //   그 외                   → idle (키워드 fallback)
        const prog = embedProgress[d.id];
        const hasEmbedding = d.chunks.some((c) => Array.isArray(c.embedding) && c.embedding.length > 0);
        let status: 'syncing' | 'ready' | 'error' | 'idle';
        let progress: { current: number; total: number } | undefined;
        let errorMessage: string | undefined;
        if (prog?.status === 'embedding') {
          status = 'syncing';
          progress = { current: prog.percent, total: 100 };
        } else if (prog?.status === 'error') {
          status = 'error';
          errorMessage = prog.error;
        } else if (hasEmbedding) {
          status = 'ready';
        } else {
          status = 'idle';
        }
        result.push({
          id: `doc:${d.id}`,
          type: 'document',
          title: d.name,
          icon: '📄',
          navigateTo: `/design1/${lang}`,
          chunkCount: d.chunks.length,
          documentId: d.id,
          status,
          progress,
          errorMessage,
        });
      });

    // 2) 활성 데이터 소스 폴더 (Tori 핫픽스)
    dataSources
      .filter((ds) => ds.isActive !== false)  // undefined도 활성으로 간주 (legacy 호환)
      .forEach((ds) => {
        const serviceName = dsServiceLabel(ds.type);
        const folderPath  = ds.name; // datasource-view-design1에서 'Google Drive' / 'OneDrive' 같은 라벨로 저장
        // [2026-04-26] 데이터소스는 임베딩 인프라 없음 — 연결됨/동기화중/오류만 매핑
        const status =
          ds.status === 'error' ? 'error' :
          ds.status === 'syncing' ? 'syncing' :
          ds.status === 'connected' ? 'ready' : 'idle';
        result.push({
          id: `ds:${ds.id}`,
          type: 'datasource-folder',
          title: serviceName,
          subtitle: folderPath !== serviceName ? folderPath : undefined,
          icon: dsServiceIcon(ds.type),
          navigateTo: `/design1/${lang}`,
          chunkCount: ds.fileCount ?? 0,
          dataSourceId: ds.id,
          serviceName: ds.type === 'onedrive' ? 'onedrive' : 'google-drive',
          folderPath,
          status,
          errorMessage: ds.error,
        });
      });

    // 3) 활성 회의록 (Phase 3b)
    meetings.forEach((m) => {
      const chunkCount =
        (m.summary?.length ?? 0) +
        (m.actionItems?.length ?? 0) +
        (m.decisions?.length ?? 0) +
        (m.topics?.length ?? 0);
      result.push({
        id: `meeting:${m.id}`,
        type: 'meeting',
        title: m.title || (lang === 'ko' ? '회의록' : 'Meeting'),
        icon: '🎙️',
        navigateTo: `/design1/${lang}`,
        chunkCount,
        meetingId: m.id,
        status: 'ready' as const,
      });
    });

    return result;
  }, [documents, activeDocIds, embedProgress, dataSources, meetings, lang]);
}
