'use client';

/**
 * D1DataSourcesView — Design1 DataSources view
 * "AI가 참고할 정보 폴더를 연결하세요."
 *
 * 기존 useDataSourceStore + OAuth 모듈 재사용.
 */

import { useEffect, useState } from 'react';
import { useDataSourceStore } from '@/stores/datasource-store';
import type { DataSource, DataSourceType, DataSourceSelection } from '@/types';
// [2026-04-26 Tori 16384118 §3] Picker + Cost preview + Subscribe
// [2026-04-30] Google Picker SDK 제거 — 자체 폴더 모달 (OneDrive와 동일 패턴, 모바일 안정 + hex 캐시 폴더 자동 숨김)
import { GoogleDriveFolderModal } from '@/modules/datasources/google-drive-folder-modal';
import { OneDriveFolderModal } from '@/modules/datasources/onedrive-folder-modal';
import { validateSelections, describeValidationError, MAX_FILES_PER_FOLDER } from '@/modules/datasources/pickers/picker-shared';
import { CostPreviewModal } from '@/modules/datasources/cost-preview-modal';
import { subscribeGoogleDriveChanges } from '@/lib/sync/google-drive-subscribe';
import { subscribeOneDriveChanges } from '@/lib/sync/onedrive-subscribe';
// P2.2 OAuth 직접 흐름 (Tori 명세 — LegacyHandoff 제거)
import { requestGoogleAccessToken, scanDriveFolder } from '@/lib/connectors/google-drive-connector';
import { requestOneDriveAccessToken, scanOneDriveFolder } from '@/lib/connectors/onedrive-connector';
// [2026-04-29 Tori 19857410] Local Drive 통합
import { LocalDriveModal } from '@/modules/datasources/local-drive-modal';
import type { LocalPickerResult } from '@/modules/datasources/pickers/local-drive-picker';
import { detectCapability } from '@/lib/local-drive/capability';
import { saveHandle, deleteHandle, verifyPermission } from '@/lib/local-drive/handle-store';
import { checkAllLocalSources } from '@/lib/local-drive/auto-check';
import { scanLocalDirectory } from '@/lib/connectors/local-connector';
// [2026-04-30 Roy progress] 실제 0~100% sync progress
import { indexSource, type IndexProgress } from '@/lib/source-indexer';
import { useAPIKeyStore } from '@/stores/api-key-store';
import { useDocumentStore } from '@/stores/document-store';

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
  success:      'var(--d1-success)',
} as const;

// ── Copy ─────────────────────────────────────────────────────────
const copy = {
  ko: {
    title:        '데이터 소스',
    subtitle:     'AI가 참고할 정보 폴더를 연결하세요.',
    connected:    '연결된 소스',
    available:    '연결 가능',
    connectedBadge: '✓ 연결됨',
    sync:         '동기화',
    disconnect:   '연결 해제',
    connect:      '연결',
    coming:       '준비 중',
    files:        (n: number) => `${n}개 파일`,
    syncedAgo:    (rel: string) => `${rel} 동기화`,
    confirmDis:   '연결을 해제할까요?',
    cancel:       '취소',
    yesDis:       '해제',
    privacy:      '🔒 모든 파일 내용은 사용자 기기에서만 처리됩니다. Blend는 OAuth 토큰을 영구 저장하지 않으며, 브라우저 세션 종료 시 폐기됩니다.',
    emptyConn:    '아직 연결된 소스가 없어요.',
    emptyHint:    '아래에서 서비스를 선택해 시작하세요.',
    just:         '방금',
    minAgo:       (n: number) => `${n}분 전`,
    hourAgo:      (n: number) => `${n}시간 전`,
    dayAgo:       (n: number) => `${n}일 전`,
    syncing:      '동기화 중',
    error:        '오류',
    // P2.2 ConnectMiniModal 카피
    connectGdrive: 'Google Drive 연결',
    connectOnedrive: 'OneDrive 연결',
    permsHeading: 'Blend가 다음 권한을 요청합니다',
    permRead:    '선택한 폴더의 파일 읽기',
    permModify:  '파일 수정/삭제 (절대 X)',
    privacyNote: '데이터는 Blend 서버를 거치지 않고 당신의 브라우저에만 저장됩니다.',
    continueOauth: '계속',
    connectErrPopupBlocked: '팝업이 차단되었습니다. 팝업을 허용하고 다시 시도하세요.',
    connectErrCancelled: '인증이 취소되었습니다.',
    connectErrMissingId: 'OAuth 클라이언트 ID가 설정되지 않았습니다. 잠시 후 다시 시도하세요.',
    connecting:   '연결 중...',
    // [2026-04-29 Tori 19857410] Local Drive
    localLabel:    '로컬 드라이브',
    localDesc:     '내 컴퓨터의 폴더·파일',
    statusUpdates: '변경 감지',
    statusPermReq: '권한 만료',
    needsResel:    '이 브라우저는 매 세션마다 다시 선택해야 해요',
    reconnect:     '다시 연결',
    syncedDelta:   (a: number, m: number, r: number) => `+${a} 추가 · ${m} 변경 · ${r} 삭제`,
    permRequired:  '폴더 권한이 만료됐어요. 다시 연결해주세요.',
    localFallbackNotice: 'Chrome/Edge에서 폴더 권한을 자동 기억할 수 있어요. 현재 브라우저에선 매번 다시 선택해야 해요.',
  },
  en: {
    title:        'Data Sources',
    subtitle:     'Connect folders for AI to reference.',
    connected:    'Connected',
    available:    'Available',
    connectedBadge: '✓ Connected',
    sync:         'Sync',
    disconnect:   'Disconnect',
    connect:      'Connect',
    coming:       'Coming soon',
    files:        (n: number) => `${n} files`,
    syncedAgo:    (rel: string) => `synced ${rel}`,
    confirmDis:   'Disconnect this source?',
    cancel:       'Cancel',
    yesDis:       'Disconnect',
    privacy:      '🔒 All file content is processed on your device. Blend never stores OAuth tokens permanently — they are discarded when the browser session ends.',
    emptyConn:    'No connected sources yet.',
    emptyHint:    'Choose a service below to get started.',
    just:         'just now',
    minAgo:       (n: number) => `${n} min ago`,
    hourAgo:      (n: number) => `${n} h ago`,
    dayAgo:       (n: number) => `${n} d ago`,
    syncing:      'Syncing',
    error:        'Error',
    // P2.2 ConnectMiniModal copy
    connectGdrive: 'Connect Google Drive',
    connectOnedrive: 'Connect OneDrive',
    permsHeading: 'Blend is requesting the following permissions',
    permRead:    'Read files in the selected folder',
    permModify:  'Modify or delete files (never)',
    privacyNote: 'Data goes only to your browser, never through Blend servers.',
    continueOauth: 'Continue',
    connectErrPopupBlocked: 'Popup blocked. Please allow popups and retry.',
    connectErrCancelled: 'Authentication cancelled.',
    connectErrMissingId: 'OAuth client ID is not configured. Try again later.',
    connecting:   'Connecting...',
    // [2026-04-29 Tori 19857410] Local Drive
    localLabel:    'Local Drive',
    localDesc:     'Folders and files on this device',
    statusUpdates: 'Updates available',
    statusPermReq: 'Permission required',
    needsResel:    'This browser requires re-selection every session',
    reconnect:     'Reconnect',
    syncedDelta:   (a: number, m: number, r: number) => `+${a} added · ${m} modified · ${r} removed`,
    permRequired:  'Folder permission has expired. Please reconnect.',
    localFallbackNotice: 'Chrome and Edge remember folder access automatically. This browser requires re-selection each session.',
  },
} as const;

// ── Source catalog ───────────────────────────────────────────────
type AvailableSource = {
  type: DataSourceType;
  label: string;
  icon: string;
  enabled: boolean;
};

// Tori 보충 명세 (2026-04-25): WebDAV 카드 제거 (사용 수요 적음, NAS 제거와 동일 맥락)
// [2026-04-29 Tori 19857410] 로컬 드라이브 카드 추가 — Chrome/Edge에선 폴더 핸들 영구 저장.
const AVAILABLE: AvailableSource[] = [
  { type: 'google-drive', label: 'Google Drive',  icon: '☁️', enabled: true },
  { type: 'onedrive',     label: 'OneDrive',      icon: '📁', enabled: true },
  { type: 'local',        label: 'Local Drive',   icon: '💾', enabled: true },
];

const ICON_BY_TYPE: Record<DataSourceType, string> = {
  'local':        '💾',
  'google-drive': '☁️',
  'onedrive':     '📁',
  'webdav':       '🌐',
};

// ── Helpers ──────────────────────────────────────────────────────
function fmtRelative(ts: number, t: typeof copy['ko']): string {
  const diff = Date.now() - ts;
  if (diff < 60_000)        return t.just;
  if (diff < 3600_000)      return t.minAgo(Math.floor(diff / 60_000));
  if (diff < 86_400_000)    return t.hourAgo(Math.floor(diff / 3600_000));
  return t.dayAgo(Math.floor(diff / 86_400_000));
}

function folderPath(source: DataSource): string {
  if (source.config.type === 'local') return source.config.label;
  if (source.config.type === 'webdav') return source.config.serverUrl ?? '';
  return source.name;
}

// ── Main view ────────────────────────────────────────────────────
export default function D1DataSourcesView({ lang }: { lang: 'ko' | 'en' }) {
  const t = copy[lang];

  const sources         = useDataSourceStore((s) => s.sources);
  const addSource       = useDataSourceStore((s) => s.addSource);
  const removeSource    = useDataSourceStore((s) => s.removeSource);
  const updateSource    = useDataSourceStore((s) => s.updateSource);
  const setStatus       = useDataSourceStore((s) => s.setStatus);
  const loadFromStorage = useDataSourceStore((s) => s.loadFromStorage);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  const [confirmDelId, setConfirmDel] = useState<string | null>(null);
  // P2.2 — 연결 미니 모달 상태 (LegacyHandoff 제거)
  const [connectTarget, setConnectTarget] = useState<DataSourceType | null>(null);
  const [connecting, setConnecting]       = useState(false);
  const [connectErr, setConnectErr]       = useState<string | null>(null);

  // [2026-04-26 Tori 16384118 §3] Picker → 비용 미리보기 → Subscribe 흐름
  const [pendingPicker, setPendingPicker] = useState<{
    type: DataSourceType;
    accessToken: string;
    selections: DataSourceSelection[];
  } | null>(null);

  // [2026-04-29 Tori 19857410] Local drive — modal 단계와 비용 미리보기 단계가 분리됨.
  const [showLocalPicker, setShowLocalPicker] = useState(false);
  const [pendingLocal, setPendingLocal] = useState<LocalPickerResult | null>(null);
  // [2026-04-30 OneDrive/Google] popup picker SDK 대신 자체 폴더 모달 사용
  const [oneDriveAccessToken, setOneDriveAccessToken] = useState<string | null>(null);
  const [showOneDriveFolderModal, setShowOneDriveFolderModal] = useState(false);
  const [googleDriveAccessToken, setGoogleDriveAccessToken] = useState<string | null>(null);
  const [showGoogleDriveFolderModal, setShowGoogleDriveFolderModal] = useState(false);
  // 재연결 대상 source.id (null이면 신규 추가, 값이 있으면 기존 source 패치).
  const [reconnectTargetId, setReconnectTargetId] = useState<string | null>(null);
  // [2026-04-30 Roy progress] 동기화 진행률 (sourceId → IndexProgress)
  const [syncProgress, setSyncProgress] = useState<Record<string, IndexProgress>>({});
  const getKey = useAPIKeyStore((s) => s.getKey);
  const getHandle = useDataSourceStore((s) => s.getHandle);
  const reloadDocs = useDocumentStore((s) => s.loadFromDB);

  // 자동 체크 한 번만 실행 (mount 시).
  useEffect(() => {
    let cancelled = false;
    const localSources = sources.filter((s) => s.config.type === 'local');
    if (localSources.length === 0) return;
    void (async () => {
      const inputs = localSources.map((s) => ({
        sourceId: s.id,
        prevSnapshot: s.localFileSnapshot,
      }));
      const results = await checkAllLocalSources(inputs);
      if (cancelled) return;
      for (const r of results) {
        if (r.outcome === 'connected') {
          updateSource(r.sourceId, { fileCount: r.currentFileCount });
          setStatus(r.sourceId, 'connected');
        } else if (r.outcome === 'has_updates') {
          updateSource(r.sourceId, { fileCount: r.currentFileCount });
          setStatus(r.sourceId, 'has_updates');
        } else if (r.outcome === 'permission_required') {
          setStatus(r.sourceId, 'permission_required');
        } else if (r.outcome === 'missing') {
          setStatus(r.sourceId, 'error', 'missing');
        }
      }
    })();
    return () => { cancelled = true; };
    // mount 시 한 번 + sources 갯수가 변할 때마다 재체크 (reconnect 후 갱신)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources.length]);

  // [2026-04-30 Roy] 동기화 — scan만 X. 실제 indexSource()로 download → parse → embed → save.
  // 프로그레스 콜백으로 0~100% 실시간 업데이트.
  async function runSync(source: DataSource) {
    setStatus(source.id, 'syncing');
    setSyncProgress((prev) => ({
      ...prev,
      [source.id]: { total: 0, done: 0, current: '', errors: [] },
    }));

    try {
      // 임베딩 키 확보 — OpenAI 또는 Google. 없으면 명확히 거부.
      const openaiKey = getKey('openai');
      const googleKey = getKey('google');
      const embeddingKey      = openaiKey || googleKey;
      const embeddingProvider = openaiKey ? 'openai' : googleKey ? 'google' : null;
      if (!embeddingKey || !embeddingProvider) {
        setStatus(source.id, 'error', lang === 'ko'
          ? 'OpenAI 또는 Google API 키가 필요해요 (설정 → API 키)'
          : 'OpenAI or Google API key required (Settings → API Keys)');
        setSyncProgress((prev) => { const next = { ...prev }; delete next[source.id]; return next; });
        return;
      }

      // 로컬 드라이브는 핸들 권한 재확인.
      let dirHandle: FileSystemDirectoryHandle | undefined;
      if (source.config.type === 'local') {
        const handle = getHandle(source.id);
        if (!handle) {
          setStatus(source.id, 'permission_required');
          setSyncProgress((prev) => { const next = { ...prev }; delete next[source.id]; return next; });
          return;
        }
        const ok = await verifyPermission(handle, 'read');
        if (!ok) {
          setStatus(source.id, 'permission_required');
          setSyncProgress((prev) => { const next = { ...prev }; delete next[source.id]; return next; });
          return;
        }
        dirHandle = handle;
      }

      const { indexed, errors } = await indexSource(
        source,
        embeddingKey,
        embeddingProvider,
        dirHandle,
        (p) => {
          setSyncProgress((prev) => ({ ...prev, [source.id]: p }));
          // 스토어에도 0~100% 기록 (다른 화면에서도 참고 가능)
          if (p.total > 0) {
            updateSource(source.id, {
              syncProgress: Math.round((p.done / p.total) * 100),
              syncedCount: p.done,
              totalCount: p.total,
            });
          }
        },
      );

      // 로컬은 snapshot도 갱신 (변경 감지 baseline)
      if (source.config.type === 'local' && dirHandle) {
        const files = await scanLocalDirectory(dirHandle);
        updateSource(source.id, {
          localFileSnapshot: files.map((f) => ({ path: f.path, lastModified: f.lastModified })),
        });
      }

      updateSource(source.id, {
        fileCount: indexed,
        indexedCount: indexed,
        syncProgress: 100,
        lastSync: Date.now(),
        error: errors.length > 0
          ? (lang === 'ko' ? `${errors.length}개 파일 실패` : `${errors.length} files failed`)
          : undefined,
      });
      setStatus(source.id, errors.length === 0 ? 'connected' : 'error');
      // RAG 채팅에서 즉시 새 청크 인식되도록 문서 store 강제 reload
      void reloadDocs({ force: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Sync failed';
      setStatus(source.id, 'error', msg);
    } finally {
      // 완료 후 800ms 뒤 progress 모달 정리 (사용자가 100% 잠시 인지)
      setTimeout(() => {
        setSyncProgress((prev) => { const next = { ...prev }; delete next[source.id]; return next; });
      }, 800);
    }
  }

  // [2026-04-29 Tori 19857410] 로컬 권한 만료 후 재연결 — 같은 source.id 유지하면서
  // 새 폴더 핸들을 받아 IDB 갱신, snapshot 재구축.
  function runReconnectLocal(source: DataSource) {
    if (source.config.type !== 'local') return;
    setReconnectTargetId(source.id);
    setShowLocalPicker(true);
  }

  // [2026-04-26 Tori 16384118 §3] OAuth → Picker → 비용 모달 → Subscribe → addSource
  async function runConnect(type: DataSourceType) {
    // [2026-04-29 Tori 19857410] 로컬은 OAuth 없이 모달 직접 — ConnectMiniModal 우회.
    if (type === 'local') {
      setConnectTarget(null);
      setShowLocalPicker(true);
      return;
    }
    setConnecting(true);
    setConnectErr(null);
    try {
      if (type === 'google-drive') {
        // [2026-04-30] Google Picker SDK 제거 — OAuth 토큰만 받고 자체 폴더 모달로.
        // hex 캐시 폴더 자동 숨김 + 모바일 popup 의존 제거.
        const clientId = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID;
        if (!clientId) { setConnectErr(t.connectErrMissingId); return; }
        const accessToken = await requestGoogleAccessToken(clientId);
        setGoogleDriveAccessToken(accessToken);
        setShowGoogleDriveFolderModal(true);
        setConnectTarget(null);
        return;
      } else if (type === 'onedrive') {
        // [2026-04-30] popup picker SDK가 모바일에서 불안정 — 자체 폴더 모달로 교체.
        // OAuth 토큰만 받고, 폴더 선택은 OneDriveFolderModal에서 Graph API로 처리.
        const clientId = process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID;
        if (!clientId) { setConnectErr(t.connectErrMissingId); return; }
        const accessToken = await requestOneDriveAccessToken(clientId);
        setOneDriveAccessToken(accessToken);
        setShowOneDriveFolderModal(true);
        setConnectTarget(null);
        return;
      } else {
        setConnectTarget(null);
        return;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Connection failed';
      if (/popup/i.test(msg))      setConnectErr(t.connectErrPopupBlocked);
      else if (/closed|cancel/i.test(msg)) setConnectErr(t.connectErrCancelled);
      else setConnectErr(msg);
    } finally {
      setConnecting(false);
    }
  }

  // [2026-04-26] 비용 모달 [동기화 시작] 클릭 시 — addSource + Subscribe.
  async function confirmAndStartSync(opts?: { capTop200?: boolean }) {
    if (!pendingPicker) return;
    // [2026-04-29] 로컬은 별도 흐름 — 핸들 IDB 저장 + snapshot 동기 기록.
    if (pendingPicker.type === 'local') {
      await confirmAndStartLocalSync(opts);
      return;
    }
    const { type, accessToken, selections } = pendingPicker;
    const finalSelections = opts?.capTop200
      ? selections.map((s) => s.kind === 'folder'
          ? { ...s, fileCountCap: MAX_FILES_PER_FOLDER, totalFileCount: Math.min(s.totalFileCount, MAX_FILES_PER_FOLDER) }
          : s)
      : selections;

    const tokenExpiry = Date.now() + 3600_000;
    let created;
    if (type === 'google-drive') {
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID!;
      created = addSource(
        { type: 'google-drive', clientId, accessToken, tokenExpiry },
        'Google Drive',
      );
    } else {
      const clientId = process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID!;
      created = addSource(
        { type: 'onedrive', clientId, accessToken, tokenExpiry },
        'OneDrive',
      );
    }
    // selections 패치
    updateSource(created.id, { selections: finalSelections, syncProgress: 0, syncedCount: 0, totalCount: finalSelections.reduce((s, x) => s + x.totalFileCount, 0) });

    // Worker subscription (best-effort — 실패해도 source는 남음)
    try {
      if (type === 'google-drive') {
        const sub = await subscribeGoogleDriveChanges(created.id, accessToken);
        updateSource(created.id, { webhookSubscriptionId: sub.channelId, webhookExpiresAt: sub.expiresAt });
      } else {
        const sub = await subscribeOneDriveChanges(created.id, accessToken);
        updateSource(created.id, { webhookSubscriptionId: sub.subscriptionId, webhookExpiresAt: sub.expiresAt });
      }
    } catch (e) {
      console.warn('[datasources] subscribe failed (Webhook 비활성, polling 사용):', (e as Error).message);
    }

    setPendingPicker(null);
  }

  // [2026-04-29 Tori 19857410] 로컬 picker 결과를 비용 모달용으로 변환.
  // pendingPicker 에 type='local'· accessToken='' 로 통합 보관 (CostPreviewModal 재사용).
  function onLocalPicked(result: LocalPickerResult) {
    setPendingLocal(result);
    setShowLocalPicker(false);
    setPendingPicker({
      type: 'local',
      accessToken: '',
      selections: [result.selection],
    });
  }

  // 비용 모달에서 [동기화 시작] — 로컬 분기 처리.
  async function confirmAndStartLocalSync(opts?: { capTop200?: boolean }) {
    if (!pendingLocal) return;
    const { selection, handle, snapshot, files } = pendingLocal;
    const cap = detectCapability();
    const fileCount = opts?.capTop200 && Array.isArray(files)
      ? Math.min(files.length, MAX_FILES_PER_FOLDER)
      : files.length;

    // 재연결인 경우: 기존 source.id 유지하며 핸들·snapshot 갱신.
    if (reconnectTargetId) {
      if (handle) await saveHandle(reconnectTargetId, handle);
      updateSource(reconnectTargetId, {
        fileCount,
        lastSync: Date.now(),
        localFileSnapshot: snapshot,
        config: {
          type: 'local',
          label: selection.name,
          capability: cap,
          needsReselection: cap === 'drag_drop_only',
        },
      });
      setStatus(reconnectTargetId, 'connected');
      setReconnectTargetId(null);
      setPendingLocal(null);
      setPendingPicker(null);
      return;
    }

    const created = addSource(
      {
        type: 'local',
        label: selection.name,
        capability: cap,
        needsReselection: cap === 'drag_drop_only',
      },
      selection.name,
      handle && handle.kind === 'directory' ? (handle as FileSystemDirectoryHandle) : undefined,
    );
    if (handle) await saveHandle(created.id, handle);
    updateSource(created.id, {
      selections: [selection],
      fileCount,
      lastSync: Date.now(),
      totalCount: fileCount,
      syncedCount: fileCount,
      localFileSnapshot: snapshot,
    });
    setStatus(created.id, 'connected');
    setPendingLocal(null);
    setPendingPicker(null);
  }

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ background: tokens.bg, color: tokens.text, fontFamily: lang === 'ko' ? 'Pretendard, sans-serif' : 'Geist, sans-serif' }}
    >
      <div className="mx-auto w-full max-w-3xl px-6 py-12 md:py-16">

        <header className="mb-8">
          <h1 className="text-[32px] md:text-[40px] font-medium leading-[1.15] tracking-tight">
            {t.title}
          </h1>
          <p className="mt-3 text-[15px]" style={{ color: tokens.textDim }}>
            {t.subtitle}
          </p>
        </header>

        {/* Connected */}
        <section className="mb-8">
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: tokens.textFaint }}>
            {t.connected}
          </h2>
          {sources.length === 0 ? (
            <div
              className="rounded-2xl border p-8 text-center"
              style={{ background: tokens.surface, borderColor: tokens.border }}
            >
              <div className="text-[14px]" style={{ color: tokens.text }}>{t.emptyConn}</div>
              <div className="mt-1 text-[12px]" style={{ color: tokens.textDim }}>{t.emptyHint}</div>
            </div>
          ) : (
            <ul className="space-y-3">
              {sources.map((s) => (
                <li key={s.id}>
                  <ConnectedCard
                    source={s}
                    t={t}
                    progress={syncProgress[s.id]}
                    onDisconnect={() => setConfirmDel(s.id)}
                    onSync={() => runSync(s)}
                    onReconnect={s.config.type === 'local' ? () => runReconnectLocal(s) : undefined}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Available */}
        <section className="mb-8">
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: tokens.textFaint }}>
            {t.available}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {AVAILABLE.map((a) => (
              <AvailableCard
                key={a.type}
                source={a}
                t={t}
                onConnect={() => {
                  setConnectErr(null);
                  // [2026-04-29] 로컬은 OAuth 권한 모달 우회하고 picker 모달 직접 띄움.
                  if (a.type === 'local') {
                    setReconnectTargetId(null);
                    setShowLocalPicker(true);
                  } else {
                    setConnectTarget(a.type);
                  }
                }}
              />
            ))}
          </div>
        </section>

        {/* Privacy notice */}
        <p className="mt-12 text-[11.5px]" style={{ color: tokens.textFaint }}>
          {t.privacy}
        </p>
      </div>

      {confirmDelId && (
        <ConfirmModal
          message={t.confirmDis}
          confirmLabel={t.yesDis}
          cancelLabel={t.cancel}
          onConfirm={() => {
            // [2026-04-29] 로컬 소스라면 IndexedDB 핸들도 정리.
            const target = sources.find((s) => s.id === confirmDelId);
            if (target?.config.type === 'local') {
              void deleteHandle(confirmDelId);
            }
            removeSource(confirmDelId);
            setConfirmDel(null);
          }}
          onCancel={() => setConfirmDel(null)}
        />
      )}

      {connectTarget && (
        <ConnectMiniModal
          t={t}
          target={connectTarget}
          connecting={connecting}
          errorMsg={connectErr}
          onCancel={() => { if (!connecting) setConnectTarget(null); }}
          onConfirm={() => runConnect(connectTarget)}
        />
      )}

      {/* [2026-04-26 Tori 16384118 §3.5] 비용 미리보기 모달 */}
      {pendingPicker && (
        <CostPreviewModal
          lang={lang}
          open={!!pendingPicker}
          selections={pendingPicker.selections}
          onClose={() => {
            setPendingPicker(null);
            setPendingLocal(null);
            setReconnectTargetId(null);
          }}
          onConfirm={() => { void confirmAndStartSync(); }}
          onCapTop200={() => { void confirmAndStartSync({ capTop200: true }); }}
        />
      )}

      {/* [2026-04-29 Tori 19857410] 로컬 드라이브 picker 모달 */}
      {showLocalPicker && (
        <LocalDriveModal
          lang={lang}
          onCancel={() => {
            setShowLocalPicker(false);
            setReconnectTargetId(null);
          }}
          onPicked={(r) => onLocalPicked(r)}
        />
      )}

      {/* [2026-04-30] Google Drive 폴더 선택 모달 — hex 캐시 폴더 자동 숨김 */}
      <GoogleDriveFolderModal
        open={showGoogleDriveFolderModal}
        accessToken={googleDriveAccessToken}
        lang={lang}
        onCancel={() => {
          setShowGoogleDriveFolderModal(false);
          setGoogleDriveAccessToken(null);
        }}
        onPicked={(picked) => {
          setShowGoogleDriveFolderModal(false);
          if (picked.length === 0 || !googleDriveAccessToken) {
            setGoogleDriveAccessToken(null);
            return;
          }
          const validation = validateSelections(picked);
          if (!validation.ok) {
            setConnectErr(describeValidationError(validation.reason, lang));
            setGoogleDriveAccessToken(null);
            return;
          }
          setPendingPicker({ type: 'google-drive', accessToken: googleDriveAccessToken, selections: picked });
          setGoogleDriveAccessToken(null);
        }}
      />

      {/* [2026-04-30] OneDrive 폴더 선택 모달 */}
      <OneDriveFolderModal
        open={showOneDriveFolderModal}
        accessToken={oneDriveAccessToken}
        lang={lang}
        onCancel={() => {
          setShowOneDriveFolderModal(false);
          setOneDriveAccessToken(null);
        }}
        onPicked={(picked) => {
          setShowOneDriveFolderModal(false);
          if (picked.length === 0 || !oneDriveAccessToken) {
            setOneDriveAccessToken(null);
            return;
          }
          const validation = validateSelections(picked);
          if (!validation.ok) {
            setConnectErr(describeValidationError(validation.reason, lang));
            setOneDriveAccessToken(null);
            return;
          }
          setPendingPicker({ type: 'onedrive', accessToken: oneDriveAccessToken, selections: picked });
          setOneDriveAccessToken(null);
        }}
      />
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────

function ConnectedCard({
  source, t, progress, onDisconnect, onSync, onReconnect,
}: {
  source: DataSource;
  t: typeof copy[keyof typeof copy];
  progress?: IndexProgress;
  onDisconnect: () => void;
  onSync: () => void;
  onReconnect?: () => void;
}) {
  const icon = ICON_BY_TYPE[source.type] ?? '📁';
  const status = source.status;
  // [2026-04-29 Tori 19857410] 로컬 capability 안내 (Drag&Drop only인 경우 매 세션 재선택 필요)
  const isLocal = source.config.type === 'local';
  const needsResel = isLocal && (source.config as { needsReselection?: boolean }).needsReselection === true;
  // [2026-04-30 Roy progress] 동기화 중일 때 0~100% 진행률
  const isSyncing = status === 'syncing';
  const pct = progress && progress.total > 0
    ? Math.round((progress.done / progress.total) * 100)
    : (typeof source.syncProgress === 'number' ? source.syncProgress : 0);
  return (
    <div
      className="rounded-2xl border p-5"
      style={{ background: tokens.surface, borderColor: tokens.border }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="text-[24px] leading-none">{icon}</span>
          <div className="min-w-0">
            <div className="text-[15px] font-medium truncate" style={{ color: tokens.text }}>
              {source.name}
            </div>
            <div className="mt-0.5 text-[12px] truncate" style={{ color: tokens.textDim }}>
              {folderPath(source)}
            </div>
          </div>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[11px]"
          style={{
            background:
              status === 'connected'           ? 'rgba(16,163,127,0.10)' :
              status === 'error'               ? 'rgba(204,68,68,0.10)' :
              status === 'permission_required' ? 'rgba(204,68,68,0.10)' :
              status === 'has_updates'         ? 'rgba(241,196,15,0.14)' :
                                                 tokens.surfaceAlt,
            color:
              status === 'connected'           ? tokens.success :
              status === 'error'               ? tokens.danger :
              status === 'permission_required' ? tokens.danger :
              status === 'has_updates'         ? '#a07e0a' :
                                                 tokens.textDim,
          }}
          title={
            status === 'has_updates' ? t.statusUpdates :
            status === 'permission_required' ? t.permRequired :
            undefined
          }
        >
          {
            status === 'connected'           ? t.connectedBadge :
            status === 'syncing'             ? t.syncing :
            status === 'error'               ? t.error :
            status === 'has_updates'         ? `🟡 ${t.statusUpdates}` :
            status === 'permission_required' ? `🔴 ${t.statusPermReq}` :
            status
          }
        </span>
      </div>

      <div className="mt-3 text-[12px]" style={{ color: tokens.textFaint }}>
        {source.fileCount != null && t.files(source.fileCount)}
        {source.lastSync ? ` · ${t.syncedAgo(fmtRelative(source.lastSync, copy.ko))}` : ''}
      </div>

      {needsResel && (
        <div className="mt-2 text-[11px]" style={{ color: tokens.textFaint }}>
          ⚠️ {t.needsResel}
        </div>
      )}

      {/* [2026-04-30 Roy progress] 동기화 중 — 미니멀 프로그레스 바 + 현재 파일 + % */}
      {isSyncing && (
        <div className="mt-3" aria-live="polite">
          <div className="flex items-baseline justify-between gap-3 text-[11.5px] tabular-nums" style={{ color: tokens.textDim }}>
            <span className="truncate" title={progress?.current ?? ''}>
              {progress?.current
                ? progress.current
                : (t.syncing + '…')}
            </span>
            <span className="shrink-0" style={{ color: tokens.text, fontWeight: 500 }}>
              {progress && progress.total > 0
                ? `${progress.done} / ${progress.total} · ${pct}%`
                : `${pct}%`}
            </span>
          </div>
          <div
            className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full"
            style={{ background: tokens.surfaceAlt }}
          >
            <div
              className={`h-full rounded-full transition-[width] duration-300 ease-out ${pct === 0 ? 'animate-pulse' : ''}`}
              style={{
                // 0% 일 때 얇은 indicator (8%)로 indeterminate 느낌
                width: `${pct === 0 ? 8 : pct}%`,
                background: tokens.accent,
              }}
            />
          </div>
          {progress && progress.errors.length > 0 && (
            <div className="mt-1.5 text-[11px]" style={{ color: tokens.danger }}>
              {progress.errors.length}개 오류
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {status === 'permission_required' && onReconnect ? (
          <button
            type="button"
            onClick={onReconnect}
            className="rounded-md px-3 py-1.5 text-[12px] transition-colors"
            style={{ background: tokens.text, color: tokens.bg }}
          >
            {t.reconnect}
          </button>
        ) : (
          <button
            type="button"
            onClick={onSync}
            disabled={isSyncing}
            className="rounded-md px-3 py-1.5 text-[12px] transition-colors"
            style={{ background: tokens.surfaceAlt, color: tokens.text, opacity: isSyncing ? 0.5 : 1, cursor: isSyncing ? 'not-allowed' : 'pointer' }}
          >
            {isSyncing ? `${t.syncing}…` : t.sync}
          </button>
        )}
        <button
          type="button"
          onClick={onDisconnect}
          disabled={isSyncing}
          className="rounded-md px-3 py-1.5 text-[12px] transition-colors hover:bg-black/5"
          style={{ color: tokens.danger, opacity: isSyncing ? 0.5 : 1 }}
        >
          {t.disconnect}
        </button>
      </div>
    </div>
  );
}

function AvailableCard({
  source, t, onConnect,
}: {
  source: AvailableSource;
  t: typeof copy[keyof typeof copy];
  onConnect: () => void;
}) {
  // [2026-04-29] 'local' 라벨은 t.localLabel 사용 (다국어), 클라우드는 source.label (브랜드명).
  const displayLabel = source.type === 'local' ? t.localLabel : source.label;
  return (
    <div
      className="rounded-2xl border p-4 text-center"
      style={{ background: tokens.surface, borderColor: tokens.border }}
    >
      <div className="text-[28px] leading-none">{source.icon}</div>
      <div className="mt-2 text-[13px] font-medium truncate" style={{ color: tokens.text }}>
        {displayLabel}
      </div>
      {source.enabled ? (
        <button
          type="button"
          onClick={onConnect}
          className="mt-3 w-full rounded-md py-1.5 text-[12px] font-medium transition-opacity hover:opacity-80"
          style={{ background: tokens.text, color: tokens.bg }}
        >
          {t.connect}
        </button>
      ) : (
        <div className="mt-2 text-[10.5px]" style={{ color: tokens.textFaint }}>
          {t.coming}
        </div>
      )}
    </div>
  );
}

function ConfirmModal({
  message, confirmLabel, cancelLabel, onConfirm, onCancel,
}: {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.32)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-xs rounded-2xl p-6"
        style={{ background: tokens.surface, color: tokens.text }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[15px]">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg px-4 py-2 text-[13px]" style={{ color: tokens.textDim }}>
            {cancelLabel}
          </button>
          <button onClick={onConfirm} className="rounded-lg px-4 py-2 text-[13px] text-white" style={{ background: tokens.danger }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// P2.2 — design1 톤 OAuth 권한 공개 모달 (Tori 명세, LegacyHandoff 대체)
function ConnectMiniModal({
  t, target, connecting, errorMsg, onCancel, onConfirm,
}: {
  t: typeof copy[keyof typeof copy];
  target: DataSourceType;
  connecting: boolean;
  errorMsg: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const headingTitle = target === 'google-drive' ? t.connectGdrive : t.connectOnedrive;
  const icon = target === 'google-drive' ? '☁️' : '📁';
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.32)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl p-7"
        style={{ background: tokens.surface, color: tokens.text, boxShadow: '0 24px 60px rgba(0,0,0,0.16)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-[18px] font-medium">
          <span>{icon}</span>
          <span>{headingTitle}</span>
        </div>

        <p className="mt-5 text-[13px]" style={{ color: tokens.textDim }}>
          {t.permsHeading}
        </p>
        <ul className="mt-3 space-y-1.5 text-[13.5px]">
          <li className="flex items-baseline gap-2" style={{ color: tokens.text }}>
            <span style={{ color: tokens.success }}>✓</span>
            <span>{t.permRead}</span>
          </li>
          <li className="flex items-baseline gap-2" style={{ color: tokens.textDim }}>
            <span style={{ color: tokens.danger }}>✗</span>
            <span style={{ textDecoration: 'line-through' }}>{t.permModify}</span>
          </li>
        </ul>

        <p className="mt-5 text-[12px]" style={{ color: tokens.textFaint }}>
          {t.privacyNote}
        </p>

        {errorMsg && (
          <div
            className="mt-4 rounded-lg px-3 py-2.5 text-[12.5px]"
            style={{ background: 'rgba(204,68,68,0.08)', color: tokens.danger }}
          >
            {errorMsg}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={connecting}
            className="rounded-lg px-4 py-2.5 text-[13px] disabled:opacity-40"
            style={{ color: tokens.textDim }}
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={connecting}
            className="rounded-lg px-4 py-2.5 text-[13px] font-medium transition-opacity disabled:opacity-50"
            style={{ background: tokens.accent, color: '#fff' }}
          >
            {connecting ? t.connecting : t.continueOauth}
          </button>
        </div>
      </div>
    </div>
  );
}
