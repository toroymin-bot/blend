// Blend - Source Indexer
// Orchestrates: scan → parse → embed → save to IndexedDB
// Works with any data source type (local, Google Drive, OneDrive, WebDAV).

import { DataSource, GoogleDriveConfig, OneDriveConfig, WebDAVConfig, LocalSourceConfig } from '@/types';
import { parseDocument, generateEmbeddings, ParsedDocument } from '@/modules/plugins/document-plugin';
import { saveDocument, getAllDocuments, deleteDocument, getActiveDocIds, setActiveDocIds } from '@/lib/vector-db';

// ── Connector imports ─────────────────────────────────────────────────────────
import { scanLocalDirectory, readLocalFile, verifyLocalPermission } from './connectors/local-connector';
import { scanDriveFolder, downloadDriveFile, isTokenValid as googleTokenValid } from './connectors/google-drive-connector';
import { scanOneDriveFolder, downloadOneDriveFile, isTokenValid as msTokenValid } from './connectors/onedrive-connector';
import { scanWebDAVPath, downloadWebDAVFile } from './connectors/webdav-connector';

export type IndexStage = 'scanning' | 'indexing' | 'done';

export type IndexProgress = {
  total: number;
  done: number;
  current: string;
  errors: string[];
  // [2026-05-01 Roy] 단계 표시 — scan 중엔 total=0이라 % 의미 없음. UI에서 단계별 라벨.
  stage?: IndexStage;
};

export type ProgressCallback = (p: IndexProgress) => void;

// Each indexed document carries a source tag so we can re-sync / remove stale entries
function sourceTag(sourceId: string): string { return `__source:${sourceId}`; }

/** Remove all IndexedDB documents that belong to a given source. */
export async function clearSourceDocs(sourceId: string): Promise<void> {
  const all = await getAllDocuments();
  const tag = sourceTag(sourceId);
  await Promise.all(
    all.filter((d) => d.name.startsWith(tag)).map((d) => deleteDocument(d.id))
  );
}

/**
 * Main indexing entry point.
 * Downloads all supported files from the data source, parses, embeds, and saves.
 *
 * @param source - The DataSource record from the store
 * @param apiKey - Embedding API key (OpenAI or Google)
 * @param embeddingProvider - Which provider to use for embeddings
 * @param dirHandle - Required for 'local' type; the FileSystemDirectoryHandle
 * @param onProgress - Optional progress callback
 * @param signal - Optional AbortSignal — when aborted, the loop stops at the
 *                 next safe point and the function returns partial results.
 * @returns Number of successfully indexed files
 */
export async function indexSource(
  source: DataSource,
  apiKey: string,
  embeddingProvider: 'openai' | 'google',
  dirHandle?: FileSystemDirectoryHandle,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<{ indexed: number; errors: string[]; cancelled?: boolean }> {
  const progress: IndexProgress = { total: 0, done: 0, current: '', errors: [], stage: 'scanning' };
  const report = () => onProgress?.(structuredClone(progress));
  // [2026-05-01 Roy] 시작 즉시 첫 콜백 — scan 단계라도 UI가 즉시 반응 (이전엔 progress.total=0
  // 콜백이 scan 끝난 후에만 와서 UI가 0%로 멈춰 보였음).
  report();

  let files: Array<{ name: string; getFile: () => Promise<File> }> = [];

  // ── Collect file list per source type ─────────────────────────────────────
  if (source.type === 'local') {
    if (!dirHandle) throw new Error('Local source requires a directory handle.');
    const ok = await verifyLocalPermission(dirHandle);
    if (!ok) throw new Error('Folder access permission was denied.');
    const localFiles = await scanLocalDirectory(dirHandle);
    files = localFiles.map((lf) => ({ name: lf.path, getFile: () => readLocalFile(lf) }));
  }

  else if (source.type === 'google-drive') {
    const cfg = source.config as GoogleDriveConfig;
    if (!cfg.accessToken || !googleTokenValid(cfg.tokenExpiry)) {
      throw new Error('Google Drive access token has expired. Please reconnect.');
    }
    // [2026-05-01 Roy] source.selections를 사용해 사용자가 선택한 폴더만 scan.
    // 이전엔 cfg.folderId(자체 picker는 설정 안 함)가 undefined여서 root 전체 scan.
    const sels = source.selections ?? [];
    if (sels.length > 0) {
      progress.total = sels.length;
      progress.stage = 'scanning';
      report();
      for (const sel of sels) {
        if (signal?.aborted) {
          return { indexed: progress.done - progress.errors.length, errors: progress.errors, cancelled: true };
        }
        progress.current = sel.name;
        report();
        if (sel.kind === 'folder') {
          // [2026-05-01 Roy] 폴더 선택 시 하위 폴더 모두 재귀 동기화 — 사용자 명시 요청.
          // 이전엔 비재귀 default였으나 사용자가 폴더 선택 = '안의 모든 것 검색 가능'을
          // 기대. picker 모달의 cost preview는 1단계만 카운트하므로 실제 인덱싱 결과가
          // 더 많을 수 있음(trade-off). 폭증 방지는 파일 size별 안전장치에 위임.
          const folderFiles = await scanDriveFolder(cfg.accessToken, sel.id, { recursive: true });
          files.push(...folderFiles.map((f) => ({
            name: f.name,
            getFile: () => downloadDriveFile(cfg.accessToken!, f),
          })));
        } else {
          // file selection — id로 metadata 한 번 fetch 후 download
          files.push({
            name: sel.name,
            getFile: async () => {
              const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${sel.id}?fields=id,name,mimeType,size`, {
                headers: { Authorization: `Bearer ${cfg.accessToken}` },
              });
              if (!metaRes.ok) throw new Error(`Drive metadata fetch failed: ${sel.name}`);
              const meta = await metaRes.json();
              return downloadDriveFile(cfg.accessToken!, meta);
            },
          });
        }
        progress.done++;
        report();
      }
      progress.done = 0; // indexing 단계에서 0부터 다시 카운트
    } else if (cfg.folderId) {
      // legacy compat: selections 없는 기존 source는 cfg.folderId 사용
      const driveFiles = await scanDriveFolder(cfg.accessToken, cfg.folderId);
      files = driveFiles.map((f) => ({
        name: f.name,
        getFile: () => downloadDriveFile(cfg.accessToken!, f),
      }));
    }
    // selections 비어 있고 folderId도 없으면 빈 배열 (root 전체 scan 절대 X)
  }

  else if (source.type === 'onedrive') {
    const cfg = source.config as OneDriveConfig;
    // [2026-05-01 Roy] 토큰 만료 시 자동 refresh — refresh_token 있으면 새 access_token
    // 받아서 store 업데이트 + 진행. 사용자에게 "동기화 → 오류 → 동기화 → 오류" 사이클
    // 차단. refresh 실패 또는 refresh_token 없으면 명확한 안내 throw (재연결 유도).
    if (!cfg.accessToken || !msTokenValid(cfg.tokenExpiry)) {
      if (cfg.refreshToken) {
        try {
          const { refreshOneDriveToken } = await import('@/lib/connectors/onedrive-connector');
          const refreshed = await refreshOneDriveToken(cfg.refreshToken, cfg.clientId, cfg.tenantId);
          // Microsoft는 refresh_token도 회전 — 응답에 새 것 있으면 그 것을 저장.
          const newRefreshToken = refreshed.refreshToken ?? cfg.refreshToken;
          cfg.accessToken = refreshed.token;
          cfg.tokenExpiry = refreshed.expiry;
          cfg.refreshToken = newRefreshToken;
          // store 영구 갱신 — 다음 sync도 새 token 사용. dynamic import로 의존성 격리.
          const { useDataSourceStore } = await import('@/stores/datasource-store');
          useDataSourceStore.getState().updateSource(source.id, {
            config: { ...cfg },
          });
        } catch {
          throw new Error('OneDrive 연결이 만료됐어요. 데이터 소스 페이지에서 다시 연결해주세요.');
        }
      } else {
        throw new Error('OneDrive 연결이 만료됐어요. 데이터 소스 페이지에서 다시 연결해주세요.');
      }
    }
    // [2026-05-01 Roy] source.selections 우선 — root 전체 scan으로 인한 Graph API 429 방지.
    const sels = source.selections ?? [];
    if (sels.length > 0) {
      progress.total = sels.length;
      progress.stage = 'scanning';
      report();
      for (const sel of sels) {
        if (signal?.aborted) {
          return { indexed: progress.done - progress.errors.length, errors: progress.errors, cancelled: true };
        }
        progress.current = sel.name;
        report();
        if (sel.kind === 'folder') {
          // [2026-05-01 Roy] 폴더 선택 시 하위 폴더 모두 재귀 동기화 — Google Drive와 동일 처리.
          const folderFiles = await scanOneDriveFolder(cfg.accessToken, sel.id, { recursive: true });
          files.push(...folderFiles.map((f) => ({
            name: f.name,
            getFile: () => downloadOneDriveFile(cfg.accessToken!, f),
          })));
        } else {
          files.push({
            name: sel.name,
            getFile: async () => {
              const metaRes = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${sel.id}`, {
                headers: { Authorization: `Bearer ${cfg.accessToken}` },
              });
              if (!metaRes.ok) throw new Error(`OneDrive metadata fetch failed: ${sel.name}`);
              const meta = await metaRes.json();
              return downloadOneDriveFile(cfg.accessToken!, meta);
            },
          });
        }
        progress.done++;
        report();
      }
      progress.done = 0;
    } else if (cfg.folderId) {
      const odFiles = await scanOneDriveFolder(cfg.accessToken, cfg.folderId);
      files = odFiles.map((f) => ({
        name: f.name,
        getFile: () => downloadOneDriveFile(cfg.accessToken!, f),
      }));
    }
  }

  else if (source.type === 'webdav') {
    const cfg = source.config as WebDAVConfig;
    const davFiles = await scanWebDAVPath(cfg.serverUrl, cfg.basePath || '/', cfg.username, cfg.password);
    files = davFiles.map((f) => ({
      name: f.name,
      getFile: () => downloadWebDAVFile(cfg.serverUrl, f, cfg.username, cfg.password),
    }));
  }

  progress.total = files.length;
  progress.stage = 'indexing';
  report();

  // ── Clear previous index for this source ──────────────────────────────────
  await clearSourceDocs(source.id);

  // ── Parse + embed + save each file ───────────────────────────────────────
  for (const f of files) {
    if (signal?.aborted) {
      return { indexed: progress.done - progress.errors.length, errors: progress.errors, cancelled: true };
    }
    progress.current = f.name;
    report();

    try {
      // [2026-05-01 Roy] file-level hard timeout — 한 파일이 600초(10분) 넘게
      // 처리되면 abort. 이전 5분은 10MB PDF + OCR 20페이지 케이스에서 부족
      // (페이지당 vision API 5초 × 20 = 100s + 임베딩). 10분으로 여유.
      // AbortController가 user signal과 합성 → timeout 시 그 파일만 error로
      // 기록하고 다음 파일로 진행.
      const FILE_TIMEOUT_MS = 600_000;
      const fileCtrl = new AbortController();
      const tid = setTimeout(() => fileCtrl.abort(new DOMException('File processing exceeded 10 min', 'TimeoutError')), FILE_TIMEOUT_MS);
      // user signal abort 시 file ctrl도 abort.
      const onUserAbort = () => fileCtrl.abort();
      signal?.addEventListener('abort', onUserAbort, { once: true });

      try {
        const rawFile = await f.getFile();
        // [2026-05-01 Roy] 단일 파일 사이즈 한도 — 50MB 넘으면 다운로드 직후
        // skip해 메모리 보호 + 사용자에게 명확한 사유.
        const SINGLE_FILE_MAX_BYTES = 50 * 1024 * 1024;
        if (rawFile.size > SINGLE_FILE_MAX_BYTES) {
          const mb = (rawFile.size / 1024 / 1024).toFixed(1);
          throw new Error(`Skipped — file too large (${mb}MB > 50MB limit). Split into smaller files.`);
        }
        // [2026-05-01 Roy] parseDocument에 apiKey/provider/signal/onSubProgress 전달
        //   - image PDF 자동 OCR fallback (vision API)
        //   - OCR 페이지별 진행률을 progress.current에 즉시 반영해 UI 멈춤 방지
        let doc: ParsedDocument = await parseDocument(rawFile, {
          apiKey,
          provider: embeddingProvider,
          signal: fileCtrl.signal,
          onSubProgress: (label) => {
            progress.current = label;
            report();
          },
        });

        // Prefix the doc name with source tag so we can identify it later
        doc = { ...doc, name: `${sourceTag(source.id)}/${f.name}` };

        // Generate embeddings if API key available
        if (apiKey) {
          // [2026-05-01 Roy] file-level fileCtrl.signal 사용 — 한 파일 5분
          // timeout이 임베딩 fetch에도 적용되어 hang 방지.
          progress.current = `🧮 임베딩 ${f.name}`;
          report();
          doc = await generateEmbeddings(doc, apiKey, embeddingProvider, undefined, fileCtrl.signal);
        }

        await saveDocument(doc);
        // [2026-04-13] BUG-010: datasource 동기화 후 activeDocIds에 추가 누락 → RAG 검색 안 됨
        // saveDocument()만 호출하면 IndexedDB에 저장되지만 active 목록에는 없어서 buildContext()가 무시
        const currentActive = await getActiveDocIds();
        if (!currentActive.includes(doc.id)) {
          await setActiveDocIds([...currentActive, doc.id]);
        }
      } finally {
        clearTimeout(tid);
        signal?.removeEventListener('abort', onUserAbort);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // [2026-05-01 Roy] 모바일 디버깅용 — store.error에 stack 첫 프레임도 포함.
      // "undefined is not a function (near '...')" 류 런타임 에러는 stack에서 진짜
      // throw 위치(파일:줄)가 보임. 데스크톱에선 콘솔 객체로도 확인 가능.
      console.error(`[indexSource] ${f.name} failed:`, err);
      const stackFirstFrame = err instanceof Error && err.stack
        ? err.stack.split('\n').slice(1, 2).join(' ').trim().slice(0, 120)
        : '';
      // [2026-05-01 Roy] TimeoutError는 명확한 사유 표시 — '10분 초과'.
      const reason = err instanceof DOMException && err.name === 'TimeoutError'
        ? '10분 초과 — 파일이 너무 크거나 OCR이 매우 느림 (skip하고 다음 파일 진행)'
        : (stackFirstFrame ? `${msg} @ ${stackFirstFrame}` : msg);
      progress.errors.push(`${f.name}: ${reason}`);
    }

    progress.done++;
    report();
  }

  progress.stage = 'done';
  progress.current = '';
  report();

  return { indexed: progress.done - progress.errors.length, errors: progress.errors };
}

/** Return display-friendly source prefix (strips internal tag). */
export function stripSourceTag(docName: string): string {
  return docName.replace(/^__source:[^/]+\//, '');
}
