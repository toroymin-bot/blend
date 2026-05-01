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
 * @returns Number of successfully indexed files
 */
export async function indexSource(
  source: DataSource,
  apiKey: string,
  embeddingProvider: 'openai' | 'google',
  dirHandle?: FileSystemDirectoryHandle,
  onProgress?: ProgressCallback
): Promise<{ indexed: number; errors: string[] }> {
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
    const driveFiles = await scanDriveFolder(cfg.accessToken, cfg.folderId);
    files = driveFiles.map((f) => ({
      name: f.name,
      getFile: () => downloadDriveFile(cfg.accessToken!, f),
    }));
  }

  else if (source.type === 'onedrive') {
    const cfg = source.config as OneDriveConfig;
    if (!cfg.accessToken || !msTokenValid(cfg.tokenExpiry)) {
      throw new Error('OneDrive access token has expired. Please reconnect.');
    }
    const odFiles = await scanOneDriveFolder(cfg.accessToken, cfg.folderId);
    files = odFiles.map((f) => ({
      name: f.name,
      getFile: () => downloadOneDriveFile(cfg.accessToken!, f),
    }));
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
    progress.current = f.name;
    report();

    try {
      const rawFile = await f.getFile();
      let doc: ParsedDocument = await parseDocument(rawFile);

      // Prefix the doc name with source tag so we can identify it later
      doc = { ...doc, name: `${sourceTag(source.id)}/${f.name}` };

      // Generate embeddings if API key available
      if (apiKey) {
        doc = await generateEmbeddings(doc, apiKey, embeddingProvider);
      }

      await saveDocument(doc);
      // [2026-04-13] BUG-010: datasource 동기화 후 activeDocIds에 추가 누락 → RAG 검색 안 됨
      // saveDocument()만 호출하면 IndexedDB에 저장되지만 active 목록에는 없어서 buildContext()가 무시
      const currentActive = await getActiveDocIds();
      if (!currentActive.includes(doc.id)) {
        await setActiveDocIds([...currentActive, doc.id]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      progress.errors.push(`${f.name}: ${msg}`);
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
