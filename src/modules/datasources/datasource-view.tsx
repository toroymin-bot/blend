'use client';

// Blend - Data Source Management UI (Enterprise)
// Supports: Local FS (HDD/USB), Google Drive, OneDrive, WebDAV (NAS)

import { useState, useEffect } from 'react';
import { HardDrive, Cloud, RefreshCw, Trash2, Plus, Check, X, AlertCircle, Loader, FolderOpen, ChevronDown, ChevronUp, Server, ExternalLink } from 'lucide-react';
import { useDataSourceStore } from '@/stores/datasource-store';
import { useDocumentStore } from '@/stores/document-store';
import { useAPIKeyStore } from '@/stores/api-key-store';
import { DataSource, DataSourceConfig, GoogleDriveConfig, OneDriveConfig, WebDAVConfig } from '@/types';
import { pickLocalDirectory } from '@/lib/connectors/local-connector';
import { requestGoogleAccessToken } from '@/lib/connectors/google-drive-connector';
import { requestOneDriveAccessToken } from '@/lib/connectors/onedrive-connector';
import { testWebDAVConnection } from '@/lib/connectors/webdav-connector';
import { indexSource, clearSourceDocs, IndexProgress } from '@/lib/source-indexer';

// ── Type icons ────────────────────────────────────────────────────────────────
function SourceIcon({ type, size = 20 }: { type: DataSource['type']; size?: number }) {
  if (type === 'google-drive') return <Cloud size={size} className="text-blue-400" />;
  if (type === 'onedrive') return <Cloud size={size} className="text-blue-500" />;
  if (type === 'webdav') return <Server size={size} className="text-purple-400" />;
  return <HardDrive size={size} className="text-green-400" />;
}

function sourceTypeLabel(type: DataSource['type']): string {
  if (type === 'google-drive') return 'Google Drive';
  if (type === 'onedrive') return 'OneDrive';
  if (type === 'webdav') return 'NAS/WebDAV';
  return '로컬 드라이브';
}

// ── Add Source Forms ──────────────────────────────────────────────────────────

type AddMode = null | 'local' | 'google-drive' | 'onedrive' | 'webdav';

// Pre-configured OAuth Client IDs (set via Vercel env vars)
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID ?? '';
const ONEDRIVE_CLIENT_ID = process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID ?? '';

function GoogleDriveForm({ onAdd }: { onAdd: (cfg: GoogleDriveConfig, name: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const handle = async () => {
    if (!GOOGLE_CLIENT_ID) { setErr('Google OAuth Client ID가 설정되지 않았습니다. 관리자에게 문의하세요.'); return; }
    setErr(''); setBusy(true);
    try {
      const token = await requestGoogleAccessToken(GOOGLE_CLIENT_ID);
      onAdd(
        { type: 'google-drive', clientId: GOOGLE_CLIENT_ID, accessToken: token, tokenExpiry: Date.now() + 3600_000 },
        'Google Drive'
      );
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">
        구글 계정으로 로그인하면 Google Drive 파일을 AI가 읽을 수 있어요. (읽기 전용)
      </p>
      {err && <p className="text-xs text-red-400">{err}</p>}
      <button onClick={handle} disabled={busy} className="w-full py-2.5 bg-white hover:bg-gray-100 disabled:bg-gray-700 text-gray-800 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors">
        {busy ? (
          <><Loader size={14} className="animate-spin text-gray-600" />로그인 중...</>
        ) : (
          <>
            <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/><path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/><path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"/><path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/></svg>
            Google 로그인
          </>
        )}
      </button>
    </div>
  );
}

function OneDriveForm({ onAdd }: { onAdd: (cfg: OneDriveConfig, name: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const handle = async () => {
    if (!ONEDRIVE_CLIENT_ID) { setErr('OneDrive OAuth Client ID가 설정되지 않았습니다. 관리자에게 문의하세요.'); return; }
    setErr(''); setBusy(true);
    try {
      const token = await requestOneDriveAccessToken(ONEDRIVE_CLIENT_ID, 'common');
      onAdd(
        { type: 'onedrive', clientId: ONEDRIVE_CLIENT_ID, tenantId: 'common', accessToken: token, tokenExpiry: Date.now() + 3600_000 },
        'OneDrive'
      );
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">
        Microsoft 계정으로 로그인하면 OneDrive 파일을 AI가 읽을 수 있어요. (읽기 전용)
      </p>
      {err && <p className="text-xs text-red-400">{err}</p>}
      <button onClick={handle} disabled={busy} className="w-full py-2.5 bg-[#0078d4] hover:bg-[#106ebe] disabled:bg-gray-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors">
        {busy ? (
          <><Loader size={14} className="animate-spin" />로그인 중...</>
        ) : (
          <>
            <svg width="18" height="18" viewBox="0 0 21 21"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>
            Microsoft 로그인
          </>
        )}
      </button>
    </div>
  );
}

function WebDAVForm({ onAdd }: { onAdd: (cfg: WebDAVConfig, name: string) => void }) {
  const [serverUrl, setServerUrl] = useState('');
  const [basePath, setBasePath] = useState('/');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [label, setLabel] = useState('NAS');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const handle = async () => {
    if (!serverUrl.trim() || !username.trim()) { setErr('서버 URL과 사용자명을 입력해주세요.'); return; }
    setErr(''); setBusy(true);
    try {
      await testWebDAVConnection(serverUrl.trim(), basePath.trim() || '/', username.trim(), password);
      onAdd({ type: 'webdav', serverUrl: serverUrl.trim(), basePath: basePath.trim() || '/', username: username.trim(), password }, label || 'NAS');
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">Synology, QNAP, Nextcloud 등 WebDAV를 지원하는 NAS에 연결합니다.</p>
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="소스 이름 (예: 회사 NAS)" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 outline-none focus:ring-1 focus:ring-blue-500" />
      <input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="서버 URL (예: http://192.168.1.10:5005)" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 outline-none focus:ring-1 focus:ring-blue-500" />
      <input value={basePath} onChange={(e) => setBasePath(e.target.value)} placeholder="기본 경로 (예: /documents)" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 outline-none focus:ring-1 focus:ring-blue-500" />
      <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="사용자명" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 outline-none focus:ring-1 focus:ring-blue-500" />
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="비밀번호" className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 outline-none focus:ring-1 focus:ring-blue-500" />
      {err && <p className="text-xs text-red-400">{err}</p>}
      <button onClick={handle} disabled={busy} className="w-full py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2">
        {busy ? <><Loader size={14} className="animate-spin" />연결 확인 중...</> : '연결 테스트 후 추가'}
      </button>
    </div>
  );
}

// ── Relative time helper ─────────────────────────────────────────────────────
function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return '방금 전';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return `${d}일 전`;
}

// ── Main View ─────────────────────────────────────────────────────────────────

export function DataSourceView() {
  const { sources, addSource, removeSource, setStatus, updateSource, getHandle, setHandle, loadFromStorage } = useDataSourceStore();
  const { loadFromDB } = useDocumentStore();
  const { getKey } = useAPIKeyStore();
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [syncProgress, setSyncProgress] = useState<Record<string, IndexProgress>>({});
  const [syncing, setSyncing] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { loadFromStorage(); }, []);

  const embeddingKey = getKey('openai') || getKey('google') || '';
  const embeddingProvider: 'openai' | 'google' = getKey('openai') ? 'openai' : 'google';

  const handleAddLocal = async () => {
    try {
      const handle = await pickLocalDirectory();
      const src = addSource({ type: 'local', label: handle.name }, handle.name, handle);
      setHandle(src.id, handle);
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') alert((e as Error).message);
    }
  };

  const handleAddCloud = (config: DataSourceConfig, name: string) => {
    addSource(config, name);
    setAddMode(null);
  };

  const handleSync = async (source: DataSource) => {
    if (syncing.has(source.id)) return;
    setSyncing((s) => new Set([...s, source.id]));
    setStatus(source.id, 'syncing');

    try {
      const dirHandle = source.type === 'local' ? getHandle(source.id) : undefined;
      const { indexed, errors } = await indexSource(
        source,
        embeddingKey,
        embeddingProvider,
        dirHandle,
        (p) => setSyncProgress((prev) => ({ ...prev, [source.id]: p }))
      );

      updateSource(source.id, {
        status: errors.length === 0 ? 'connected' : 'error',
        indexedCount: indexed,
        lastSync: Date.now(),
        error: errors.length > 0 ? `${errors.length}개 파일 오류` : undefined,
      });
      // Reload document store so new docs appear in RAG
      await loadFromDB();
      setToast(`${source.name} 동기화 완료 — ${indexed}개 파일 인덱싱됨`);
      setTimeout(() => setToast(null), 3000);
    } catch (e: unknown) {
      setStatus(source.id, 'error', (e as Error).message);
    } finally {
      setSyncing((s) => { const next = new Set(s); next.delete(source.id); return next; });
      setSyncProgress((prev) => { const next = { ...prev }; delete next[source.id]; return next; });
    }
  };

  const handleRemove = async (id: string) => {
    await clearSourceDocs(id);
    removeSource(id);
    await loadFromDB();
  };

  const ADD_TYPES = [
    { id: 'local' as AddMode, label: '로컬 드라이브 / USB', icon: <HardDrive size={16} />, color: 'bg-green-500/10 border-green-500/30 text-green-400', action: handleAddLocal },
    { id: 'google-drive' as AddMode, label: 'Google Drive', icon: <Cloud size={16} />, color: 'bg-blue-500/10 border-blue-500/30 text-blue-400' },
    { id: 'onedrive' as AddMode, label: 'OneDrive', icon: <Cloud size={16} />, color: 'bg-blue-600/10 border-blue-600/30 text-blue-500' },
    { id: 'webdav' as AddMode, label: 'NAS / WebDAV', icon: <Server size={16} />, color: 'bg-purple-500/10 border-purple-500/30 text-purple-400' },
  ];

  return (
    <div className="h-full overflow-y-auto bg-gray-900 p-6 relative">
      {/* Sync complete toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 bg-green-800 border border-green-600 rounded-full text-sm text-green-100 shadow-xl flex items-center gap-2">
          <Check size={14} className="text-green-300" />
          {toast}
        </div>
      )}
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <HardDrive size={24} /> 데이터 소스 (기업용)
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            내 파일·드라이브·클라우드를 연결하면 AI가 내 자료를 참고해 답해줘요
          </p>
          {!embeddingKey && (
            <p className="text-xs text-yellow-500 mt-1">
              ⚠ AI 검색 키가 없어요 — 지금은 단어 검색만 돼요 (설정에서 OpenAI 또는 Google 키를 넣으면 똑똑해져요)
            </p>
          )}
        </div>

        {/* Add source buttons */}
        <div className="grid grid-cols-2 gap-2 mb-6">
          {ADD_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={t.action ?? (() => setAddMode(addMode === t.id ? null : t.id))}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${t.color} hover:opacity-80`}
            >
              {t.icon} {t.label}
              {!t.action && (addMode === t.id ? <ChevronUp size={12} className="ml-auto" /> : <ChevronDown size={12} className="ml-auto" />)}
              {t.id === 'local' && <Plus size={12} className="ml-auto" />}
            </button>
          ))}
        </div>

        {/* Inline forms */}
        {addMode === 'google-drive' && (
          <div className="mb-4 bg-gray-800 rounded-xl p-4 border border-blue-500/30">
            <GoogleDriveForm onAdd={handleAddCloud} />
          </div>
        )}
        {addMode === 'onedrive' && (
          <div className="mb-4 bg-gray-800 rounded-xl p-4 border border-blue-600/30">
            <OneDriveForm onAdd={handleAddCloud} />
          </div>
        )}
        {addMode === 'webdav' && (
          <div className="mb-4 bg-gray-800 rounded-xl p-4 border border-purple-500/30">
            <WebDAVForm onAdd={handleAddCloud} />
          </div>
        )}

        {/* Source list */}
        {sources.length === 0 ? (
          <div className="text-center py-12 text-gray-600 text-sm">
            연결된 데이터 소스가 없습니다.<br />위 버튼으로 소스를 추가하세요.
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-500 mb-2">
              연결된 파일은 모든 대화에서 AI가 자동으로 참고해요
            </p>
            {sources.map((src) => {
              const progress = syncProgress[src.id];
              const isSyncing = syncing.has(src.id);

              return (
                <div key={src.id} className={`bg-gray-800 rounded-xl p-4 border ${
                  src.status === 'connected' ? 'border-green-700/50' :
                  src.status === 'error' ? 'border-red-700/50' :
                  src.status === 'syncing' ? 'border-blue-700/50' :
                  'border-gray-700'
                }`}>
                  <div className="flex items-start gap-3">
                    <SourceIcon type={src.type} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-200 truncate">{src.name}</p>
                        <span className="text-xs text-gray-500">{sourceTypeLabel(src.type)}</span>
                        {src.status === 'connected' && <Check size={12} className="text-green-400" />}
                        {src.status === 'error' && <AlertCircle size={12} className="text-red-400" />}
                        {src.status === 'syncing' && <Loader size={12} className="animate-spin text-blue-400" />}
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        {src.indexedCount != null && <span>{src.indexedCount}개 파일</span>}
                        {src.lastSync && <span>동기화 {relativeTime(src.lastSync)}</span>}
                        {src.error && <span className="text-red-400">{src.error}</span>}
                      </div>

                      {/* Sync progress */}
                      {isSyncing && progress && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                            <span className="truncate max-w-[260px]">{progress.current}</span>
                            <span>{progress.done}/{progress.total}</span>
                          </div>
                          <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 transition-all"
                              style={{ width: progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : '0%' }}
                            />
                          </div>
                          {progress.errors.length > 0 && (
                            <p className="text-xs text-yellow-500 mt-1">{progress.errors.length}개 파일 오류</p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleSync(src)}
                        disabled={isSyncing}
                        className="p-1.5 text-gray-400 hover:text-blue-400 disabled:opacity-40 transition-colors"
                        title="동기화 (재인덱싱)"
                      >
                        <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
                      </button>
                      {src.type === 'local' && !getHandle(src.id) && (
                        <button
                          onClick={async () => {
                            try {
                              const h = await pickLocalDirectory();
                              setHandle(src.id, h);
                            } catch { /* user cancelled */ }
                          }}
                          className="p-1.5 text-yellow-500 hover:text-yellow-300 transition-colors"
                          title="폴더 재연결"
                        >
                          <FolderOpen size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => handleRemove(src.id)}
                        className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
                        title="소스 제거"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Info box */}
        <div className="mt-8 bg-gray-800/50 rounded-xl p-4 border border-dashed border-gray-700 text-xs text-gray-500 space-y-1">
          <p className="font-medium text-gray-400 mb-2">이렇게 동작해요</p>
          <p>• 파일을 연결하면 엑셀·CSV·텍스트·PDF 등을 자동으로 읽어요</p>
          <p>• 읽은 내용을 AI가 빠르게 찾을 수 있게 내 브라우저 안에 저장해요</p>
          <p>• 채팅에서 질문하면 연결된 파일에서 관련 내용을 자동으로 찾아줘요</p>
          <p>• <span className="text-blue-400">내 컴퓨터 폴더</span>: 페이지를 새로고침하면 폴더를 다시 선택해야 해요 (브라우저 보안 규칙)</p>
          <p>• <span className="text-blue-400">클라우드(구글 드라이브 등)</span>: 1시간 후 자동 로그아웃되면 다시 연결해야 해요</p>
          <p className="text-gray-600 mt-2">* 내 파일 내용은 내 브라우저에만 저장돼요. 서버로 보내지 않아요.</p>
        </div>
      </div>
    </div>
  );
}
