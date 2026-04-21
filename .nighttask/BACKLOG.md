# 📋 Blend Backlog — 꼬미 영구 할일 목록
> 이 파일은 절대 삭제하지 않음. 매 nighttask 시작 시 **가장 먼저** 읽고 미완료 항목 전부 실행.
> 완료된 항목은 ✅로 표시하고 날짜 기록. 절대 삭제 금지 (히스토리 보존).
> 사용자가 새 요청하면 즉시 이 파일에 추가.

---

## 🔴 미완료 (오늘 밤 반드시 실행)

- [ ] **UI-01** `sidebar.tsx` — 하단 메뉴 5개 → 프로필 트리거 팝오버로 통합
  - **배경**: 사이드바 하단 메뉴(절약 대시보드·비용 분석·설정·보안·블렌드 소개) 5개가 너무 많아 공간 낭비
  - **방식**: 안 1 — 프로필 트리거 팝오버 (Claude/Notion/Linear 동일 패턴)
  - **트리거 버튼**: 사이드바 맨 하단 고정
    - 이니셜 아바타 원형 + 앱명 or 설정에 저장된 이름
    - 예: `[ B ] Blend` 또는 `[ R ] Roy Min`
  - **팝오버 구성** (클릭 시 위로 플로팅):
    ```
    ┌─────────────────────┐
    │ toroymin@gmail.com  │  ← 설정에 이메일 있으면 표시, 없으면 "Blend"
    ├─────────────────────┤
    │ ⚙️  설정             │
    │ 🛡️  보안             │
    │ ℹ️  블렌드 소개       │
    ├─────────────────────┤
    │ ✨  절약 대시보드     │
    │ 📊  비용 분석         │
    └─────────────────────┘
    ```
  - **기존 5개 메뉴**: 사이드바에서 제거 → 팝오버로 이동
  - **닫기**: 외부 클릭 또는 메뉴 항목 클릭 시 팝오버 닫힘
  - **모바일**: 동일 동작 (사이드바 하단 버튼 → 팝오버)
  - **i18n**: ko.json + en.json 팝오버 관련 키 추가
  - **참고 파일**: `src/modules/ui/sidebar.tsx`

- [ ] **COPY-01** 히어로 메시지 전면 교체 — 정직한 BYOK 가치제안으로
  - **대상 파일**: `ko.json`, `en.json`, `about-view.tsx`, `billing-view.tsx`, `welcome-view.tsx`
  - **새 헤드라인 (ko)**: "당신의 AI 구독료의 75%는 낭비입니다."
  - **새 서브 (ko)**: "AI 실사용은 약 $5. Blend는 ChatGPT · Claude · Gemini를 구독 없이 연결합니다. 쓴 만큼만 지불하세요."
  - **새 헤드라인 (en)**: "75% of your AI subscription is wasted."
  - **새 서브 (en)**: "Average actual usage is ~$5. Blend connects ChatGPT · Claude · Gemini without subscriptions. Pay only for what you use."
  - **제거**: 기존 `billing.hero_headline` (`$60 대신 $9에`) — 논리 오류 (Blend $9 + API 실사용비 별도인데 $9만 비교한 오해 유발)
  - **교체 범위**: about-view 히어로, billing-view 히어로, welcome-view 히어로 박스 전부
  - **about-view 구독의 함정 섹션**: 헤드라인도 새 카피에 맞게 정렬

- [ ] **TC-FAIL-045** `billing-view.tsx` — Pro/Lifetime CTA 버튼 모바일에서 결제 섹션으로 스크롤 안됨
  - **출처**: TEST-045, AI Round1 = Fail, 미수정
  - 모바일에서 CTA 버튼 클릭 시 `#plans` / 결제 섹션으로 smooth scroll 되어야 함
  - 수정 후: `gx.update_tc_result(51, 1, 'Pass', '수정 내용', source='ai')` 실행

- [ ] **TC-FAIL-046** `chat-view.tsx` — 모바일 채팅 툴바 `···` 드롭다운 대신 overflow 처리
  - **출처**: TEST-046, AI Round1 = Fail, 미수정
  - 모바일에서 툴바 아이콘이 넘칠 때 `···` 드롭다운 아닌 다른 방식으로 처리해야 함
  - 현재 상태 및 기대 동작 파악 후 수정
  - 수정 후: `gx.update_tc_result(52, 1, 'Pass', '수정 내용', source='ai')` 실행

- [ ] **TC-FAIL-047** `model-registry.ts` / `models-view.tsx` — 모델 설명이 '최신'·'최강' 대신 구체적 use-case 텍스트여야 함
  - **출처**: TEST-047, AI Round1 = Fail, 미수정
  - 모델 설명: "최신", "최강" 같은 추상적 표현 → "코딩·분석에 최적", "빠른 일상 대화용" 등 구체적 use-case로 교체
  - model-registry.ts의 description 필드 수정
  - 수정 후: `gx.update_tc_result(53, 1, 'Pass', '수정 내용', source='ai')` 실행

- [ ] **IMP-005** `chat-view.tsx` (또는 음성 입력 관련 컴포넌트) — 마이크 수동 종료 + 자연 멈춤 처리
  - **출처**: Improvement Requests 시트 row 12, K열 Approved by Anne Baltazar
  - **요구사항**:
    1. 마이크 버튼을 누른 후 → 사용자가 직접 Stop 버튼을 누를 때까지 계속 녹음
    2. 자연스러운 말 끊김(silence) 감지 시 조기 중단 금지 — 멈춤이 있어도 계속 대기
    3. 녹음 제출은 Enter 버튼(파란 화살표)으로만 → 별도 제출 플로우
    4. 사용자가 녹음 종료 + 제출을 완전히 제어
  - **작업 순서**:
    1. `gx.update_improvement_status(12, "🟠 In Progress")` 먼저 실행
    2. 현재 STT/음성 입력 구현 파일 파악 (`chat-view.tsx` 또는 별도 hook)
    3. silenceDetection / auto-stop 로직 비활성화
    4. 수동 stop + Enter 제출 UX 구현
    5. 완료 후 `gx.update_improvement_status(12, "🔵 Pending Re-test", notes="...")` 실행

---

## ✅ 완료된 항목

### [이전 세션 누락 항목]

- [x] **PREV-01** `meeting-view.tsx` — PDF 출력 버튼 추가 ✅ 2026-04-20
  - PDF 출력 버튼 (회의 분석 화면 상단 우측)
  - 클릭 시 미리보기 모달 → 전문 회의록 포맷 (제목/날짜/시간/안건/대화/분석/요약/액션아이템)
  - 미리보기에서 "출력" + "취소" 버튼
  - 브라우저 print popup으로 PDF 저장/출력

### [2026-04-19 신규 요청]

- [x] **TODAY-01** `meeting-view.tsx` — Mind Map 버그 수정 ✅ 2026-04-20
  - markmap-lib/view 동적임포트 실패 → 순수 React 비주얼 렌더러로 교체
  - 마크다운 파싱 → 노드/브랜치 컬러 코딩 트리로 렌더링

- [x] **TODAY-02** `data-source-view.tsx` / `chat-view.tsx` — RAG/회의분석/데이터소스 채팅 연동 버그 ✅ 2026-04-20
  - 원인: `loadFromDB()` isLoaded 가드로 인해 sync 후 in-memory store 미업데이트
  - 수정: `loadFromDB({ force: true })` 파라미터 추가 + datasource sync 후 강제 재로드
  - document-store.ts에 `opts?: { force?: boolean }` 파라미터 추가

- [x] **TODAY-03** `data-source-view.tsx` — UI 텍스트 변경 ✅ 2026-04-20
  - "데이터 소스 (기업용)" → "데이터 소스 연결" (ko.json + en.json)

- [x] **TODAY-04** `data-source-view.tsx` — OneDrive OAuth 버그 수정 ✅ 2026-04-20
  - Implicit flow (response_type=token) → PKCE code flow로 완전 교체
  - onedrive-connector.ts + oauth-callback/page.tsx 업데이트

- [x] **TODAY-05** `data-source-view.tsx` — NAS/WebDAV 비활성화 ✅ 2026-04-20
  - 클릭 불가 + 회색 처리 + "준비 중" 뱃지 표시

- [x] **TODAY-06** `model-registry.ts` + `chat-view.tsx` + `models-view.tsx` — 모델 날짜 버전 정리 ✅ 2026-04-20
  - `applyFamilyPolicy()` + `getDisplayModels()` 함수 추가
  - 날짜 버전 (YYYY-MM-DD 등) 자동 제거, 패밀리별 최신 2개만 유지
  - chat-view, models-view 모두 getDisplayModels() 사용으로 통일

- [x] **TODAY-07** `welcome-view.tsx` / `billing-view.tsx` — 히어로 절약 앵커 디자인 ✅ 2026-04-20
  - "Claude + ChatGPT + Gemini를 월 $60 대신 $9에." 히어로 박스
  - 개별 구독 $60 취소선 → Blend $9, $51/월 절약, $612/연 절약 뱃지
  - welcome-view 인트로 화면 + billing-view 최상단 양쪽 모두 적용

### [2026-04-21 nighttask 자동 완료]

- [x] **TODAY-09** `chat-view.tsx` — 채팅 입력창에 데이터소스 연결 뱃지 표시 ✅ 2026-04-21
  - useDataSourceStore 연동, status==='connected' 소스에 대해 아이콘+이름+연결됨 뱃지 렌더링
  - Google Drive ☁️, OneDrive 🔵, Local 💾 아이콘 구분
  - 채팅 입력창 바로 위 flex wrap 레이아웃

- [x] **TODAY-08** `chat-view.tsx` — 채팅창 스크롤 하단 버튼 + 그라디언트 ✅ 2026-04-21
  - messagesContainerRef + isAtBottom state (100px 임계값)
  - ChevronDownIcon absolute 포지셔닝, smooth scroll on click
  - 하단 16px 그라디언트 fade (gray-900 → transparent)

### [2026-04-20 사용자 요청]

- [x] **DESIGN1-01** design1 클론 라우트 생성 ✅ 2026-04-20

- [x] **TODAY-07b** `about-view.tsx` — 블렌드 소개 히어로 절약 앵커 적용 ✅ 2026-04-20
  - billing.hero_headline 재사용: "Claude + ChatGPT + Gemini, 월 $60 대신 $9에."
  - $60 취소선 → $9 블루 비교 시각
  - $51/월·$612/연 절약 뱃지
  - CTA 버튼 순서: "지금 시작하기"(billing) 우선
  - `/design1/ko/qatest`, `/design1/en/qatest` URL 추가
  - `src/app/design1/[lang]/qatest/page.tsx` + `page-client.tsx` 생성
  - 기존 링크와 완전 별개 — 디자인 비교/선택용

---

## 📌 영구 정책 (매 nighttask마다 자동 적용, 절대 빠뜨리면 안됨)

### 🔁 개발 완료 후 반드시 실행하는 4단계 프로세스

**① GitHub 커밋** — 파일별 세부 내용 전부 포함
```bash
git add -A
git commit -m "feat: ... (변경된 모든 파일 + 구체적 내용)"
git push
```

**② Blend_QA_Task.xlsx Dev 시트 기록** — graph_excel.py 사용
```python
gx.append_dev_row({
    "commit_hash": "커밋해시",       # → H열 GitHub URL 자동생성
    "confluence_url": "컨플루언스URL", # → I열
    "summary": "작업 요약",
    "details": "파일별 상세 내용",
})
```

**③ Confluence 개발일지 업데이트**
- cloudId: 74f8aa88-85be-4fe3-a0af-6526eb54a763
- space: 5079095 (Blend), parent: 9371649
- 상세하게 작성: 변경 파일별 bullet + QA 결과 표 + 다음 예정 작업

**④ GAS 이메일 발송** — 오늘 실제 데이터로 업데이트 후 발송
```bash
GAS_URL="https://script.google.com/macros/s/AKfycbzZbYIKx7CSfMC2HhxBtkmL4p4t1DBYwoMAZwgRwSKRYztjwQbXcvxEK2MeoMvdMFfM/exec"
curl -s -L "${GAS_URL}?action=setData&data=${오늘데이터}"
curl -s -L "${GAS_URL}?action=sendDevReport"
```

---

### 기타 영구 정책
- QA: ko/qatest + en/qatest 두 화면 모두 테스트
- design1 QA: /design1/ko/qatest + /design1/en/qatest 두 화면 포함
- QA Phase 1~4 매일 실행 (총 300개+)
- 모델 sync: 패밀리별 최신 2개만 유지
- 실행 시간: 새벽 1:07 ~ 오전 7:00 (6시간 풀가동)
