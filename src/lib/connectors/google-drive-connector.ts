// Blend - Google Drive Connector
// Uses Google Drive REST API v3 with OAuth 2.0 implicit flow (BYOK client_id).
// Scope: drive.readonly — read-only access to files the user owns or has access to.

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const SUPPORTED_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.ms-excel',                                          // xls
  'text/csv',
  'text/plain',
  'text/markdown',
  'application/pdf',
  // Google Docs → export as txt
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
]);

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  modifiedTime: string;
  parents?: string[];
}

// ── OAuth helpers ─────────────────────────────────────────────────────────────

/**
 * Open a popup window for Google OAuth 2.0 implicit flow.
 * Resolves with the access token once the callback page posts it back.
 */
export function requestGoogleAccessToken(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const redirectUri = `${window.location.origin}/oauth-callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'token',
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      include_granted_scopes: 'true',
      state: 'google',
    });

    // Clear stale result before opening popup
    try { localStorage.removeItem('blend:oauth_result'); } catch {}

    const popup = window.open(
      `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      'google-oauth',
      'width=520,height=620,left=200,top=100'
    );

    if (!popup) { reject(new Error('Popup was blocked. Please allow popups and try again.')); return; }

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
      if (e.data?.type === 'OAUTH_TOKEN' && e.data?.provider === 'google') done(e.data.token as string);
      if (e.data?.type === 'OAUTH_ERROR' && e.data?.provider === 'google') fail(e.data.error);
    };
    window.addEventListener('message', msgHandler);

    // 2. BroadcastChannel (iOS Safari / Firefox — opener is null when tab opens)
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('oauth_callback');
      bc.onmessage = (e) => {
        if (e.data?.type === 'OAUTH_TOKEN' && e.data?.provider === 'google') done(e.data.token as string);
        if (e.data?.type === 'OAUTH_ERROR' && e.data?.provider === 'google') fail(e.data.error);
      };
    } catch {}

    // 3. localStorage polling fallback (BroadcastChannel may also not work in some cases)
    const poll = setInterval(() => {
      try {
        const raw = localStorage.getItem('blend:oauth_result');
        if (raw) {
          const data = JSON.parse(raw);
          const age = Date.now() - (data.ts ?? 0);
          if (age < 30_000) { // fresh (< 30s)
            if (data.type === 'OAUTH_TOKEN' && data.provider === 'google') {
              try { localStorage.removeItem('blend:oauth_result'); } catch {}
              done(data.token as string); return;
            }
            if (data.type === 'OAUTH_ERROR' && data.provider === 'google') {
              try { localStorage.removeItem('blend:oauth_result'); } catch {}
              fail(data.error); return;
            }
          } else {
            try { localStorage.removeItem('blend:oauth_result'); } catch {}
          }
        }
      } catch {}

      // Detect popup/tab closed by user
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

// ── Drive API calls ───────────────────────────────────────────────────────────

/** List files in a folder (or root if folderId omitted). */
export async function listDriveFiles(
  token: string,
  folderId?: string,
  pageToken?: string
): Promise<{ files: DriveFile[]; nextPageToken?: string }> {
  const q = folderId
    ? `'${folderId}' in parents and trashed = false`
    : "trashed = false and 'me' in owners";

  const params = new URLSearchParams({
    q,
    fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,parents)',
    pageSize: '100',
    ...(pageToken ? { pageToken } : {}),
  });

  const res = await fetch(`${DRIVE_API}/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Google Drive API ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Collect ALL supported files recursively under a folder. */
export async function scanDriveFolder(
  token: string,
  folderId?: string
): Promise<DriveFile[]> {
  const result: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const page = await listDriveFiles(token, folderId, pageToken);
    pageToken = page.nextPageToken;

    for (const f of page.files) {
      if (f.mimeType === 'application/vnd.google-apps.folder') {
        // Recurse into sub-folders
        const sub = await scanDriveFolder(token, f.id);
        result.push(...sub);
      } else if (SUPPORTED_MIME.has(f.mimeType)) {
        result.push(f);
      }
    }
  } while (pageToken);

  return result;
}

/** Download a Drive file as a File object. Google Docs are exported as plain text. */
export async function downloadDriveFile(
  token: string,
  file: DriveFile
): Promise<File> {
  let url: string;
  let filename = file.name;

  if (file.mimeType === 'application/vnd.google-apps.document') {
    url = `${DRIVE_API}/files/${file.id}/export?mimeType=text/plain`;
    if (!filename.endsWith('.txt')) filename += '.txt';
  } else if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
    url = `${DRIVE_API}/files/${file.id}/export?mimeType=text/csv`;
    if (!filename.endsWith('.csv')) filename += '.csv';
  } else {
    url = `${DRIVE_API}/files/${file.id}?alt=media`;
  }

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`File download failed: ${file.name}`);
  const blob = await res.blob();
  return new File([blob], filename, { type: res.headers.get('content-type') || 'application/octet-stream' });
}

/** Check if an access token is still valid (with 60s buffer). */
export function isTokenValid(tokenExpiry?: number): boolean {
  if (!tokenExpiry) return false;
  return Date.now() < tokenExpiry - 60_000;
}
