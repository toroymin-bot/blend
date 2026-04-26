// POST /webhook/onedrive
//
// Microsoft Graph subscription notification.
// Validation 요청: query string ?validationToken=... 면 그 토큰을 plain text로 반환.
// 정상 알림: body에 { value: [{ subscriptionId, resource, changeType, clientState, ... }] }

import type { Env, QueueItem } from '../types';
import { enqueue } from '../lib/queue';

interface OneDriveNotification {
  subscriptionId: string;
  resource: string;
  changeType?: 'created' | 'updated' | 'deleted';
  clientState?: string;
  resourceData?: { id?: string };
}

export async function handleOneDriveWebhook(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const validationToken = url.searchParams.get('validationToken');
  if (validationToken) {
    return new Response(validationToken, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  let payload: { value?: OneDriveNotification[] };
  try {
    payload = await req.json();
  } catch {
    return new Response('invalid', { status: 400 });
  }
  const notifications = payload.value ?? [];
  for (const n of notifications) {
    // clientState = datasourceId (subscription 등록 시 클라이언트가 채워서 보냄)
    const datasourceId = n.clientState;
    if (!datasourceId) continue;
    const item: QueueItem = {
      service: 'onedrive',
      fileId: n.resourceData?.id ?? '*',
      changeType: (n.changeType ?? 'updated') as QueueItem['changeType'],
      observedAt: Date.now(),
    };
    await enqueue(env, datasourceId, item);
  }
  return new Response('ok', { status: 200 });
}
