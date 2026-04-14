// Blend - OneDrive Connector (Microsoft Graph API)
// OAuth 2.0 implicit flow — BYOK client_id from Azure App Registration.
// Scope: Files.Read — read-only access.

const GRAPH_API = 'https://graph.microsoft.com/v1.0';
const SUPPORTED_EXTS = new Set(['xlsx', 'xls', 'csv', 'txt', 'md', 'pdf']);

export interface OneDriveItem {
  id: string;
  name: string;
  size?: number;
  lastModifiedDateTime: string;
  file?: { mimeType: string };
  folder?: object;
  '@microsoft.graph.downloadUrl'?: string;
}

// ── OAuth helpers ─────────────────────────────────────────────────────────────

export function requestOneDriveAccessToken(
  clientId: string,
  tenantId = 'common'
): Promise<string> {
  return new Promise((resolve, reject) => {
    const redirectUri = `${window.location.origin}/oauth-callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'token',
      redirect_uri: redirectUri,
      scope: 'Files.Read offline_access',
      state: 'onedrive',
    });

    // Clear stale result before opening popup
    try { localStorage.removeItem('blend:oauth_result'); } catch {}

    const popup = window.open(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params}`,
      'onedrive-oauth',
      'width=520,height=620,left=200,top=100'
    );

    if (!popup) { reject(new Error('Popup was blocked.')); return; }

    let settled = false;

    const done = (token: string) => {
      if (settled) return; settled = true;
      cleanup(); resolve(token);
    };
    const fail = (msg: string) => {
      if (settled) return; settled = true;
      cleanup(); reject(new Error(msg));
    };

    // 1. window.message (desktop browsers)
    const msgHandler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'OAUTH_TOKEN' && e.data?.provider === 'onedrive') done(e.data.token as string);
      if (e.data?.type === 'OAUTH_ERROR' && e.data?.provider === 'onedrive') fail(e.data.error);
    };
    window.addEventListener('message', msgHandler);

    // 2. BroadcastChannel (iOS Safari / Firefox — opener is null when tab opens)
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('oauth_callback');
      bc.onmessage = (e) => {
        if (e.data?.type === 'OAUTH_TOKEN' && e.data?.provider === 'onedrive') done(e.data.token as string);
        if (e.data?.type === 'OAUTH_ERROR' && e.data?.provider === 'onedrive') fail(e.data.error);
      };
    } catch {}

    // 3. localStorage polling fallback
    const poll = setInterval(() => {
      try {
        const raw = localStorage.getItem('blend:oauth_result');
        if (raw) {
          const data = JSON.parse(raw);
          const age = Date.now() - (data.ts ?? 0);
          if (age < 30_000) {
            if (data.type === 'OAUTH_TOKEN' && data.provider === 'onedrive') {
              try { localStorage.removeItem('blend:oauth_result'); } catch {}
              done(data.token as string); return;
            }
            if (data.type === 'OAUTH_ERROR' && data.provider === 'onedrive') {
              try { localStorage.removeItem('blend:oauth_result'); } catch {}
              fail(data.error); return;
            }
          } else {
            try { localStorage.removeItem('blend:oauth_result'); } catch {}
          }
        }
      } catch {}

      try {
        if (popup.closed && !settled) fail('OAuth popup was closed.');
      } catch {}
    }, 500);

    const cleanup = () => {
      window.removeEventListener('message', msgHandler);
      clearInterval(poll);
      try { bc?.close(); } catch {}
    };
  });
}

// ── Graph API calls ───────────────────────────────────────────────────────────

/** List children of a folder (or drive root). */
async function listChildren(
  token: string,
  itemId?: string
): Promise<OneDriveItem[]> {
  const url = itemId
    ? `${GRAPH_API}/me/drive/items/${itemId}/children`
    : `${GRAPH_API}/me/drive/root/children`;

  const all: OneDriveItem[] = [];
  let nextUrl: string | undefined = `${url}?$top=100&$select=id,name,size,lastModifiedDateTime,file,folder,@microsoft.graph.downloadUrl`;

  while (nextUrl) {
    const res: Response = await fetch(nextUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`OneDrive API ${res.status}: ${await res.text()}`);
    const data: { value: OneDriveItem[]; '@odata.nextLink'?: string } = await res.json();
    all.push(...data.value);
    nextUrl = data['@odata.nextLink'];
  }

  return all;
}

/** Recursively scan a OneDrive folder for supported files. */
export async function scanOneDriveFolder(
  token: string,
  folderId?: string
): Promise<OneDriveItem[]> {
  const items = await listChildren(token, folderId);
  const result: OneDriveItem[] = [];

  for (const item of items) {
    if (item.folder) {
      const sub = await scanOneDriveFolder(token, item.id);
      result.push(...sub);
    } else if (item.file) {
      const ext = item.name.split('.').pop()?.toLowerCase() ?? '';
      if (SUPPORTED_EXTS.has(ext)) result.push(item);
    }
  }

  return result;
}

/** Download a OneDrive file. Prefers the pre-signed download URL if available. */
export async function downloadOneDriveFile(
  token: string,
  item: OneDriveItem
): Promise<File> {
  const url =
    item['@microsoft.graph.downloadUrl'] ??
    `${GRAPH_API}/me/drive/items/${item.id}/content`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`File download failed: ${item.name}`);
  const blob = await res.blob();
  return new File([blob], item.name, { type: item.file?.mimeType ?? 'application/octet-stream' });
}

export function isTokenValid(tokenExpiry?: number): boolean {
  if (!tokenExpiry) return false;
  return Date.now() < tokenExpiry - 60_000;
}
