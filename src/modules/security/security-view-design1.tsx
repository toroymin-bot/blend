'use client';

/**
 * D1SecurityView — Design1 Security & Privacy view
 * "Blend는 서버를 사용하지 않습니다."
 *
 * Self-contained. localStorage / IndexedDB / API key store / agent count 시각화.
 */

import { useEffect, useMemo, useState } from 'react';
import { useAPIKeyStore } from '@/stores/api-key-store';
import { useAgentStore } from '@/stores/agent-store';
import { useDocumentStore } from '@/stores/document-store';
import { useDataSourceStore } from '@/stores/datasource-store';
import { useD1ChatStore } from '@/stores/d1-chat-store';
import type { AIProvider } from '@/types';

// ── Tokens ───────────────────────────────────────────────────────
const tokens = {
  bg:           'var(--d1-bg)',
  surface:      'var(--d1-surface)',
  surfaceAlt:   'var(--d1-surface-alt)',
  text:         'var(--d1-text)',
  textDim:      'var(--d1-text-dim)',
  textFaint:    'var(--d1-text-faint)',
  accent:       'var(--d1-accent)',
  accentSoft:   'var(--d1-accent-soft)',
  border:       'var(--d1-border)',
  borderStrong: 'var(--d1-border-strong)',
  danger:       'var(--d1-danger)',
} as const;

// ── Copy ─────────────────────────────────────────────────────────
const copy = {
  ko: {
    title:        '보안 & 프라이버시',
    head:         'Blend는 서버를 사용하지 않습니다.',
    sub:          '모든 데이터는 이 기기에만 저장되고, AI 호출은 사용자의 키로 직접 이루어집니다.',
    dataLoc:      '데이터 위치',
    thisBrowser:  '이 브라우저',
    indexedDB:    'IndexedDB',
    localStorage: 'localStorage',
    used:         (mb: number, total: number) => `${mb.toFixed(1)} MB / ${total} MB`,
    chatsN:       (n: number) => `채팅 ${n}개`,
    keysN:        (n: number) => `API 키 ${n}개`,
    agentsN:      (n: number) => `에이전트 ${n}개`,
    docsN:        (n: number) => `문서 ${n}개`,
    sourcesN:     (n: number) => `데이터 소스 ${n}개`,
    keySafety:    'API 키 보안',
    connectedKeys:'등록된 키',
    keysExplain:  '키는 이 브라우저 외부로 전송되지 않습니다. localStorage에 평문으로 저장되며, 브라우저 도메인 격리에 의해 다른 사이트는 접근 불가합니다. 모든 데이터 삭제 시 즉시 폐기됩니다.',
    delete:       '삭제',
    dataManage:   '데이터 관리',
    exportData:   '내 데이터 내보내기',
    deleteAll:    '모든 데이터 삭제',
    confirm1:     '정말 모든 데이터를 삭제할까요?',
    confirm1Hint: '복구할 수 없어요.',
    confirm2Hint: '확인을 위해 "blend"라고 입력하세요.',
    cancel:       '취소',
    deleteBtn:    '삭제',
    none:         '등록된 키가 없어요',
    empty:        '비어 있어요',
    netLog:       '서버 통신 내역',
    netLogHint:   '이 페이지가 열려있는 동안 외부 호출만 기록 (URL host와 메서드만, 본문/헤더 X)',
    netLogEmpty:  '아직 기록된 호출이 없어요',
  },
  en: {
    title:        'Security & Privacy',
    head:         'Blend has no server.',
    sub:          'All data lives on this device. AI calls go directly with your own keys.',
    dataLoc:      'Where your data lives',
    thisBrowser:  'This browser',
    indexedDB:    'IndexedDB',
    localStorage: 'localStorage',
    used:         (mb: number, total: number) => `${mb.toFixed(1)} MB / ${total} MB`,
    chatsN:       (n: number) => `${n} chats`,
    keysN:        (n: number) => `${n} API keys`,
    agentsN:      (n: number) => `${n} agents`,
    docsN:        (n: number) => `${n} documents`,
    sourcesN:     (n: number) => `${n} data sources`,
    keySafety:    'API key safety',
    connectedKeys:'Connected keys',
    keysExplain:  'Keys never leave this browser. Stored in localStorage as plain text — isolated by browser domain origin policy, inaccessible to other sites. Discarded immediately when you delete all data.',
    delete:       'Delete',
    dataManage:   'Data management',
    exportData:   'Export my data',
    deleteAll:    'Delete all data',
    confirm1:     'Delete all data?',
    confirm1Hint: 'This cannot be undone.',
    confirm2Hint: 'Type "blend" to confirm.',
    cancel:       'Cancel',
    deleteBtn:    'Delete',
    none:         'No keys connected',
    empty:        'Empty',
    netLog:       'Network calls',
    netLogHint:   'External calls observed only while this page is open (host + method only, no body/headers)',
    netLogEmpty:  'No calls recorded yet',
  },
} as const;

const PROVIDERS: { id: AIProvider; label: string }[] = [
  { id: 'openai',    label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'google',    label: 'Google' },
  { id: 'deepseek',  label: 'DeepSeek' },
  { id: 'groq',      label: 'Groq' },
];

// ── Helpers ──────────────────────────────────────────────────────
function getLocalStorageUsage(): { mb: number; total: number } {
  if (typeof window === 'undefined') return { mb: 0, total: 10 };
  let total = 0;
  try {
    for (const key in localStorage) {
      if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
        const v = localStorage.getItem(key) ?? '';
        total += (v.length + key.length) * 2;
      }
    }
  } catch {}
  return { mb: total / (1024 * 1024), total: 10 };
}

function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return key.slice(0, 3) + '•••••';
  return `${key.slice(0, 5)}•••${key.slice(-3)}`;
}

// ── Main view ───────────────────────────────────────────────────
export default function D1SecurityView({ lang }: { lang: 'ko' | 'en' | 'ph' }) {
  const t = lang === 'ko' ? copy.ko : copy.en;

  const { keys, getKey, setKey, loadFromStorage } = useAPIKeyStore();
  const agents      = useAgentStore((s) => s.agents);
  const documents   = useDocumentStore((s) => s.documents);
  const dsources    = useDataSourceStore((s) => s.sources);
  const d1Chats     = useD1ChatStore((s) => s.chats);

  useEffect(() => { loadFromStorage(); }, [loadFromStorage]);

  const [confirm1Open, setConfirm1Open] = useState(false);
  const [confirm2Open, setConfirm2Open] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [storageInfo, setStorageInfo]   = useState({ mb: 0, total: 10 });
  const [idbMb, setIdbMb]               = useState<number | null>(null);
  const [netLog, setNetLog]             = useState<{ host: string; method: string; ts: number }[]>([]);

  // IMP-028: fetch interceptor while this page is mounted (host + method only)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const origFetch = window.fetch;
    const origin = window.location.origin;
    window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
      try {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        const u = new URL(url, origin);
        // Same-origin requests are local — skip
        if (u.origin !== origin) {
          const host = u.host;
          const method = (init?.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase();
          setNetLog((prev) => [{ host, method, ts: Date.now() }, ...prev].slice(0, 50));
        }
      } catch {}
      return origFetch.apply(this, arguments as unknown as [RequestInfo | URL, RequestInit?]);
    };
    return () => { window.fetch = origFetch; };
  }, []);

  useEffect(() => {
    setStorageInfo(getLocalStorageUsage());
    if (typeof navigator !== 'undefined' && 'storage' in navigator && navigator.storage.estimate) {
      navigator.storage.estimate().then((est) => {
        if (est.usage != null) setIdbMb(est.usage / (1024 * 1024));
      }).catch(() => {});
    }
  }, []);

  const connectedKeys = useMemo(() => {
    return PROVIDERS
      .map((p) => ({ ...p, key: getKey(p.id) || '' }))
      .filter((p) => !!p.key);
  }, [keys]);

  const chatsCount  = d1Chats.length;
  const agentsCount = agents.length;
  const docsCount   = documents.length;
  const sourcesCount= dsources.length;
  const keysCount   = connectedKeys.length;

  function handleExport() {
    const payload: Record<string, any> = {
      exportedAt: new Date().toISOString(),
      version: 'd1-1',
      data: {} as Record<string, any>,
    };
    if (typeof window !== 'undefined') {
      for (const key in localStorage) {
        if (!Object.prototype.hasOwnProperty.call(localStorage, key)) continue;
        if (key.startsWith('blend:') || key.startsWith('d1:')) {
          try {
            payload.data[key] = JSON.parse(localStorage.getItem(key) || 'null');
          } catch {
            payload.data[key] = localStorage.getItem(key);
          }
        }
      }
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blend-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleDeleteAll() {
    if (typeof window === 'undefined') return;
    try {
      const keysToRemove: string[] = [];
      for (const key in localStorage) {
        if (Object.prototype.hasOwnProperty.call(localStorage, key) && (key.startsWith('blend:') || key.startsWith('d1:'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
      // Best-effort IDB deletion
      if (typeof indexedDB !== 'undefined') {
        try { indexedDB.deleteDatabase('blend-vector-db'); } catch {}
        try { indexedDB.deleteDatabase('blend-docs'); } catch {}
      }
    } catch {}
    setTimeout(() => window.location.reload(), 100);
  }

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ background: tokens.bg, color: tokens.text, fontFamily: lang === 'ko' ? 'Pretendard, sans-serif' : 'Geist, sans-serif' }}
    >
      <div className="mx-auto w-full max-w-3xl px-6 py-12 md:py-16">

        <header className="mb-10">
          <h1 className="text-[32px] md:text-[40px] font-medium leading-[1.15] tracking-tight">
            {t.title}
          </h1>
          <p className="mt-4 text-[18px] md:text-[20px] font-medium" style={{ color: tokens.text }}>
            {t.head}
          </p>
          <p className="mt-2 text-[14px]" style={{ color: tokens.textDim }}>
            {t.sub}
          </p>
        </header>

        {/* Data location */}
        <section className="mb-8">
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: tokens.textFaint }}>
            {t.dataLoc}
          </h2>
          <div
            className="rounded-2xl border p-6"
            style={{ background: tokens.surface, borderColor: tokens.border }}
          >
            <div className="text-[14px] font-medium mb-4" style={{ color: tokens.text }}>
              💾 {t.thisBrowser}
            </div>

            <div className="mb-4">
              <div className="flex justify-between text-[12px]" style={{ color: tokens.textDim }}>
                <span>{t.localStorage}</span>
                <span>{t.used(storageInfo.mb, storageInfo.total)}</span>
              </div>
              <div className="mt-1.5 h-1 rounded-full" style={{ background: tokens.surfaceAlt }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.min(100, (storageInfo.mb / storageInfo.total) * 100)}%`, background: tokens.accent }}
                />
              </div>
            </div>

            <ul className="space-y-1 text-[12px]" style={{ color: tokens.textDim }}>
              <li>• {t.chatsN(chatsCount)}</li>
              <li>• {t.keysN(keysCount)}</li>
              <li>• {t.agentsN(agentsCount)}</li>
              <li>• {t.sourcesN(sourcesCount)}</li>
            </ul>

            {idbMb != null && (
              <div className="mt-6 pt-4 border-t" style={{ borderColor: tokens.border }}>
                <div className="text-[14px] font-medium mb-2" style={{ color: tokens.text }}>
                  💽 {t.indexedDB}
                </div>
                <div className="text-[12px]" style={{ color: tokens.textDim }}>
                  {idbMb.toFixed(1)} MB · {t.docsN(docsCount)}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* API keys */}
        <section className="mb-8">
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: tokens.textFaint }}>
            {t.keySafety}
          </h2>
          <div
            className="rounded-2xl border p-6"
            style={{ background: tokens.surface, borderColor: tokens.border }}
          >
            <div className="mb-4 text-[14px] font-medium" style={{ color: tokens.text }}>
              🔑 {t.connectedKeys} ({connectedKeys.length})
            </div>

            {connectedKeys.length === 0 ? (
              <p className="text-[13px]" style={{ color: tokens.textDim }}>{t.none}</p>
            ) : (
              <ul className="space-y-2">
                {connectedKeys.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="font-medium" style={{ color: tokens.text }}>{p.label}</span>
                    <code
                      className="text-[12px]"
                      style={{ color: tokens.textDim, fontFamily: 'ui-monospace, monospace' }}
                    >
                      {maskKey(p.key)}
                    </code>
                    <button
                      type="button"
                      onClick={() => setKey(p.id, '')}
                      className="text-[12px] transition-opacity hover:underline"
                      style={{ color: tokens.danger }}
                    >
                      {t.delete}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-5 text-[12px]" style={{ color: tokens.textFaint }}>
              {t.keysExplain}
            </p>
          </div>
        </section>

        {/* Network calls log */}
        <section className="mb-8">
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: tokens.textFaint }}>
            {t.netLog}
          </h2>
          <div
            className="rounded-2xl border p-6"
            style={{ background: tokens.surface, borderColor: tokens.border }}
          >
            <p className="mb-4 text-[12px]" style={{ color: tokens.textFaint }}>{t.netLogHint}</p>
            {netLog.length === 0 ? (
              <p className="text-[13px]" style={{ color: tokens.textDim }}>{t.netLogEmpty}</p>
            ) : (
              <ul className="space-y-1.5">
                {netLog.slice(0, 20).map((c, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3 text-[12px]">
                    <code style={{ color: tokens.text, fontFamily: 'ui-monospace, monospace' }}>
                      <span style={{ color: tokens.accent }}>{c.method}</span> {c.host}
                    </code>
                    <span style={{ color: tokens.textFaint }}>
                      {new Date(c.ts).toLocaleTimeString(lang === 'ko' ? 'ko-KR' : 'en-US')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Data management */}
        <section className="mb-8">
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: tokens.textFaint }}>
            {t.dataManage}
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleExport}
              className="rounded-lg px-4 py-2 text-[13px] font-medium transition-colors"
              style={{ background: tokens.surface, color: tokens.text, border: `1px solid ${tokens.borderStrong}` }}
            >
              {t.exportData}
            </button>
            <button
              type="button"
              onClick={() => setConfirm1Open(true)}
              className="rounded-lg px-4 py-2 text-[13px] font-medium transition-colors"
              style={{ background: 'rgba(204,68,68,0.08)', color: tokens.danger }}
            >
              {t.deleteAll}
            </button>
          </div>
        </section>

      </div>

      {/* Confirm step 1 */}
      {confirm1Open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.32)' }}
          onClick={() => setConfirm1Open(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{ background: tokens.surface, color: tokens.text }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[15px] font-medium">{t.confirm1}</p>
            <p className="mt-2 text-[13px]" style={{ color: tokens.textDim }}>{t.confirm1Hint}</p>
            <ul className="mt-4 text-[12px] space-y-0.5" style={{ color: tokens.textDim }}>
              <li>• {t.chatsN(chatsCount)}</li>
              <li>• {t.keysN(keysCount)}</li>
              <li>• {t.agentsN(agentsCount)}</li>
              <li>• {t.sourcesN(sourcesCount)}</li>
            </ul>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirm1Open(false)} className="rounded-lg px-4 py-2 text-[13px]" style={{ color: tokens.textDim }}>
                {t.cancel}
              </button>
              <button
                onClick={() => { setConfirm1Open(false); setConfirm2Open(true); setConfirmInput(''); }}
                className="rounded-lg px-4 py-2 text-[13px] text-white"
                style={{ background: tokens.danger }}
              >
                {t.deleteBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm step 2 (type 'blend') */}
      {confirm2Open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.32)' }}
          onClick={() => setConfirm2Open(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{ background: tokens.surface, color: tokens.text }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[14px]" style={{ color: tokens.text }}>{t.confirm2Hint}</p>
            <input
              type="text"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              autoFocus
              className="mt-4 w-full rounded-lg border px-3 py-2 text-[14px] outline-none focus:border-current"
              style={{ borderColor: tokens.borderStrong, background: tokens.bg, color: tokens.text }}
            />
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirm2Open(false)} className="rounded-lg px-4 py-2 text-[13px]" style={{ color: tokens.textDim }}>
                {t.cancel}
              </button>
              <button
                disabled={confirmInput.trim().toLowerCase() !== 'blend'}
                onClick={handleDeleteAll}
                className="rounded-lg px-4 py-2 text-[13px] text-white transition-opacity disabled:opacity-40"
                style={{ background: tokens.danger }}
              >
                {t.deleteBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
