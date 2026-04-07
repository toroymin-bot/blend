// Blend - WebDAV Connector (NAS: Synology, QNAP, Nextcloud, etc.)
// All requests go through /api/webdav-proxy to avoid browser CORS restrictions.
// Supports PROPFIND (directory listing) + GET (file download).

const PROXY = '/api/webdav-proxy';
const SUPPORTED_EXTS = new Set(['xlsx', 'xls', 'csv', 'txt', 'md', 'pdf']);

export interface WebDAVItem {
  path: string;        // absolute path on the server
  name: string;
  isDir: boolean;
  size?: number;
  lastModified?: string;
}

interface ProxyRequest {
  method: 'PROPFIND' | 'GET';
  serverUrl: string;
  path: string;
  username: string;
  password: string;
  depth?: string;
}

async function callProxy(req: ProxyRequest): Promise<Response> {
  const res = await fetch(PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => String(res.status));
    throw new Error(`WebDAV 오류: ${msg}`);
  }
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
  const res = await callProxy({ method: 'PROPFIND', serverUrl, path: normPath, username, password, depth: '1' });
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
  const res = await callProxy({ method: 'GET', serverUrl, path: item.path, username, password });
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
  await callProxy({ method: 'PROPFIND', serverUrl, path: basePath || '/', username, password, depth: '0' });
}
