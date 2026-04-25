# Blend Counter Worker (Cloudflare)

익명 이벤트/방문 카운터 — 텔레그램 일일 리포트의 데이터 소스.

## 엔드포인트

- `POST /track-visit` — `{userId}` (UUID v4) 익명 방문 추적. 신규/재방문 구분 + 코호트.
- `POST /track` — `{event, props}` 8 events 카운트.
- `OPTIONS /*` — CORS preflight.

모든 KV 키 90일 TTL.

## KV 키 구조

```
users:{userId}                    → { firstVisit, lastVisit }
daily:{YYYY-MM-DD}:visit:new      → 정수 (신규 방문자)
daily:{YYYY-MM-DD}:visit:return   → 정수 (재방문자)
daily:{YYYY-MM-DD}:menu_click:{menu}     → 정수
daily:{YYYY-MM-DD}:model_select:{model}  → 정수
daily:{YYYY-MM-DD}:key_registered:{provider} → 정수
daily:{YYYY-MM-DD}:chat_exported:{format}    → 정수
daily:{YYYY-MM-DD}:trial_used                → 정수
daily:{YYYY-MM-DD}:first_message_sent        → 정수
daily:{YYYY-MM-DD}:suggestion_clicked        → 정수
daily:{YYYY-MM-DD}:compare_used              → 정수
cohort:{YYYY-MM-DD}:users         → string[] (코호트 첫 방문자 UUID 목록)
active:{cohortDate}:{day}:[users] → string[] (코호트 사용자가 day에 활동했는지)
```

## 배포

### 옵션 A — 로컬 (Roy)

```bash
cd workers
npm install -g wrangler
wrangler login
# wrangler.toml의 PLACEHOLDER_KV_ID를 실제 KV namespace id로 치환
sed -i '' "s/PLACEHOLDER_KV_ID/$CF_KV_NAMESPACE_ID/" wrangler.toml
wrangler deploy
```

배포 후 표시되는 Worker URL을 Vercel `NEXT_PUBLIC_BLEND_COUNTER_URL` 환경변수에 등록.

### 옵션 B — GitHub Actions (자동)

`.github/workflows/deploy-worker.yml`이 push 시 자동 배포. Secrets:
- `CF_API_TOKEN`
- `CF_ACCOUNT_ID`
- `CF_KV_NAMESPACE_ID`

## 비용

Cloudflare Workers 무료: 일 100K 요청 / KV 일 100K writes. 블렌드 예상 1K~10K로 충분.

## 변경 이력

- 2026-04-25: 초기 v2 (Tori 명세)
