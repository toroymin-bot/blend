// Google Drive Changes API watch — Tori 명세 16384118 §3.7
// 클라이언트가 자체 OAuth 토큰으로 Google Drive subscribe 호출 후
// Worker에 메타 등록. Worker는 OAuth 토큰을 보관 X.

import { registerSubscriptionMeta } from './webhook-registry';

interface SubscribeResult {
  channelId: string;
  expiresAt: number;
  startPageToken: string;
}

const WATCH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // Google: max 7일

export async function subscribeGoogleDriveChanges(
  datasourceId: string,
  accessToken: string,
): Promise<SubscribeResult> {
  if (!process.env.NEXT_PUBLIC_DS_WEBHOOK_URL || !process.env.NEXT_PUBLIC_DS_WEBHOOK_TOKEN) {
    throw new Error('Webhook worker URL/token not configured');
  }
  // 1) startPageToken
  const stRes = await fetch('https://www.googleapis.com/drive/v3/changes/startPageToken', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!stRes.ok) throw new Error(`Drive startPageToken failed: ${stRes.status}`);
  const { startPageToken } = (await stRes.json()) as { startPageToken: string };

  // 2) Watch 채널 등록
  const channelId = `blend-${datasourceId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const expiration = Date.now() + WATCH_TTL_MS;
  const watchUrl = `${process.env.NEXT_PUBLIC_DS_WEBHOOK_URL}/webhook/google-drive`;
  const res = await fetch(`https://www.googleapis.com/drive/v3/changes/watch?pageToken=${encodeURIComponent(startPageToken)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: channelId,
      type: 'web_hook',
      address: watchUrl,
      expiration,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Drive watch failed: ${res.status} ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as { id: string; expiration?: string };
  const expiresAt = data.expiration ? Number(data.expiration) : expiration;

  // 3) Worker에 메타 등록
  await registerSubscriptionMeta({
    datasourceId,
    service: 'google_drive',
    subscriptionId: channelId,
    expiresAt,
    registeredAt: Date.now(),
  });

  return { channelId, expiresAt, startPageToken };
}

// fileId='*' 또는 '__renew__' 큐 항목을 만나면 클라이언트가 호출하는 changes API.
// startPageToken은 IndexedDB 또는 localStorage에 datasource별로 저장 (이번 PR에서는 localStorage).
export async function fetchGoogleDriveChanges(opts: {
  accessToken: string;
  pageToken: string;
}): Promise<{ files: Array<{ id: string; name?: string; modifiedTime?: string; mimeType?: string }>, newStartPageToken: string }> {
  const allFiles: Array<{ id: string; name?: string; modifiedTime?: string; mimeType?: string }> = [];
  let pageToken: string | undefined = opts.pageToken;
  let newStartPageToken = opts.pageToken;
  do {
    const url = new URL('https://www.googleapis.com/drive/v3/changes');
    url.searchParams.set('pageToken', pageToken);
    url.searchParams.set('fields', 'newStartPageToken,nextPageToken,changes(file(id,name,mimeType,modifiedTime))');
    url.searchParams.set('includeRemoved', 'false');
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${opts.accessToken}` } });
    if (!res.ok) throw new Error(`changes failed: ${res.status}`);
    const data = (await res.json()) as {
      changes?: Array<{ file?: { id: string; name?: string; modifiedTime?: string; mimeType?: string } }>;
      nextPageToken?: string;
      newStartPageToken?: string;
    };
    for (const c of data.changes ?? []) {
      if (c.file?.id) allFiles.push(c.file);
    }
    pageToken = data.nextPageToken;
    if (data.newStartPageToken) newStartPageToken = data.newStartPageToken;
  } while (pageToken);
  return { files: allFiles, newStartPageToken };
}
