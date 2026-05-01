// Blend - OneDrive Connector (Microsoft Graph API)
// OAuth 2.0 PKCE flow (public client, no client secret needed)
// Replaces deprecated implicit flow that caused unsupported_response_type error.
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

// ── PKCE helpers ──────────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  return base64urlEncode(array);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64urlEncode(new Uint8Array(digest));
}

function base64urlEncode(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// ── OAuth PKCE helpers ────────────────────────────────────────────────────────

export function requestOneDriveAccessToken(
  clientId: string,
  tenantId = 'common'
): Promise<string> {
  return new Promise(async (resolve, reject) => {
    const redirectUri = `${window.location.origin}/oauth-callback`;

    // Generate PKCE pair
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = `onedrive_${Date.now()}`;

    // Store verifier + state for callback to retrieve
    try {
      localStorage.setItem('blend:onedrive_pkce', JSON.stringify({ codeVerifier, state, clientId, tenantId }));
    } catch {}

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: 'Files.Read offline_access',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      response_mode: 'query',
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

// ── Token exchange (called from oauth-callback page) ─────────────────────────

/** Exchange authorization code for access token using PKCE code_verifier. */
export async function exchangeOneDriveCode(code: string): Promise<{ token: string; expiry: number }> {
  const raw = localStorage.getItem('blend:onedrive_pkce');
  if (!raw) throw new Error('PKCE state missing — please try again.');
  const { codeVerifier, clientId, tenantId } = JSON.parse(raw) as {
    codeVerifier: string; clientId: string; tenantId: string;
  };
  localStorage.removeItem('blend:onedrive_pkce');

  const redirectUri = `${window.location.origin}/oauth-callback`;
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error_description?: string })?.error_description ?? `Token exchange failed: ${res.status}`);
  }
  const data = await res.json();
  return {
    token: data.access_token as string,
    expiry: Date.now() + (parseInt(data.expires_in ?? '3600', 10) * 1000),
  };
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

/**
 * Scan a OneDrive folder for supported files.
 * [2026-05-01] recursive 옵션 추가 — 기본 false. 재귀는 사용자가 명시적으로
 * includeSubfolders=true 선택했을 때만. 이전엔 무조건 재귀라 폴더 안 폴더까지
 * 다 따라 들어가서 Microsoft Graph rate limit 침범 → 429.
 */
export async function scanOneDriveFolder(
  token: string,
  folderId?: string,
  opts?: { recursive?: boolean }
): Promise<OneDriveItem[]> {
  const recursive = opts?.recursive === true;
  const items = await listChildren(token, folderId);
  const result: OneDriveItem[] = [];

  for (const item of items) {
    if (item.folder) {
      if (recursive) {
        const sub = await scanOneDriveFolder(token, item.id, opts);
        result.push(...sub);
      }
      // recursive=false면 하위 폴더 무시
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
