// Tori 명세 — 통합 활성 소스 셀렉터 훅
// 현재: documents만 (P0). 후속: meeting + datasource-folder.

import { useMemo } from 'react';
import { useDocumentStore } from '@/stores/document-store';
import type { ActiveSource } from '@/types/active-source';

export function useActiveSourceList(lang: 'ko' | 'en' = 'ko'): ActiveSource[] {
  const documents    = useDocumentStore((s) => s.documents);
  const activeDocIds = useDocumentStore((s) => s.activeDocIds);

  return useMemo(() => {
    const result: ActiveSource[] = [];
    documents
      .filter((d) => activeDocIds.has(d.id))
      .forEach((d) => {
        result.push({
          id: `doc:${d.id}`,
          type: 'document',
          title: d.name,
          icon: '📄',
          navigateTo: `/design1/${lang}`,  // 사이드바에서 documents 진입
          chunkCount: d.chunks.length,
          documentId: d.id,
        });
      });
    return result;
  }, [documents, activeDocIds, lang]);
}
