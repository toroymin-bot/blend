# blend-datasource-webhook

Google Drive / OneDrive **subscription 알림 수신** + **클라이언트 폴링 큐** 워커.
Tori 명세 [16384118](https://ai4min.atlassian.net/wiki/spaces/Blend/pages/16384118) §3.7.

## 데이터 흐름

```
[Picker]  사용자가 폴더/파일 선택
   ↓
[클라이언트]  자체 OAuth 토큰으로 Drive/OneDrive subscribe API 호출
   ↓        notificationUrl = https://blend-datasource-webhook.<acct>.workers.dev/webhook/...
   ↓        clientState = datasourceId (OneDrive)
   ↓        channelId = blend-{datasourceId}-{ts}-{rand} (Google)
   ↓
[Worker]  POST /subscription/register   (Bearer 인증)
   ↓        메타만 KV에 저장 (subscriptionId, expiresAt) — OAuth 토큰은 보관 X
   ↓
... (시간 경과, 새 파일/변경 발생) ...
   ↓
Google → POST /webhook/google-drive   (헤더 기반, 토큰 X)
OneDrive → POST /webhook/onedrive    (validationToken handshake 포함)
   ↓
[Worker]  KV 큐에 변경 이벤트 적음
   ↓
... (사용자가 앱 진입) ...
   ↓
[클라이언트]  GET /queue/:datasourceId   (Bearer 인증)
   ↓        wildcard fileId='*' 응답 받으면 → 자체 OAuth로 changes/delta API 호출
   ↓                                          → 실제 fileId 받아 다운로드 + 임베딩
   ↓        실제 fileId 응답 받으면 직접 다운로드
   ↓
[클라이언트]  POST /queue/:datasourceId/ack { fileIds }   처리 완료된 fileIds ack
   ↓
[Worker]  큐에서 해당 항목 제거
```

**BYOK 유지**: Worker는 사용자 OpenAI/Google 키 또는 OAuth 토큰을 절대 보관하지 않음. 알림 메타 + 큐 마커만 KV에 저장.

## 라우트

| Method | Path | 인증 | 용도 |
|--------|------|------|------|
| POST | `/webhook/google-drive` | (Google channel id) | Drive Watch 알림 수신 |
| POST | `/webhook/onedrive` | (validationToken 또는 clientState) | Graph subscription 알림 수신 |
| POST | `/subscription/register` | Bearer `SHARED_CLIENT_TOKEN` | subscription 메타 등록 |
| GET | `/subscription/expiring` | Bearer | 만료 임박 목록 (디버깅) |
| GET | `/queue/:datasourceId` | Bearer | 큐 상태 폴링 |
| POST | `/queue/:datasourceId/ack` | Bearer | 처리 완료 ack |
| GET | `/health` | — | `ok` |

## Cron

`17 */12 * * *` — 12시간마다 만료 24시간 이내인 subscription을 식별해 그 datasource 큐에 `__renew__` 항목을 추가. 클라이언트가 다음 폴링 시 그 항목을 보면 자체 OAuth로 갱신 + `/subscription/register` 재호출.

## KV schema

| Key | Value |
|-----|-------|
| `queue:{datasourceId}` | `{ items: QueueItem[], lastUpdated }` (60일 TTL, max 500) |
| `sub:{datasourceId}` | `{ subscriptionId, service, expiresAt, registeredAt }` (만료+24h TTL) |

## 배포

```bash
cd workers-datasource-webhook
npm install

# 1. Cloudflare 인증 (한 번)
npx wrangler login

# 2. KV namespace
npx wrangler kv namespace create DS_QUEUE
npx wrangler kv namespace create DS_QUEUE --preview
# → 출력의 id / preview_id를 wrangler.toml의 PLACEHOLDER_KV_ID에 치환

# 3. Secrets
openssl rand -hex 32                   # → 출력 복사
npx wrangler secret put SHARED_CLIENT_TOKEN   # 위 hex 붙여넣기
# 같은 값을 Blend 클라이언트 ENV NEXT_PUBLIC_DS_WEBHOOK_TOKEN 에도 등록

# 4. 배포
npx wrangler deploy
```

배포 URL 예: `https://blend-datasource-webhook.<account>.workers.dev`

## 클라이언트 ENV (Vercel)

```
NEXT_PUBLIC_DS_WEBHOOK_URL=https://blend-datasource-webhook.<account>.workers.dev
NEXT_PUBLIC_DS_WEBHOOK_TOKEN=<위 SHARED_CLIENT_TOKEN과 동일>
```

## 검증

```bash
# 헬스
curl https://<worker-url>/health
# → ok

# 인증 실패
curl https://<worker-url>/queue/test
# → 401 Unauthorized

# 인증 성공 — 빈 큐
curl -H "Authorization: Bearer $TOKEN" https://<worker-url>/queue/test
# → {"items":[],"lastUpdated":0}

# subscription 등록
curl -X POST https://<worker-url>/subscription/register \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"datasourceId":"test","service":"google_drive","subscriptionId":"sub-x","expiresAt":1800000000000,"registeredAt":0}'
# → {"ok":true}

# 만료 임박 (24h 이내)
curl -H "Authorization: Bearer $TOKEN" https://<worker-url>/subscription/expiring
# → {"expiring":[]}
```

## BYOK 보안 모델 — 명시

- ✅ Worker는 사용자 OAuth 토큰 보관 X
- ✅ Worker는 OpenAI/Google 임베딩 키 보관 X
- ✅ Worker는 파일 내용 보관 X
- ✅ Worker는 알림 메타(subscriptionId, expiresAt) + 큐 마커만 보관
- ⚠️ Worker가 털려도 영향: 사용자가 어느 datasource를 등록했는지 + 변경이 있었는지만 노출. 실제 파일/키는 안전.

## 관련

- 클라이언트 측: `src/modules/datasources/*` (Phase 3c, 3d)
- Phase 3a: `src/lib/cost/*`, `src/stores/d1-cost-store.ts`, `src/types/index.ts` (DataSource.selections)
