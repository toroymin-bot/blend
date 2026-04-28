'use client';

/**
 * D1 RAG 진행 배너 — 입력창 바로 위에 큰 정보 영역으로 표시.
 *
 * 사용자가 ActiveSourcesBar의 작은 칩(상태 점)으로는 분석 진행 중인 걸
 * 인지 못하고 답변이 끝났다고 오해하는 문제(2026-04-28 Roy 보고) 대응.
 *
 * 표시 조건:
 *   - 활성 소스 중 1개 이상이 'embedding' 상태일 때
 *   - 또는 'error' 상태일 때 (사용자에게 액션 유도)
 *
 * 자동 숨김: 모든 임베딩 완료 또는 사용자가 X 클릭.
 */

import { useEffect, useState } from 'react';
import { useDocumentStore } from '@/stores/document-store';

const tokens = {
  surface:    'var(--d1-surface)',
  surfaceAlt: 'var(--d1-surface-alt)',
  text:       'var(--d1-text)',
  textDim:    'var(--d1-text-dim)',
  textFaint:  'var(--d1-text-faint)',
  accent:     'var(--d1-accent)',
  accentSoft: 'var(--d1-accent-soft)',
  border:     'var(--d1-border)',
} as const;

interface ProgressItem {
  id: string;
  name: string;
  percent: number;
  startedAt: number;
  status: 'embedding' | 'error';
  error?: string;
}

function formatEta(percent: number, startedAt: number, lang: 'ko' | 'en'): string {
  if (percent <= 0 || percent >= 100) return '';
  const elapsed = (Date.now() - startedAt) / 1000;
  if (elapsed <= 0) return '';
  const remaining = (elapsed * (100 - percent)) / percent;
  if (lang === 'ko') {
    if (remaining < 5) return '곧 완료';
    if (remaining < 60) return `약 ${Math.ceil(remaining)}초 남음`;
    return `약 ${Math.ceil(remaining / 60)}분 남음`;
  }
  if (remaining < 5) return 'almost done';
  if (remaining < 60) return `~${Math.ceil(remaining)}s left`;
  return `~${Math.ceil(remaining / 60)}min left`;
}

export function D1RagProgressBanner({ lang }: { lang: 'ko' | 'en' }) {
  const documents     = useDocumentStore((s) => s.documents);
  const activeDocIds  = useDocumentStore((s) => s.activeDocIds);
  const embedProgress = useDocumentStore((s) => s.embedProgress);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [, force] = useState(0);

  // ETA 라벨이 흘러가게 1초마다 강제 재렌더 (배너 표시 중일 때만)
  useEffect(() => {
    const hasActive = Object.values(embedProgress).some(
      (p) => p?.status === 'embedding'
    );
    if (!hasActive) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [embedProgress]);

  const items: ProgressItem[] = [];
  for (const doc of documents) {
    if (!activeDocIds.has(doc.id)) continue;
    if (dismissed.has(doc.id)) continue;
    const prog = embedProgress[doc.id];
    if (!prog) continue;
    if (prog.status === 'embedding' || prog.status === 'error') {
      items.push({
        id: doc.id,
        name: doc.name,
        percent: Math.round(prog.percent ?? 0),
        startedAt: prog.startedAt ?? Date.now(),
        status: prog.status,
        error: prog.error,
      });
    }
  }

  if (items.length === 0) return null;

  const L = lang === 'ko'
    ? {
        embeddingLead: '문서 분석 중',
        embeddingDesc: '잠시만 기다려주세요. 완료되면 첨부 파일에 대해 답변할 수 있어요.',
        errorLead:     '문서 분석 실패',
        errorDesc:     'API 키 또는 네트워크 문제일 수 있어요. 데이터 소스 페이지에서 재시도하세요.',
        dismiss:       '닫기',
      }
    : {
        embeddingLead: 'Analyzing your files',
        embeddingDesc: 'Hold on — once finished, the AI can answer questions about your attachments.',
        errorLead:     'Analysis failed',
        errorDesc:     'Likely an API key or network issue. Retry from the Data Sources page.',
        dismiss:       'Dismiss',
      };

  const hasEmbedding = items.some((i) => i.status === 'embedding');
  const lead = hasEmbedding ? L.embeddingLead : L.errorLead;
  const desc = hasEmbedding ? L.embeddingDesc : L.errorDesc;

  return (
    <div
      className="mb-2 rounded-xl border px-4 py-3"
      style={{
        background:  hasEmbedding ? tokens.accentSoft : 'rgba(220, 60, 60, 0.06)',
        borderColor: hasEmbedding ? tokens.accent     : 'rgba(220, 60, 60, 0.4)',
        color: tokens.text,
      }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {hasEmbedding ? (
            <span
              className="inline-block h-4 w-4 rounded-full border-[2.5px] border-r-transparent"
              style={{
                borderColor: tokens.accent,
                borderRightColor: 'transparent',
                animation: 'd1-spin 0.9s linear infinite',
              }}
            />
          ) : (
            <span aria-hidden style={{ fontSize: 18 }}>⚠️</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold" style={{ color: tokens.text }}>
            {lead}
          </div>
          <div className="mt-0.5 text-[12px]" style={{ color: tokens.textDim }}>
            {desc}
          </div>
          <ul className="mt-2 space-y-1">
            {items.map((it) => (
              <li key={it.id} className="flex items-center gap-2 text-[12px]" style={{ color: tokens.textDim }}>
                <span className="truncate max-w-[260px]" style={{ color: tokens.text }}>
                  📄 {it.name}
                </span>
                {it.status === 'embedding' ? (
                  <>
                    <span className="font-semibold" style={{ color: tokens.accent }}>
                      {it.percent}%
                    </span>
                    <span style={{ color: tokens.textFaint }}>
                      · {formatEta(it.percent, it.startedAt, lang)}
                    </span>
                  </>
                ) : (
                  <span style={{ color: 'rgb(220, 60, 60)' }}>
                    {it.error ?? (lang === 'ko' ? '실패' : 'failed')}
                  </span>
                )}
                <button
                  onClick={() => setDismissed((s) => new Set([...s, it.id]))}
                  className="ml-auto rounded p-0.5 hover:bg-black/5"
                  aria-label={L.dismiss}
                  title={L.dismiss}
                  style={{ color: tokens.textFaint }}
                >
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes d1-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}} />
    </div>
  );
}
