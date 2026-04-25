'use client';

/**
 * D1DataSourcesView — Design1 DataSources view
 * "AI가 참고할 정보 폴더를 연결하세요."
 *
 * 기존 useDataSourceStore + OAuth 모듈 재사용.
 */

import { useEffect, useState } from 'react';
import { useDataSourceStore } from '@/stores/datasource-store';
import type { DataSource, DataSourceType } from '@/types';
// P2.2 OAuth 직접 흐름 (Tori 명세 — LegacyHandoff 제거)
import { requestGoogleAccessToken } from '@/lib/connectors/google-drive-connector';
import { requestOneDriveAccessToken } from '@/lib/connectors/onedrive-connector';

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
const AVAILABLE: AvailableSource[] = [
  { type: 'google-drive', label: 'Google Drive', icon: '☁️', enabled: true },
  { type: 'onedrive',     label: 'OneDrive',     icon: '📁', enabled: true },
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
  const loadFromStorage = useDataSourceStore((s) => s.loadFromStorage);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  const [confirmDelId, setConfirmDel] = useState<string | null>(null);
  // P2.2 — 연결 미니 모달 상태 (LegacyHandoff 제거)
  const [connectTarget, setConnectTarget] = useState<DataSourceType | null>(null);
  const [connecting, setConnecting]       = useState(false);
  const [connectErr, setConnectErr]       = useState<string | null>(null);

  async function runConnect(type: DataSourceType) {
    setConnecting(true);
    setConnectErr(null);
    try {
      if (type === 'google-drive') {
        const clientId = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID;
        if (!clientId) { setConnectErr(t.connectErrMissingId); return; }
        const token = await requestGoogleAccessToken(clientId);
        addSource(
          { type: 'google-drive', clientId, accessToken: token, tokenExpiry: Date.now() + 3600_000 },
          'Google Drive',
        );
      } else if (type === 'onedrive') {
        const clientId = process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID;
        if (!clientId) { setConnectErr(t.connectErrMissingId); return; }
        const token = await requestOneDriveAccessToken(clientId);
        addSource(
          { type: 'onedrive', clientId, accessToken: token, tokenExpiry: Date.now() + 3600_000 },
          'OneDrive',
        );
      }
      setConnectTarget(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Connection failed';
      if (/popup/i.test(msg))      setConnectErr(t.connectErrPopupBlocked);
      else if (/closed|cancel/i.test(msg)) setConnectErr(t.connectErrCancelled);
      else setConnectErr(msg);
    } finally {
      setConnecting(false);
    }
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
                    onDisconnect={() => setConfirmDel(s.id)}
                    onSync={() => { /* TODO: 실제 동기화 — 다음 nighttask로 분리 */ }}
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
                onConnect={() => { setConnectErr(null); setConnectTarget(a.type); }}
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
          onConfirm={() => { removeSource(confirmDelId); setConfirmDel(null); }}
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
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────

function ConnectedCard({
  source, t, onDisconnect, onSync,
}: {
  source: DataSource;
  t: typeof copy[keyof typeof copy];
  onDisconnect: () => void;
  onSync: () => void;
}) {
  const icon = ICON_BY_TYPE[source.type] ?? '📁';
  const status = source.status;
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
              status === 'connected' ? 'rgba(16,163,127,0.10)' :
              status === 'error'     ? 'rgba(204,68,68,0.10)' :
                                       tokens.surfaceAlt,
            color:
              status === 'connected' ? tokens.success :
              status === 'error'     ? tokens.danger :
                                       tokens.textDim,
          }}
        >
          {status === 'connected' ? t.connectedBadge : status === 'syncing' ? t.syncing : status === 'error' ? t.error : status}
        </span>
      </div>

      <div className="mt-3 text-[12px]" style={{ color: tokens.textFaint }}>
        {source.fileCount != null && t.files(source.fileCount)}
        {source.lastSync ? ` · ${t.syncedAgo(fmtRelative(source.lastSync, copy.ko))}` : ''}
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onSync}
          className="rounded-md px-3 py-1.5 text-[12px] transition-colors"
          style={{ background: tokens.surfaceAlt, color: tokens.text }}
        >
          {t.sync}
        </button>
        <button
          type="button"
          onClick={onDisconnect}
          className="rounded-md px-3 py-1.5 text-[12px] transition-colors hover:bg-black/5"
          style={{ color: tokens.danger }}
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
  return (
    <div
      className="rounded-2xl border p-4 text-center"
      style={{ background: tokens.surface, borderColor: tokens.border }}
    >
      <div className="text-[28px] leading-none">{source.icon}</div>
      <div className="mt-2 text-[13px] font-medium truncate" style={{ color: tokens.text }}>
        {source.label}
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
