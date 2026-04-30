# 꼬미 질문 — DataSources Picker + Webhook (PR #3) architectural 이슈

**일자:** 2026-04-26
**관련 명세:** Komi_DataSources_Picker_AutoSync_Hotfix_2026-04-26.md (영역 3)
**PR #1, #2** — 머지 완료
**PR #3** — 아래 질문 답 받은 후 진행 권고

---

## 0. 한 줄 요약

명세 §3.7에서 webhook callback을 `src/app/api/webhooks/google-drive/route.ts` 등 Next.js API route로 가정하지만, 현재 Blend는 `next.config.ts`에 **`output: 'export'`** (정적 export) 모드라 **API routes가 빌드에 포함되지 않음**. webhook 수신을 어떻게 처리할지 확정 필요.

---

## 1. 현재 인프라 상태

```ts
// next.config.ts
const nextConfig: NextConfig = {
  output: 'export',          // ← 정적 export. API routes 미포함.
  images: { unoptimized: true },
};
```

**확인:** `npm run build` 결과 — `src/app/api/*` 디렉토리 안의 일부 route는 dev에서만 작동하거나 client-side 호출용 fetch proxy 형태. 외부 webhook callback (Google/Microsoft가 POST 보내는 endpoint)은 받을 수 없음.

이미 운영 중인 server-side endpoint:
- **blend-daily-report** Cloudflare Worker (`workers-daily-report/`) — 텔레그램 푸시. 우리가 만든 패턴.
- **blend-counter** Cloudflare Worker (`workers/`) — 익명 카운트.

---

## 2. 선택지 3개

### 옵션 A — Cloudflare Worker로 webhook 분리 (추천)

```
blend-datasource-webhook/  (신규 Worker)
├── src/index.ts          : POST /webhook/google-drive
│                          POST /webhook/onedrive
│                          GET  /subscriptions/renew  (cron 만료 갱신)
├── wrangler.toml         : cron triggers + KV bindings
└── README.md
```

- ✅ 기존 패턴(`blend-daily-report`)과 일관
- ✅ output: 'export' 변경 불필요 — 현재 클라이언트 인프라 그대로
- ✅ Webhook 갱신 cron 자체 처리 (Google 7일 / OneDrive 3일)
- ⚠️ 필요한 것:
  - Cloudflare 계정 + KV namespace + secrets
  - 각 변경 파일 다운로드를 client에 dispatch할 메커니즘 (KV에 적어두고 client 폴링 / 또는 Worker가 직접 임베딩? — 후자는 OpenAI 키 노출 위험)
  - 클라이언트 측 long-polling 또는 SSE — `blend-counter` 패턴 확장

### 옵션 B — Next.js를 hybrid 모드로 변경

```ts
// next.config.ts
// output: 'export' 제거
```

- ⚠️ 기존 정적 export의 장점 (Cloudflare Pages 호스팅 등) 상실 가능
- ⚠️ Vercel serverless functions로 webhook 받음 — 비용 발생
- ⚠️ "$0 서버 비용" 원칙(@2026-04-12 PROJECT_STATE) 위배
- ✅ 명세 §3.7 그대로 구현 가능

### 옵션 C — Webhook 없이 polling으로 우회

- 클라이언트 진입 시점마다 Google Drive Changes API를 폴링 (`startPageToken` 비교)
- ✅ 서버 인프라 0
- ❌ 사용자가 앱을 안 열면 동기화 안 됨 ("자동 동기화" 명세 위배)
- ❌ 명세 §3.7 (Webhook 자동 감지)와 정면 충돌

---

## 3. 추가 architectural 질문

### 3-1. 임베딩 비용 부담 주체

명세 §3.8 일일 한도 $2 / §3.9 $1 알림 — "사용자의 OpenAI/Google API 키로 직접 청구". 즉 client-side에서 임베딩 호출.

- Webhook이 새 파일 알림 → Cloudflare Worker가 KV에 "indexing pending" 적어둠 → 클라이언트가 다음 진입 시 KV 폴링 → 클라이언트에서 다운로드 + 임베딩 → IDB 저장.
- 이 경우 Webhook은 **알림만**, 실제 indexing은 client. "실시간 자동" 동기화는 약화. 사용자가 앱을 안 열면 큐에만 쌓임.

→ "자동 Webhook 동기화"의 의미가 바뀜. Roy 결정 필요:
  - (a) 받은 알림은 KV 큐에 적고 사용자 진입 시 동기화 (서버리스 + BYOK 유지)
  - (b) Worker가 사용자 키 관리해서 직접 임베딩 (서버 비용 발생 + 키 보안 검토 필요)

### 3-2. Webhook callback domain 등록

명세 §11에 "production만 등록. preview URL 자동 등록 별도". 운영 도메인은 `blend.ai4min.com`. Cloudflare Worker URL은 `https://blend-datasource-webhook.<account>.workers.dev`. 둘 중 어느 것을 Google Cloud Console / Azure Portal에 등록할지 — Worker가 더 적합 (HTTPS + 안정 URL).

### 3-3. OneDrive Personal vs Business

명세 §11에 미결 사항. Personal 계정도 Subscriptions API 지원하는지, scope `Files.Read.All`이 동일한지 확인 필요.

### 3-4. Google Picker API key

명세 §7에 `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY` 신규 ENV. 기존 OAuth client id와 별개 — Cloud Console에서 별도 생성 필요. Roy가 직접 발급.

### 3-5. OneDrive File Picker SDK v8

명세 §3.4에 SDK 사용. v8은 iframe 기반 + postMessage. 통합 자체는 가능하지만 SDK가 무거움 (~100KB). 또 Microsoft 인증 popup을 띄우는데 popup blocker / 모바일 호환 검증 필요.

---

## 4. 추천 진행안

### Phase 3a (즉시 가능 — server 무관 client 작업)

1. 데이터 모델: `Selection` 타입 + `DataSource.selections` 배열 (명세 §3.1)
2. 비용 추정 함수 (`estimate-embedding-cost.ts`, 명세 §3.6)
3. 비용 미리보기 모달 (`cost-preview-modal.tsx`, 명세 §3.5)
4. 비용 store + $1 알림 + 자정 리셋 (명세 §3.8 ~ §3.10)
5. 일일 한도 초과 시 자동 일시정지 로직

### Phase 3b (Roy 결정 후)

6. Picker UI (Google Drive + OneDrive) — Roy가 PICKER_API_KEY 발급 후
7. Webhook subscription 흐름:
   - 옵션 A 채택 시: `blend-datasource-webhook` Worker 신규
   - 옵션 B 채택 시: `next.config.ts` 변경 + API routes
   - 옵션 C 채택 시: 클라이언트 폴링만 (자동 동기화 명세 변경)
8. 클라이언트 측 큐 처리 (KV 폴링 또는 SSE)

---

## 5. 꼬미가 답 기다리는 것

| # | 결정 사항 | 옵션 |
|---|---|---|
| Q1 | Webhook 인프라 | A (Cloudflare Worker) / B (Vercel hybrid) / C (polling) |
| Q2 | 임베딩 호출 주체 | (a) 클라이언트 (BYOK 유지) / (b) Worker (서버 비용) |
| Q3 | Google Picker API key | Roy가 발급 후 ENV 등록 |
| Q4 | OneDrive Personal 지원 | 네 / 아니오 (Business만) |
| Q5 | Phase 3a (client-only) 만 우선 진행 OK? | 네 / 아니오 |

---

## 6. 진행 상태

- ✅ **PR #1** (영역 1: 칩 status dot) — 머지: https://github.com/toroymin-bot/blend/pull/43
- ✅ **PR #2** (영역 2: AI 답변 카피) — 머지: https://github.com/toroymin-bot/blend/pull/44
- ⏸️ **PR #3** (영역 3) — 위 Q1~Q5 답 받은 후 진행

---

*작성: 꼬미 (Komi, Claude Code)*
*전달: Roy*
*날짜: 2026-04-26*
