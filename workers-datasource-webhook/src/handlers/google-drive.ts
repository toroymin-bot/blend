// POST /webhook/google-drive
//
// Google Drive Watch 채널이 변경 발생 시 호출. 헤더 X-Goog-Channel-ID + X-Goog-Resource-State 활용.
// channelId 형식: blend-{datasourceId}-{ts}-{rand}.
//
// Worker는 fileId를 알기 위해 changes API 호출이 필요한데, 이를 위해선 OAuth 토큰이
// 필요. 우리는 BYOK 유지 정책이라 Worker가 OAuth 토큰을 보관하지 않음. 따라서
// 알림 이벤트 자체만 큐에 적고, 클라이언트가 폴링 시 자체 OAuth 토큰으로 changes API
// 호출하여 실제 변경 fileId를 받아오는 구조.
//
// 이를 위해 큐 항목은 { service: 'google_drive', changeType: 'updated', fileId: '*' }
// 처럼 wildcard로 표시. 클라이언트는 wildcard를 보면 changes API 폴링.

import type { Env, QueueItem } from '../types';
import { enqueue } from '../lib/queue';

export async function handleGoogleDriveWebhook(req: Request, env: Env): Promise<Response> {
  const channelId = req.headers.get('X-Goog-Channel-ID') ?? '';
  const resourceState = req.headers.get('X-Goog-Resource-State') ?? '';
  // channelId 형식 검증
  const m = channelId.match(/^blend-([^-]+)-/);
  if (!m) {
    return new Response('invalid channel', { status: 400 });
  }
  const datasourceId = m[1];

  // resourceState: 'sync' (초기 등록 ack) / 'change' / 'remove'
  if (resourceState === 'sync') {
    return new Response('ok', { status: 200 });
  }

  const item: QueueItem = {
    service: 'google_drive',
    fileId: '*',
    changeType: resourceState === 'remove' ? 'deleted' : 'updated',
    observedAt: Date.now(),
  };
  await enqueue(env, datasourceId, item);
  return new Response('ok', { status: 200 });
}
