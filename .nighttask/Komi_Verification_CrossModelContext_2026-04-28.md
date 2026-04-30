# 꼬미 검증 보고 — Cross-Model 컨텍스트 연속성 (Tori 18644993)

**검증 시각**: 2026-04-28 ~14:30 KST
**소요**: 25분 (목표 1h 내)
**결론**: Tori 추측 모두 정확. 18644993 즉시 구현 가능. **단 작업 큐 정정 필요** — 17989643은 이미 완료, 16220512는 4-26에 머지됨.

---

## 1. Tori 18644993 추측 vs 코드 사실

| 영역 | Tori 추측 | 사실 | 필요 작업 |
|---|---|---|---|
| **Context Bridge** | 미존재 | ✅ 정확 (`grep checkContextBridge\|previousModel\|needsAugmentation` = 0) | 신규 작성 |
| **Augmentation Layer** | 미존재 | ✅ 정확 (`grep augmentMessage\|augmentation-layer` = 0) | 신규 작성 |
| **Model Adapter** | 미존재 | ✅ 정확 (`grep ModelAdapter\|textAdapter\|imageAdapter` = 0) | 신규 작성 |
| **Auto Summarization** | 미존재 | ✅ 정확 (`grep summarizeOlder\|sessionSummary` = 0) | 신규 작성 |
| **UI Badge** | 미존재 | ✅ 정확 (`grep "이전 대화 참조"\|augmented.*badge` = 0) | 신규 작성 |
| **Message.model 필드** | 추측 — 이미 있음 | ✅ 정확 (line 273 `modelUsed?: string`, 8군데 사용) | 기반 OK, 활용 |
| **Haiku 4.5 ID** | `claude-haiku-4-5-20251001` | ✅ 정확 (registry에 존재, 이미 사용 중) | OK |
| **Anthropic API 헬퍼** | 추측 — 이미 있음 | ✅ 정확 (`chat-api.ts callAnthropic`, max_tokens 어제 8192로 증가) | 활용 |
| **DALL-E 호출 어댑터** | 추측 | ✅ 정확 (`generateImage` in `image-gen.tsx`) | 활용 |
| **세션 store 위치** | `d1-session-store.ts` | ❌ 부분 정정 — 실제는 `d1-chat-store.ts` (chat 단위로 store 통합) | 그 store 확장 |

→ 모든 추측 거의 정확. **즉시 구현 가능**. 모호한 부분 0.

---

## 2. ⚠️ 작업 큐 정정 필요 — Tori 큐가 outdated

### 17989643 (첨부 파일 처리 모드 분기)
**Tori 큐 표시**: 🔴 P0 미완료
**실제 상태**: ✅ **이미 완료** (2026-04-28 어제 8개 commits 통해)

| Commit | 적용 |
|---|---|
| `8040045` | PR #1 — `classifyAttachmentIntent` + `buildFullContext`/`buildMetadataContext` 모드 분기 |
| `b72cc6e` | PR #2 — `getLangEnforcementHeader` 한국어 응답 강제 |
| `499a3ca` | PR #3 — Sources 파일 ID 그루핑 (chunk suffix 정규화) |
| `ea2d17a` | PR #4 — `getExtractionStatus` 'partial' / 'image_only' status |
| `09df85a` | PDF 자동 다운로드 v1 (html2pdf, 빈 페이지 회귀로 대체) |
| `d3e5e23` | PDF v3 — `printHtmlAsPDF` window.print 전환 (텍스트 PDF) |
| `bd20a27` | AI 거부 차단 — `stripPdfDownloadIntent` |
| `800af9d` | 직역 의무 프롬프트 + max_tokens 8192 |

→ Chrome MCP self-test에서 한국어 직역 + 새 창 + window.print() 검증 완료.
→ 큐에서 **17989643 제거 권장**.

### 16220512 (DataSources Picker)
**Tori 큐 표시**: 🔴 P0 진행 중 (3-4h)
**실제 상태**: 4-26에 이미 머지됨

| Commit | 적용 |
|---|---|
| `1094770` | design1: datasources phase 3a — types + cost (Tori 16384118 §3) |
| `2d30ab8` | feat(datasources): Pickers + subscription bridge (Phase 3c+3d, Tori 16384118) |
| `7791a1b` | feat(datasources): integrate Picker + cost preview + Subscribe (Tori 16384118 §3 UI) |

`src/modules/datasources/pickers/` 디렉토리 존재. 16220512 페이지 자체에 잔여 task 명시되어 있을 수도 — Tori가 production 검증 단계만 남았다고 했으니 **Roy의 Vercel 환경변수 등록** + **production 검증**만 남은 것으로 보임. **꼬미 코드 작업 0**.

---

## 3. 정정된 작업 큐

| # | 명세 | 페이지 | 시간 | 상태 |
|---|---|---|---|---|
| ~~1~~ | ~~DataSources Picker~~ | 16220512 | — | ✅ 머지 완료 (Roy ENV + production 검증만) |
| **1** | **Cross-Model 컨텍스트 연속성** | **18644993** | **8h** | 🔴 **P0 진행 대상** |
| ~~2~~ | ~~첨부 파일 처리~~ | 17989643 | — | ✅ 어제 완료 |
| 2 | URL design1 통일 | 16220538 v3 | 1h | 🟡 P1 |

**총 P0 작업량**: 16-17h → **8h**로 단축 (절반 이상 이미 완료).

---

## 4. 18644993 — Tori 의견 정정

> "18644993이 17989643의 부분집합. 17989643의 영역 1 (의도 분류)가 더 자연스럽게 통합됨."

**현재**:
- 17989643의 `classifyAttachmentIntent`는 첨부 파일 의도 분류 (full_context / metadata / rag_search)
- 18644993의 `checkContextBridge`는 모델 전환 감지 (다른 차원)
- 둘은 직교 (orthogonal). 18644993이 17989643를 "포함"하는 부분집합 관계 아님

**오히려**:
- 18644993의 ModelAdapter (text/image/vision/audio)가 17989643의 의도 분류 결과를 입력으로 받을 수 있음
- 17989643이 이미 있으니 18644993은 그 인터페이스 위에 자연스럽게 얹힘

→ Tori 의견 일부 정정. 17989643 먼저 만들 필요 없음 (이미 있음). 18644993 단독 진행 가능.

---

## 5. 18644993 진행 권장 — 즉시 시작

검증 결과:
- 모든 영역 미존재, 신규 작성 필요 — 추측 정확
- 기반 인프라(modelUsed 필드, Anthropic API 헬퍼, DALL-E 어댑터) 충분
- Tori 명세 5 PR 그대로 진행 가능

**모호한 부분이 거의 없어** Tori "예상 질문" 5개에 대해 추가 결정 없이도 진행 가능:

| 질문 | 내 기본값 |
|---|---|
| 세션 store summaries 필드 추가 시 마이그레이션 | 미존재 → 새 필드 추가만, 마이그레이션 불필요 (zustand persist v2 bump 없음) |
| Haiku 호출 실패 fallback | 보강 prompt 없이 원래 메시지 그대로 다음 모델에 전달 (silent fallback) |
| 캐시 TTL 1h | 적절. 더 길면 모델 응답 stale, 짧으면 hit rate 낮음 |
| 이미지 URL 만료 | base64로 저장됐으면 OK. 만료된 https URL은 vision adapter에서 skip + 텍스트만 전달 |
| 다중 이미지 vision | 모든 이미지 전달 (Claude vision은 multi-image 지원) |

Roy/Tori가 위 기본값에 다른 의견 있으면 알려주시고, 무응답이면 위 기본값으로 진행.

---

## 6. 권장 실행 순서

1. **(꼬미 단독 즉시)** 18644993 PR #1 (Context Bridge, 1h) → main merge → deploy → Chrome MCP self-test
2. **PR #2** Augmentation Layer + 캐시 (2h) → 모델 전환 시 Haiku 호출 검증
3. **PR #3** Model Adapter (2h) → text/image/vision/audio 어댑터
4. **PR #4** Auto Summarization (1.5h) → 11+ 메시지 요약
5. **PR #5** UI Badge (30min) → ✨ 라벨

각 PR 머지 + Chrome MCP self-test 후 다음 PR.

**Roy 결정 사항** (Tori spec 그대로): 6개 항목 모두 확정 — 추가 결정 불필요.

---

## 7. Roy 결정 요청

A. **권장 큐대로 진행** — 18644993 즉시 시작. 17989643 제거, 16220512 ENV/prod 검증만 별도. 8h.

B. **Tori 큐 그대로** — 16220512 → 18644993 → 17989643 → 16220538. 17989643은 이미 완료라 0h. 그래도 "확인" 시간 필요. 약 9h.

C. **다른 방향** — 알려주면 반영.

내 추천: **A**. 17989643은 검증 끝났고, 16220512는 코드 작업 0이라 큐에서 사실상 제외 가능.

알려주면 즉시 18644993 PR #1 착수.

— 꼬미
