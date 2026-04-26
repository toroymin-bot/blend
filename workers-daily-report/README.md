# blend-daily-report

KOMI nighttask가 빌드한 일일 개발 일지 요약을 KV에 저장하고,
**KST 08:35**에 텔레그램으로 자동 전송하는 Cloudflare Worker.

> **Tori 명세 v3** — 2026-04-26 (Confluence page 16416965)

---

## 데이터 흐름

```
KOMI nighttask (1AM KST)         Cloudflare Worker            Telegram
─────────────────────             ──────────────────            ──────────
build summary.json     ─POST─▶   /push-summary          
                                 ↓ KV.put('summary:YYYY-MM-DD')
                                 KV (BLEND_STATS)
                                 ↑ KV.get
KST 08:35 cron     ─────────▶    handleDevLogSummary    ────▶  sendMessage
```

---

## 엔드포인트

| Method | Path             | 인증            | 설명                                                     |
|--------|------------------|-----------------|----------------------------------------------------------|
| POST   | `/push-summary`  | Bearer 토큰     | KOMI nighttask가 일일 요약을 KV에 push                   |
| GET    | `/preview`       | 없음            | 미리보기 plaintext (`?date=YYYY-MM-DD` 옵션)             |
| GET    | `/health`        | 없음            | `ok`                                                     |

### POST /push-summary 페이로드 예시

```json
{
  "date": "2026-04-25",
  "tasks": [
    { "title": "회의 PDF/Word 빈 파일 수정", "status": "success", "commitShas": ["a1b2c3d"] },
    { "title": "원본 transcript 표시",      "status": "in_progress", "commitShas": ["e5f6g7h"] }
  ],
  "bugs": [
    { "id": "BUG-003", "title": "hydration error", "status": "resolved", "commitShas": ["k2l3m4n"] }
  ],
  "improvements": [
    { "id": "IMP-007", "title": "사이드바 Data Sources 승격", "status": "applied", "commitShas": ["s8t9u0v"] }
  ],
  "stats":  { "filesChanged": 12, "additions": 890, "deletions": 340, "commitCount": 5 },
  "links":  {
    "qaTask":     "https://1drv.ms/x/...",
    "devLogPage": "https://ai4min.atlassian.net/wiki/...",
    "repo":       "https://github.com/toroymin-bot/blend"
  }
}
```

---

## 배포 (Roy / 첫 배포 시 1회)

### 1. Cloudflare 인증

```bash
cd workers-daily-report
npx wrangler login
```

### 2. KV namespace 생성 + wrangler.toml 갱신

```bash
npx wrangler kv namespace create BLEND_STATS
npx wrangler kv namespace create BLEND_STATS --preview
```

출력에서 `id`/`preview_id`를 받아 `wrangler.toml`의 `PLACEHOLDER_KV_ID` /
`PLACEHOLDER_PREVIEW_KV_ID` 부분을 실제 값으로 치환.

### 3. Secrets 등록

```bash
# (a) KOMI push 인증 토큰 — 강력한 랜덤
openssl rand -hex 32                       # → 출력 복사
npx wrangler secret put KOMI_PUSH_TOKEN    # → 위에서 복사한 값 붙여넣기

# (b) Telegram 봇 토큰 (Roy가 회전한 새 값)
npx wrangler secret put TELEGRAM_BOT_TOKEN

# (c) 개인 chat_id — Roy 본인 chat_id (BotFather 또는 @userinfobot으로 확인)
npx wrangler secret put TELEGRAM_CHAT_ID
```

> `KOMI_PUSH_TOKEN`은 같은 값을 **꼬미 nighttask 환경 변수**에도 넣어야 함.

### 4. 배포

```bash
npx wrangler deploy
```

---

## 검증

```bash
# 활동 없는 날 메시지 미리보기
curl -s 'https://blend-daily-report.<account>.workers.dev/preview'

# 더미 페이로드 push (auth 필요)
curl -X POST 'https://blend-daily-report.<account>.workers.dev/push-summary' \
  -H "Authorization: Bearer $KOMI_PUSH_TOKEN" \
  -H 'Content-Type: application/json' \
  -d @sample-summary.json

# push된 데이터 미리보기
curl -s 'https://blend-daily-report.<account>.workers.dev/preview?date=2026-04-25'
```

---

## KOMI nighttask 통합 (SKILL.md STEP 11)

nighttask 마지막 단계에 추가:

```bash
# 1. 어제 작업 결과로 summary.json 빌드 (tasks/bugs/improvements/stats/links)
# 2. POST /push-summary
curl -X POST 'https://blend-daily-report.<account>.workers.dev/push-summary' \
  -H "Authorization: Bearer $KOMI_PUSH_TOKEN" \
  -H 'Content-Type: application/json' \
  -d @summary.json

# 3. 응답 확인
#   200 OK  → 성공
#   401     → 토큰 확인
#   400     → 페이로드 검증 실패 (date 형식 / 배열 타입)
```

8:35에 KV에서 자동으로 읽어 텔레그램 발송됨.

---

## 상태 → 이모지 매핑

### Tasks
| status        | 이모지 | 표시      |
|---------------|--------|-----------|
| success       | ✅     | 성공      |
| failed        | ❌     | 실패      |
| in_progress   | ⏳     | 진행 중   |
| skipped       | ⏭     | 건너뜀    |

### Bugs
| status            | 이모지 | 표시         |
|-------------------|--------|--------------|
| resolved          | ✅     | 수정 완료    |
| found             | 🔴     | 신규 발견    |
| fix_requested     | 🛠     | 수정 요청    |
| re_test_pending   | 🔄     | 재테스트 대기|

### Improvements
| status              | 이모지 | 표시         |
|---------------------|--------|--------------|
| applied             | ✅     | 적용         |
| pending_approval    | 🔵     | 승인 대기    |
| approved            | 👍     | 승인됨       |
| declined            | 🚫     | 거절         |
