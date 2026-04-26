// Microsoft Graph subscriptions — Tori 명세 16384118 §3.7
// OneDrive Personal + Business 둘 다 지원 (Q4=네).

import { registerSubscriptionMeta } from './webhook-registry';

const SUBSCRIPTION_TTL_MS = 3 * 24 * 60 * 60 * 1000; // OneDrive: max 3일

export async function subscribeOneDriveChanges(
  datasourceId: string,
  accessToken: string,
): Promise<{ subscriptionId: string; expiresAt: number }> {
  if (!process.env.NEXT_PUBLIC_DS_WEBHOOK_URL) {
    throw new Error('Webhook worker URL not configured');
  }
  const expirationDateTime = new Date(Date.now() + SUBSCRIPTION_TTL_MS).toISOString();
  const notificationUrl = `${process.env.NEXT_PUBLIC_DS_WEBHOOK_URL}/webhook/onedrive`;

  const res = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      changeType: 'updated,deleted',
      notificationUrl,
      resource: '/me/drive/root',
      expirationDateTime,
      clientState: datasourceId, // Worker가 datasource 식별에 사용
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OneDrive subscribe failed: ${res.status} ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as { id: string; expirationDateTime: string };
  const expiresAt = Date.parse(data.expirationDateTime);

  await registerSubscriptionMeta({
    datasourceId,
    service: 'onedrive',
    subscriptionId: data.id,
    expiresAt,
    registeredAt: Date.now(),
  });

  return { subscriptionId: data.id, expiresAt };
}

// /me/drive/root/delta — Subscription notification만으로는 fileId가 보장되지 않으므로
// delta API로 변경분 조회. deltaLink는 datasource별 localStorage에 보존.
export async function fetchOneDriveDelta(opts: {
  accessToken: string;
  deltaLink?: string;
}): Promise<{ items: Array<{ id: string; name?: string; size?: number }>, newDeltaLink: string | undefined }> {
  const items: Array<{ id: string; name?: string; size?: number }> = [];
  let url = opts.deltaLink ?? 'https://graph.microsoft.com/v1.0/me/drive/root/delta';
  let newDeltaLink: string | undefined;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${opts.accessToken}` } });
    if (!res.ok) throw new Error(`delta failed: ${res.status}`);
    const data = (await res.json()) as {
      value?: Array<{ id: string; name?: string; size?: number; deleted?: unknown }>;
      '@odata.nextLink'?: string;
      '@odata.deltaLink'?: string;
    };
    for (const v of data.value ?? []) {
      if (!v.deleted) items.push({ id: v.id, name: v.name, size: v.size });
    }
    if (data['@odata.nextLink']) {
      url = data['@odata.nextLink'];
      continue;
    }
    if (data['@odata.deltaLink']) newDeltaLink = data['@odata.deltaLink'];
    break;
  }
  return { items, newDeltaLink };
}
