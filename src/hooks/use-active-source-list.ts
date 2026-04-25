// Tori 명세 + 핫픽스 (2026-04-25) — 통합 활성 소스 셀렉터 훅
// documents + datasource-folder 통합. meeting은 후속.

import { useMemo } from 'react';
import { useDocumentStore } from '@/stores/document-store';
import { useDataSourceStore } from '@/stores/datasource-store';
import type { ActiveSource } from '@/types/active-source';

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
  const documents    = useDocumentStore((s) => s.documents);
  const activeDocIds = useDocumentStore((s) => s.activeDocIds);
  const dataSources  = useDataSourceStore((s) => s.sources);

  return useMemo(() => {
    const result: ActiveSource[] = [];

    // 1) 활성 문서
    documents
      .filter((d) => activeDocIds.has(d.id))
      .forEach((d) => {
        result.push({
          id: `doc:${d.id}`,
          type: 'document',
          title: d.name,
          icon: '📄',
          navigateTo: `/design1/${lang}`,
          chunkCount: d.chunks.length,
          documentId: d.id,
        });
      });

    // 2) 활성 데이터 소스 폴더 (Tori 핫픽스)
    dataSources
      .filter((ds) => ds.isActive !== false)  // undefined도 활성으로 간주 (legacy 호환)
      .forEach((ds) => {
        const serviceName = dsServiceLabel(ds.type);
        const folderPath  = ds.name; // datasource-view-design1에서 'Google Drive' / 'OneDrive' 같은 라벨로 저장
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
        });
      });

    return result;
  }, [documents, activeDocIds, dataSources, lang]);
}
