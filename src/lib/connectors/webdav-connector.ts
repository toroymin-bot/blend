// Blend - WebDAV Connector (NAS: Synology, QNAP, Nextcloud, etc.)
// [2026-04-12 01:07] 기능: 서버 프록시 → 클라이언트 직접 WebDAV 호출 전환 — 이유: output:'export' 정적 빌드
// 주의: WebDAV 서버가 CORS를 허용해야 동작 (Nextcloud는 허용, Synology/QNAP는 설정 필요)
// 기존: /api/webdav-proxy를 통한 서버사이드 프록시
const SUPPORTED_EXTS = new Set(['xlsx', 'xls', 'csv', 'txt', 'md', 'pdf']);

export interface WebDAVItem {
  path: string;        // absolute path on the server
  name: string;
  isDir: boolean;
  size?: number;
  lastModified?: string;
}

// [2026-04-12 01:07] 기존 서버 프록시 방식 비활성화
// interface ProxyRequest { method: 'PROPFIND' | 'GET'; serverUrl: string; path: string; username: string; password: string; depth?: string; }
// const PROXY = '/api/webdav-proxy';
// async function callProxy(req: ProxyRequest): Promise<Response> {
//   const res = await fetch(PROXY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
//   if (!res.ok) { const msg = await res.text().catch(() => String(res.status)); throw new Error(`WebDAV 오류: ${msg}`); }
//   return res;
// }

/** 클라이언트에서 WebDAV 서버로 직접 요청 (서버가 CORS 허용해야 동작) */
async function callDirect(method: 'PROPFIND' | 'GET', serverUrl: string, path: string, username: string, password: string, depth?: string): Promise<Response> {
  const targetUrl = path.startsWith('http') ? path : `${serverUrl.replace(/\/$/, '')}${path}`;
  const headers: Record<string, string> = {
    'Authorization': `Basic ${btoa(`${username}:${password}`)}`,
  };
  if (method === 'PROPFIND') {
    headers['Depth'] = depth ?? '1';
    headers['Content-Type'] = 'application/xml';
  }
  const res = await fetch(targetUrl, {
    method,
    headers,
    body: method === 'PROPFIND'
      ? '<?xml version="1.0"?><D:propfind xmlns:D="DAV:"><D:allprop/></D:propfind>'
      : undefined,
  });
  if (!res.ok) throw new Error(`WebDAV error: HTTP ${res.status} — the server may not allow CORS`);
  return res;
}

/** Parse a WebDAV PROPFIND XML response into a flat list of items. */
function parsePropfind(xml: string, basePath: string): WebDAVItem[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const responses = Array.from(doc.querySelectorAll('response'));
  const items: WebDAVItem[] = [];

  for (const resp of responses) {
    const href = decodeURIComponent(resp.querySelector('href')?.textContent?.trim() ?? '');
    if (!href || href === basePath || href === basePath + '/') continue;
    const isDir = !!resp.querySelector('resourcetype collection');
    const size = parseInt(resp.querySelector('getcontentlength')?.textContent ?? '0', 10);
    const lastModified = resp.querySelector('getlastmodified')?.textContent ?? undefined;
    const name = href.split('/').filter(Boolean).pop() ?? '';
    items.push({ path: href, name, isDir, size: isNaN(size) ? undefined : size, lastModified });
  }

  return items;
}

/** Recursively list all supported files under a WebDAV path. */
export async function scanWebDAVPath(
  serverUrl: string,
  basePath: string,
  username: string,
  password: string
): Promise<WebDAVItem[]> {
  const normPath = basePath.endsWith('/') ? basePath : basePath + '/';
  const res = await callDirect('PROPFIND', serverUrl, normPath, username, password, '1');
  const xml = await res.text();
  const items = parsePropfind(xml, normPath);
  const result: WebDAVItem[] = [];

  for (const item of items) {
    if (item.isDir) {
      const sub = await scanWebDAVPath(serverUrl, item.path, username, password);
      result.push(...sub);
    } else {
      const ext = item.name.split('.').pop()?.toLowerCase() ?? '';
      if (SUPPORTED_EXTS.has(ext)) result.push(item);
    }
  }

  return result;
}

/** Download a WebDAV file as a File object. */
export async function downloadWebDAVFile(
  serverUrl: string,
  item: WebDAVItem,
  username: string,
  password: string
): Promise<File> {
  const res = await callDirect('GET', serverUrl, item.path, username, password);
  const blob = await res.blob();
  return new File([blob], item.name);
}

/** Quick connectivity check — PROPFIND depth 0 on the base path. */
export async function testWebDAVConnection(
  serverUrl: string,
  basePath: string,
  username: string,
  password: string
): Promise<void> {
  await callDirect('PROPFIND', serverUrl, basePath || '/', username, password, '0');
}
