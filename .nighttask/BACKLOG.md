# 📋 Blend Backlog — 꼬미 영구 할일 목록
> 이 파일은 절대 삭제하지 않음. 매 nighttask 시작 시 **가장 먼저** 읽고 미완료 항목 전부 실행.
> 완료된 항목은 ✅로 표시하고 날짜 기록. 절대 삭제 금지 (히스토리 보존).
> 사용자가 새 요청하면 즉시 이 파일에 추가.

---

## 🐛 QA 발견 버그 (야간 자동 픽스 대상)

- [x] **TORI-16384344** 회의 분석 P0 핫픽스 — Bug A (transcript 언어 미스매치) + Bug B (PDF 빈 화면) ✅ 2026-04-26 (commit `6b8bcf8`)
  - Bug A: `meeting-plugin.ts:diarizeSpeakers()`에 lang param + "preserve language" 시스템 프롬프트 + speaker label i18n
  - Bug B: `export-meeting-pdf.ts` 외부 컨테이너 width:180mm + `document.fonts.ready` 대기 + html2canvas height/width/windowHeight 옵션
  - Roy 엣지 케이스 (한국어 UI + 영어 회의) → Tori 추천 옵션 A 적용 (input language 항상 보존)
  - 🔵 **Roy 검증 필요**: production에서 PDF 직접 다운로드 + 한국어 transcript 출력 확인
  - 보고: https://ai4min.atlassian.net/wiki/spaces/Blend/pages/16351935

- [x] **BUG-004** API 라우트 Rate Limiting 없음 — N/A 처리 ✅ 2026-04-27
  - **결론**: Blend는 `next.config.js`에 `output:'export'` (정적 빌드) 사용. `/api/web-search`, `/api/transcribe`, `/api/image-gen`, `/api/url-reader`, `/api/webdav-proxy`, `/api/youtube-transcript` 모두 `force-static` + `{ disabled: true }` 응답만 반환하는 stub. 실제 API 호출은 BYOK로 클라이언트가 provider에 직접 한다 → 서버에 rate limit 대상 없음.
  - 재오픈 조건: 동적 API 라우트 도입 시점 (백엔드 라이센스 검증·결제 webhook 등) — 그때 IP 기반 token bucket 추가.

- [x] **BUG-005** localStorage QuotaExceededError 미처리 ✅ 2026-04-27 (commit pending)
  - 신규: `src/lib/safe-storage.ts` — `safeSetItem(key, value, store)` 유틸. quota 에러 감지 시 console.warn + `blend:storage-quota-exceeded` window event dispatch.
  - 신규: `src/components/storage-quota-toast.tsx` — 이벤트 수신 시 우측 하단 토스트 (ko/en, 자동 8s dismiss, "보안 열기" → security view 이동).
  - 교체: `chat-store.ts`, `usage-store.ts` (purge-and-retry 단순화), `settings-store.ts`, `api-key-store.ts`, `agent-store.ts`, `prompt-store.ts`, `meeting-store.ts`, `plugin-store.ts`, `license-store.ts`, `datasource-store.ts` — bare `localStorage.setItem` → `safeSetItem`.
  - 통합: `app-content.tsx` + `app-content-design1.tsx`에 `<StorageQuotaToast onOpenSecurity={...} />` 마운트.

- [x] **BUG-003** React hydration error #418 — text content mismatch on `/ko/qatest` load ✅ 2026-04-25
  - **픽스 1** (ed07b7a): layout.tsx suppressHydrationWarning on `<html>`; dashboard-view + cost-savings-dashboard useState<Date|null>(null) + null guard; meeting-view.tsx suppressHydrationWarning on locale date spans
  - **픽스 2** (b543886): splash-screen.tsx h1 suppressHydrationWarning; chat-view-design1.tsx trial badge span suppressHydrationWarning
  - **픽스 3 — 완전 수정** (68f1a7a): i18n.ts useTranslation()에서 getLangFromPath()(window.location 기반, SSR에서 null 반환) → useParams()(next/navigation, SSR+클라이언트 모두 올바른 lang 반환)로 교체. /en/ 라우트 서버='ko' 클라이언트='en' 전면 미스매치 해결. chat-view-design1.tsx trial badge 내부 span에 suppressHydrationWarning 추가.
  - **✅ Re-test Pass** (2026-04-25): /ko/qatest + /en/qatest + /design1/ko/qatest 모두 #418 에러 없음 확인. 영어 UI 정상 렌더링 확인.

## 🔴 미완료 (오늘 밤 반드시 실행)

### 🆕 2026-04-25 오전 추가 — 컨셉 증명 + 카피 통일 + 모바일 반응형

처리 순서: **4.0a → 4.0 → 3.9** (3개 모두 `chat-view-design1.tsx` 수정 영역 겹침 → 단일 처리도 가능하나 **롤백 용이성을 위해 별도 브랜치/커밋 권장**).

---

- [x] **Phase 4.0a — 결제뷰 카피 통일** (`design1/phase4.0a-billing-copy`) ✅ 2026-04-25 (commit: 10a81e5)

  **배경**: "75%는 낭비입니다" 카피는 컨셉 합의 이전 버전. 새 컨셉으로 통일.

  **수정**:
  - 결제뷰 (`billing-view*.tsx` + 관련 i18n 파일):
    - 헤드: `"모든 AI를 하나의 키로."` / `"Every AI, with one key."`
    - 서브: `"하나로, 더 싸게, 더 스마트하게."` / `"One AI app — cheaper and smarter."`
  - 페이지 전체 톤 점검:
    - "75%", "낭비", 🔥/💰 같은 도발/광고 단어·이모지 제거
    - 가격 비교는 표·사실로만, 형용사 빼기
    - "구독 vs Blend" 비교 시: "당신의 API 키, 당신의 비용 — Blend는 그 위의 도구"

  **커밋 메시지**: `design1: Phase 4.0a — unify billing copy with new concept`

---

- [x] **Phase 4.0 — 컨셉 증명 디자인 (3가지 통합)** (`design1/phase4.0-concept-proof-design`) ✅ 2026-04-25 (commit: 32ee250) — "다른 AI로" 재생성은 toast 폴백, Phase 4.1로 이월

  **배경**: 블렌드 컨셉 "AI를 하나로, 더 싸게, 더 스마트하게"를 디자인으로 증명. 카피 외침 X, 기능과 디테일로 증명 O. 단계: 첫 진입(강렬) → 사용 중(엿보임) → 깊이(자연스럽게).

  **A. 히어로 서브카피 강화** — `chat-view-design1.tsx` 빈 채팅 상태:

  ```tsx
  <h1>{lang === 'ko' ? '무엇을 도와드릴까요?' : 'How can I help today?'}</h1>
  <p>{lang === 'ko' ? '하나로, 더 싸게, 더 스마트하게.' : 'One AI app — cheaper and smarter.'}</p>
  ```

  **B. 제안 카드 클릭 시 모델 자동 전환 애니메이션** — `chat-view-design1.tsx`:

  1. SUGGESTIONS 배열에 `suggestedModel` 추가:
     - 이메일 초안 → `gpt-5.4-mini`
     - 이미지 분석 → `gemini-3.1-pro` (없으면 `gemini-2.5-pro`)
     - 코드 리뷰 → `claude-sonnet-4-6`
     - 긴 글 요약 → `claude-sonnet-4-6`
  2. `handleSuggestionClick` 동작:
     - `setCurrentModel(s.suggestedModel)` 즉시
     - 200ms 후 `setValue(s.prompt)` + `inputRef.current?.focus()`
     - input에 `.d1-input-glow` 클래스 추가 → 800ms 후 제거
  3. 모델 칩 컴포넌트:
     - `useEffect`로 currentModel 변경 감지
     - 변경 시 `isChanging` state 500ms `true → false`
     - `isChanging` 시: `transform: scale(1.05)`, box-shadow accent ring
     - 색상 점 background도 transition으로 부드럽게 전환
  4. CSS:
     ```css
     @keyframes d1-glow-pulse {
       0%, 100% { box-shadow: 0 0 0 0 rgba(198, 90, 60, 0); }
       50%      { box-shadow: 0 0 0 4px rgba(198, 90, 60, 0.15); }
     }
     .d1-input-glow { animation: d1-glow-pulse 800ms cubic-bezier(0.4, 0, 0.6, 1); }
     ```
  5. 프로바이더별 색상 (BRAND_COLORS 기 정의됨, 점 색상에 활용):
     - anthropic `#c65a3c`, openai `#10a37f`, google `#4285f4`, deepseek `#5865f2`, groq `#ff6b35`, auto `#a8a49b`

  **C. 메시지 푸터 메타 + "다른 AI로"** — assistant 메시지 렌더 부분:

  ```tsx
  <div className="message-footer">
    <span>{getDisplayName(message.modelUsed)}</span>
    <span>·</span>
    <span>{formatTokens(message.totalTokens)}</span>
    <span>·</span>
    <span>{formatKRW(message.cost)}</span>
    <button onClick={() => handleRegenerateWithDifferentModel(message.id)}
            className="ml-auto opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity">
      ↻ {lang === 'ko' ? '다른 AI로' : 'Try another'}
    </button>
  </div>
  ```

  유틸:
  - `formatKRW`: USD → KRW (1 USD = 1370원, 환율 환경변수로 분리 가능). `"₩6"` 형식. 1원 미만은 `"<₩1"`. 영어 모드는 `$0.0042` 유지
  - `formatTokens`: 234 → "234토큰", 1234 → "1.2K토큰", 영어는 "tokens"

  `handleRegenerateWithDifferentModel`:
  - 인라인 모델 선택 미니 드롭다운 (`getFeaturedModels()`)
  - 선택 시 해당 메시지 삭제 → 새 모델로 재생성
  - **Phase 4.0 범위에서 미구현 시 toast로 "곧 지원됩니다"** 표시 → Phase 4.1로 이월

  **커밋 메시지**: `design1: Phase 4.0 — concept proof (hero subcopy + model swap animation + message footer meta)`

---

- [x] **Phase 3.9 — 모바일 반응형** (`design1/phase3.9-mobile-responsive`) ✅ 2026-04-25 (commit: 9248c2f)

  **배경**: iPhone Safari `/design1/ko` 스크린샷 깨짐 — 데스크탑 우선 디자인이라 컨셉 증명물(체험 배지·히어로)이 첫 인상에서 신뢰 손상.

  **수정**:

  **A. 히어로 타이틀** (`chat-view-design1.tsx` 빈 상태):
  ```tsx
  // 한국어만 모바일 줄바꿈, 영어는 한 줄 유지
  className="text-[40px] md:text-[56px] lg:text-[64px] leading-[1.1]"
  // "요?" 고아 글자 제거
  ```

  **B. 체험 배지** (상단바):
  ```tsx
  <span style={{ whiteSpace: 'nowrap' }}>
    {lang === 'ko'
      ? (isMobile ? `무료 · ${remaining}/10` : `무료 체험중 · ${remaining}/10`)
      : (isMobile ? `Trial · ${remaining}/10` : `Free trial · ${remaining}/10`)}
  </span>
  ```
  - `isMobile`: `window.innerWidth < 768` (useEffect + resize 리스너)
  - `whiteSpace: 'nowrap'` 필수 (3줄 분해 방지)

  **C. 내보내기 아이콘** (상단바 우측):
  - className에 `"hidden md:flex"` 추가 → 모바일에서 숨김
  - Phase 4.1에서 모바일 "..." 메뉴 검토

  **D. 제안 버튼 그리드**:
  - 기존 `flex-wrap` → 모바일 `grid grid-cols-2 gap-2 md:flex md:flex-wrap`

  **E. 사이드바 모바일 숨김** (`app-content-design1.tsx`):
  - `<aside>`: `"hidden md:flex md:flex-col md:w-[72px]"`
  - 메인 헤더에 햄버거 버튼 (`md:hidden`)
  - **MobileDrawer 신규 컴포넌트**:
    - `fixed inset-0 z-50`
    - 좌측 슬라이드 인 (`transform translate-x`)
    - 오버레이 배경 클릭 → 닫힘
    - 안에 Sidebar 재사용

  **검증**: Chrome DevTools Device Mode — iPhone 14 Pro (393x852), iPhone SE (375x667), iPad Mini (744x1133)
  - 히어로 깔끔한 2줄(KO) / 1줄(EN)
  - 배지 한 줄 `"무료 · 10/10"`
  - 사이드바 숨김 + 햄버거 보임
  - 제안 2x2 그리드
  - 내보내기 아이콘 안 보임

  **커밋 메시지**: `design1: Phase 3.9 — mobile responsive (hero, badge, sidebar drawer)`

---

- [x] **UI-01** `sidebar.tsx` — 하단 메뉴 5개 → 프로필 트리거 팝오버로 통합 ✅ 2026-04-22
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

- [x] **UI-02** `chat-view.tsx` — 모바일 채팅 툴바 정리 (아이콘 노출 + ··· 오버플로우) ✅ 2026-04-22
  - **문제**: 모바일에서 자동AI매칭 + 이미지생성 + 요약 + 🔊 + 내보내기가 한 줄에 안 들어가 줄바꿈 발생
  - **추천안**: 안 1 + 안 2 조합
    ```
    모바일: [🤖 자동 AI 매칭 ∨]  [🖼️]  [🔊]  [···]
    데스크탑: 기존 그대로 유지 (변경 없음)
    ```
  - **··· 탭 시 팝오버 or 드롭다운**:
    ```
    ✨ 요약
    ↓  내보내기
    ```
  - **구현 규칙**:
    - `md:` 브레이크포인트 기준 — 모바일(`< md`)에서만 적용
    - 이미지 생성(🖼️), 음성(🔊): 아이콘만, 텍스트 레이블 숨김 (`hidden md:inline` 처리)
    - 요약, 내보내기: 모바일에서 `···` 버튼 안으로 이동
    - `···` 버튼: 탭 시 위쪽으로 뜨는 소형 드롭다운 (absolute positioning)
    - 외부 클릭 시 드롭다운 닫힘
    - 자동 AI 매칭 선택기: 변경 없음 (그대로 유지)
  - **참고 파일**: `src/modules/chat/chat-view.tsx` (툴바 렌더링 부분)

- [x] **FIX-01** 전체 금액 표시 소수점 정리 — `$9.0` → `$9`, `$9.5` → `$9.5` ✅ 2026-04-22
  - **규칙**: 소수점 첫째 자리가 0이면 소수점 제거, 0이 아니면 1자리까지만 표시
  - **로직**:
    ```ts
    // src/lib/format-currency.ts (신규 유틸 파일 생성)
    export function formatUSD(amount: number): string {
      const rounded = Math.round(amount * 10) / 10;
      return rounded % 1 === 0 ? `$${rounded}` : `$${rounded.toFixed(1)}`;
    }
    // 원화 병기 포함 버전
    export function formatUSDWithKRW(amount: number, country?: string): string {
      const base = formatUSD(amount);
      if (country === 'KR') return `${base} (₩${Math.round(amount * 1380).toLocaleString()})`;
      return base;
    }
    ```
  - **적용 대상 파일 전수 검색 후 교체**:
    - `billing-view.tsx` — 플랜 가격 ($0.0, $9.0, $29.0 등)
    - `cost-savings-dashboard.tsx` — 절약 금액 표시
    - `dashboard-view.tsx` — 오늘 비용, 이번 달, 총 누적
    - `chat-view.tsx` — 메시지별 비용 표시
    - `models-view.tsx` — 모델별 비용
    - `about-view.tsx` — 비교 금액
    - `welcome-view.tsx` — 히어로 금액
    - 기타 `toFixed(` 또는 `.toLocaleString(` 사용 파일 전부
  - **검색 명령**:
    ```bash
    grep -rn "toFixed\|\.toLocaleString\|\${\|formatPrice\|formatCost" src/ --include="*.tsx" --include="*.ts" -l
    ```
  - **원화(₩) 병기도 동일 규칙 적용** — `₩12,420.0` 같은 케이스 없는지 확인

- [x] **COPY-01** 히어로 메시지 전면 교체 — 정직한 BYOK 가치제안으로 ✅ 2026-04-22
  - **대상 파일**: `ko.json`, `en.json`, `about-view.tsx`, `billing-view.tsx`, `welcome-view.tsx`
  - **새 헤드라인 (ko)**: "당신의 AI 구독료의 75%는 낭비입니다."
  - **새 서브 (ko)**: "AI 실사용은 약 $5. Blend는 ChatGPT · Claude · Gemini를 구독 없이 연결합니다. 쓴 만큼만 지불하세요."
  - **새 헤드라인 (en)**: "75% of your AI subscription is wasted."
  - **새 서브 (en)**: "Average actual usage is ~$5. Blend connects ChatGPT · Claude · Gemini without subscriptions. Pay only for what you use."
  - **제거**: 기존 `billing.hero_headline` (`$60 대신 $9에`) — 논리 오류 (Blend $9 + API 실사용비 별도인데 $9만 비교한 오해 유발)
  - **교체 범위**: about-view 히어로, billing-view 히어로, welcome-view 히어로 박스 전부
  - **about-view 구독의 함정 섹션**: 헤드라인도 새 카피에 맞게 정렬

- [x] **TC-FAIL-045** `billing-view.tsx` — Pro/Lifetime CTA 버튼 모바일에서 결제 섹션으로 스크롤 안됨 ✅ 2026-04-22 (기구현됨)
  - **출처**: TEST-045, AI Round1 = Fail, 미수정
  - 모바일에서 CTA 버튼 클릭 시 `#plans` / 결제 섹션으로 smooth scroll 되어야 함
  - 수정 후: `gx.update_tc_result(51, 1, 'Pass', '수정 내용', source='ai')` 실행

- [x] **TC-FAIL-046** `chat-view.tsx` — 모바일 채팅 툴바 `···` 드롭다운 대신 overflow 처리 ✅ 2026-04-22
  - **출처**: TEST-046, AI Round1 = Fail, 미수정
  - 모바일에서 툴바 아이콘이 넘칠 때 `···` 드롭다운 아닌 다른 방식으로 처리해야 함
  - 현재 상태 및 기대 동작 파악 후 수정
  - 수정 후: `gx.update_tc_result(52, 1, 'Pass', '수정 내용', source='ai')` 실행

- [x] **TC-FAIL-047** `model-registry.ts` / `models-view.tsx` — 모델 설명이 '최신'·'최강' 대신 구체적 use-case 텍스트여야 함 ✅ 2026-04-22
  - **출처**: TEST-047, AI Round1 = Fail, 미수정
  - 모델 설명: "최신", "최강" 같은 추상적 표현 → "코딩·분석에 최적", "빠른 일상 대화용" 등 구체적 use-case로 교체
  - model-registry.ts의 description 필드 수정
  - 수정 후: `gx.update_tc_result(53, 1, 'Pass', '수정 내용', source='ai')` 실행

- [x] **FIX-02** `ko.json` / `en.json` — RAG 문서 삭제 확인 버튼 "예" → "삭제" ✅ 2026-04-21
  - `documents.yes`: "예" → "삭제" (ko), "Yes" → "Delete" (en)
  - 파일: `src/locales/ko.json`, `src/locales/en.json`
  - 렌더링: `document-plugin-view.tsx` line 200 `{t('documents.yes')}` — 별도 코드 변경 없음

- [x] **IMP-005** `chat-view.tsx` (또는 음성 입력 관련 컴포넌트) — 마이크 수동 종료 + 자연 멈춤 처리 ✅ 2026-04-22 (기구현됨)
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

- [x] **FIX-03** `chat-view.tsx:1531-1532` — `더보기` 하드코딩 → i18n 키로 교체 ✅ 2026-04-22
  - `title="더보기"` / `aria-label="더보기"` → `t('chat.more_options')` 로 교체
  - ko.json: `"more_options": "더보기"`, en.json: `"more_options": "More options"` 추가

---

### 🆕 2026-04-25 — design1 11개 페이지 전면 리디자인 (Web Claude 브리핑)

**배경**: chat-view-design1 디자인 토큰 기준으로 전체 design1 라우트 11페이지 순차 리디자인. 한 번에 1페이지, Roy OK 후 다음 진행. 디자인 문서: Downloads/*.md

처리 순서: Compare → Billing → Documents → Models → Dashboard → Agents → Meeting → DataSources → CostSavings → Security → About

---

디자인 문서 폴더: `/Users/jesikroymin/Downloads/files (4)/` + `/Users/jesikroymin/Downloads/files (5)/` (Billing·CostSavings 업데이트 버전)
결정 대기 문서: `Design_Decisions_Pending_2026-04-25.md` (D2~D16 결정 필요)

**✅ D1 결정 완료 (2026-04-25): CostSavings 별도 페이지 유지 (옵션 A)**
- Billing = "얼마 썼나?" (이성적·관리적, 이번 달)
- CostSavings = "얼마 아꼈나?" (만족감·동기부여, 누적)
- 근거: 잡스 "calls / music / internet" — 두 메시지 섞으면 둘 다 약해짐

**⚠️ Roy 결정 필요:**
- D14: 구현 순서 OK? (Compare→Billing→Documents→Models→Dashboard→Agents→Meeting→DataSources→CostSavings→Security→About, 총 11페이지)
- D15: 페이지별 배포 OK?

---

- [x] **D1-Page-01 — Compare 뷰 리디자인** (디자인 문서: `Compare_2026-04-25_v1.md`) ✅ 2026-04-25 (commit: 3526ed8)
  - 신규: compare-view-design1.tsx (self-contained, Promise.all streaming, max 3 models)
  - app-content-design1.tsx: D1CompareView 통합 + handleContinueInChat + chatInitialModel state
  - chat-view-design1.tsx: initialModel prop 추가 (채팅으로 이어가기 pre-select)
  - 커밋 브랜치: `design1/compare-view-redesign`
  - **Roy OK 받은 후 다음 페이지 진행**

- [x] **D1-Page-02 — Billing 뷰 리디자인** (디자인 문서: `files (5)/Billing_2026-04-25_v1.md`) ✅ 2026-04-25 (commits: 47f5c45 + 4e9e820 typefix + 4224fee USD-default-$2)
  - 역할: "얼마 썼나?" — 이번 달 사용량 + 구독 비교 + 한도 설정 (이성적·관리적)
  - 누적 절약 포함 안 함 (CostSavings 별도 페이지)
  - 신규: billing-view-design1.tsx (단일 파일, 섹션1~3 + SVGLineChart + LimitRow + ToggleRow)
  - app-content-design1.tsx: BillingView → D1BillingView 교체
  - 한도 저장: USD 정규화(localStorage `d1:billing-limit`), KO에서 ₩ 입력 → /1370 = USD, 기본 일일 한도 $2
  - 커밋 브랜치: `design1/billing-view-redesign`
  - **Roy OK 받은 후 D1-Page-03 진행**

- [x] **D1-Page-03 — Documents 뷰 리디자인** (디자인 문서: `Documents_2026-04-25_v1.md`) ✅ 2026-04-25 (commit: 1d452c2)
  - 신규: documents-view-design1.tsx (단일 파일, Dropzone + FileCard + ExtBadge + StatusLine + ConfirmModal)
  - 기존 useDocumentStore + parseDocument + generateEmbeddings 재사용 (별도 d1-documents-store 미생성)
  - app-content-design1.tsx: DocumentPluginView → D1DocumentsView 교체
  - 단순화: 좌측 리스트+우측 채팅 분할 대신 파일 관리 전용 뷰 (활성 문서는 chat에서 자동 RAG)
  - 커밋 브랜치: `design1/documents-view-redesign`
  - **Roy OK 받은 후 D1-Page-04 진행**

- [x] **D1-Page-04 — Models 뷰 리디자인** (디자인 문서: `Models_2026-04-25_v1.md`) ✅ 2026-04-25 (commit: 292e8cb)
  - 신규: models-view-design1.tsx (단일 파일, FilterChip + ModelCard)
  - 5개 프로바이더 그룹 + 필터 칩 5종 + REGISTRY_GENERATED_AT 마지막 업데이트
  - app-content-design1.tsx: ModelsView → D1ModelsView 교체
  - Confluence: https://ai4min.atlassian.net/wiki/spaces/Blend/pages/16416797

- [x] **D1-Page-05 — Dashboard 뷰 리디자인** (디자인 문서: `Dashboard_2026-04-25_v1.md`) ✅ 2026-04-25 (commit: 2ecd378)
  - 신규: dashboard-view-design1.tsx (단일 파일, KpiCard + Heatmap SVG + 가로막대 + Donut)
  - Period chips + 4 KPI + 7×24 히트맵 + Top-5 모델 + 카테고리 도넛(모델 휴리스틱)
  - app-content-design1.tsx: DashboardView → D1DashboardView 교체
  - Confluence: https://ai4min.atlassian.net/wiki/spaces/Blend/pages/16220215

- [x] **D1-Page-06 — Agents 뷰 리디자인** (디자인 문서: `Agents_2026-04-25_v1.md`) ✅ 2026-04-25 (commit: 39a8175)
  - 신규: agents-view-design1.tsx (단일 파일, AgentCard + AgentEditor 모달 + ConfirmModal + 이모지 팔레트 32)
  - Built-in/Custom 분리, 기존 useAgentStore 재사용 (별도 built-in-agents.ts 미생성)
  - app-content-design1.tsx: AgentsView → D1AgentsView 교체
  - Confluence: https://ai4min.atlassian.net/wiki/spaces/Blend/pages/16351325

- [x] **D1-Page-07 — Meeting 뷰 리디자인** (디자인 문서: `Meeting_2026-04-25_v1.md`) ✅ 2026-04-25 (commits: cf31772 + d3faf6c)
  - 신규: meeting-view-design1.tsx (단일 파일, InputPhase + ResultPhase + Section + ConfirmModal)
  - 텍스트/YouTube 입력 → AI JSON 분석 → 5섹션 결과 + localStorage history 30개
  - app-content-design1.tsx: MeetingView → D1MeetingView 교체
  - Confluence: https://ai4min.atlassian.net/wiki/spaces/Blend/pages/16351350
  - ⚠️ Roy 추가 디자인 문서 제공: `~/Downloads/Meeting_2026-04-25_v1.md` — 모든 페이지 끝나면 추가 적용

- [x] **D1-Page-08 — DataSources 뷰 리디자인** (디자인 문서: `DataSources_2026-04-25_v1.md`) ✅ 2026-04-25 (commit: cc6ed6c)
  - 신규: datasources-view-design1.tsx, connected-source-card, available-source-card
  - 커밋 브랜치: `design1/datasources-view-redesign`
  - 신규 디자인 파일 ~/Downloads/DataSources_2026-04-25_v1.md 적용

- [x] **D1-Page-09 — CostSavings 뷰 리디자인** ✅ 이미 구현됨 확인 2026-04-27
  - 파일: `src/modules/cost-savings/cost-savings-view-design1.tsx` (447 lines, baseline picker + cumulative SVG chart + by-model breakdown 모두 구현)
  - 현재 상태: app-content-design1.tsx에서 D1CostSavingsView가 `D1BillingView mode='savings'`로 라우팅됨 (2026-04-26 F-3 결정). dedicated cost-savings-view-design1.tsx 파일은 코드는 살아있으나 dead route. 향후 분리 페이지 복귀 결정 시 한 줄 변경으로 활성화 가능.

- [x] **D1-Page-10 — Security 뷰 리디자인** ✅ 이미 구현됨 확인 2026-04-27
  - 파일: `src/modules/security/security-view-design1.tsx` (478 lines, 데이터 위치 카드 + 키 마스킹 + 네트워크 로그 인터셉터 + 2단계 삭제 모달)
  - app-content-design1.tsx에서 정상 라우팅됨.

- [x] **D1-Page-11 — About 뷰 리디자인** ✅ 이미 구현됨 확인 2026-04-27
  - 파일: `src/modules/about/about-view-design1.tsx` (129 lines, 4 섹션: Why/Made by/Contact/Version)
  - app-content-design1.tsx에서 정상 라우팅됨.

---

- [x] **Phase 4.1 — "다른 AI로" 재생성** ✅ 2026-04-28 (이미 구현됨 + dead 카피 정리)
  - 확인: `regenerateAssistantMessage(assistantMsgId, newModel?)` line 718 + 인라인 모델 픽커 (`MessageBubble` line 1816~1851, `MODELS.filter((m) => m.id !== 'auto').slice(0, 8)`) + `nextModelOverrideRef` closure-safe override 모두 구현 완료 상태
  - 정리: dead 카피 `comingSoon: '곧 지원됩니다'` / `'Coming soon'` 3군데 (line 85, 108, 1630 type) 제거
  - **재테스트**: production 채팅에서 assistant 메시지 → "↻ 다른 AI로" hover → 모델 선택 → 직전 user 메시지 기준 재생성 확인 필요

### 🆕 2026-04-28 nighttask 발견 — 다음 nighttask 우선 처리

- [x] **REG-01** `model-registry.ts` — TC-FAIL-047 회귀 정리: "최신/최강" 추상 표현 15건 → use-case 기반 카피로 전부 교체 ✅ 2026-04-29
  - 수정 라인: 137, 485, 617, 677, 749, 785, 972, 996, 1008, 1145, 1241, 1301, 1325, 1385, 1421
  - 양쪽(description / descriptionKo) 모두 변경, 중복 카피였던 Claude Opus 4.5/4.1/4·Gemini 2.5 Flash TTS/Lite·Gemini 3 Pro Image/Lyria 3 Pro도 모델별 차별 카피로 분리
  - grep 검증: `grep -n "최신\|최강" src/modules/models/model-registry.ts` → 0 hit
  - 잔여 영구 정책 작업(모델 sync 자동 정규화 함수)은 별도 항목으로 향후 처리

- [x] **i18n-DELTA-01** ko/en locale 키 동기화 ✅ 2026-04-29 (검증 결과 차이 없음 — 양쪽 937키 완전 일치)
  - 파일: `src/locales/ko.json`, `src/locales/en.json`
  - 누락 키 추출 + 양쪽 동기화 (i18n 감사)
  - 명령:
    ```bash
    python3 -c "
    import json
    ko = json.load(open('src/locales/ko.json'))
    en = json.load(open('src/locales/en.json'))
    def flat(d, p=''):
        for k,v in d.items():
            if isinstance(v, dict): yield from flat(v, p+k+'.')
            else: yield p+k
    ks, es = set(flat(ko)), set(flat(en))
    print('ko-only:', sorted(ks - es))
    print('en-only:', sorted(es - ks))
    "
    ```

- [ ] **GAS-AUTH** GAS Web App 재인증 필요 (2026-04-24에도 미해결 — Gmail scope 오류 지속)
  - 현상: sendDevReport 실행 시 Gmail 권한 오류 발생
  - 해결: 사용자가 GAS 에디터에서 수동 재인증 필요 (Gmail scope 승인)
  - URL: https://script.google.com/macros/s/AKfycbzZbYIKx7CSfMC2HhxBtkmL4p4t1DBYwoMAZwgRwSKRYztjwQbXcvxEK2MeoMvdMFfM/exec

---

## ✅ 완료된 항목

### [2026-04-24 nighttask 자동 완료]

- [x] **SKILL-24** `cost-savings-dashboard.tsx` — toFixed(1) 복구: Math.round/toFixed(0) → formatUSD() 적용 ✅ 2026-04-24
- [x] **SKILL-25~27** `dashboard-view.tsx` — 중복 바 차트 제거, 영문 헤더 i18n, 토큰 차트 재디자인 (이전 nighttask에서 이미 구현됨 확인) ✅ 2026-04-24
- [x] **SKILL-28~29** `billing-view.tsx` 전체 i18n + 전체 i18n 감사 (이전 nighttask에서 이미 구현됨 확인) ✅ 2026-04-24
- [x] **SKILL-30** `about-view.tsx` About Blend 페이지 + 사이드바 연결 (이미 구현됨 확인) ✅ 2026-04-24
- [x] **i18n-FIX** `settings-view.tsx` Base URL 하드코딩 → t('settings.base_url') 교체 ✅ 2026-04-24
- [x] **i18n-FIX** `about-view.tsx` 3개 하드코딩 문자열 → t() 키로 교체 (why_blend_note, compare_total_sub_price, compare_total_blend_price) ✅ 2026-04-24
- [x] **TC-010** TEST-010 Round2 Pass 업데이트 (zoom/drag 코드 이미 구현됨, QA 결과가 오래된 버전 기준이었음) ✅ 2026-04-24
- [x] **QA** 코드 기반 Phase 3/4 감사 — 보안/타입/i18n/라우팅 전체 통과 ✅ 2026-04-24

### [2026-04-23 nighttask 자동 완료]

- [x] **TEST-010** `meeting-mindmap.tsx` — Mind Map 줌/드래그 인터랙션 추가 ✅ 2026-04-23
  - 마우스 휠 줌 (0.3x~3x), 드래그 패닝, +/− 버튼, ↺ 리셋, 줌% 표시
  - i18n: tab_mindmap, mindmap_no_data, mindmap_zoom_hint 키 추가

- [x] **i18n-AUDIT** 전체 i18n 감사 완료 ✅ 2026-04-23
  - about-view.tsx 비교표 헤더 "Service"/"Individual"/"Total" → t() 키 교체
  - meeting-view.tsx "Mind Map" 탭 라벨 → t('meeting_view.tab_mindmap') 교체
  - KO/EN 931개 키 완전 일치 (미번역 0개)

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
