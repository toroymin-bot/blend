# Blend — Project State (꼬미 세션 복원용)

> 새 세션 시작 시 이 파일 하나만 읽으면 전체 컨텍스트 복원됩니다.  
> 매 작업 완료 후 꼬미가 이 파일을 업데이트합니다.

**Last updated:** 2026-04-22 (QA Phase 2~4 완료 후)

---

## 프로젝트 개요

- **앱 이름:** Blend — 멀티 AI 채팅 앱 (BYOK, 서버리스)
- **배포 URL:** https://blend.ai4min.com
- **레포 경로:** `/Users/jesikroymin/Library/CloudStorage/OneDrive-MIN/Apps/Whichbusinesses/Blend`
- **기술 스택:** Next.js 16, TypeScript, Tailwind CSS, Zustand, Vercel

---

## 배포 규칙 (절대 준수)

```
vercel --prod   ← 코드 수정 후 반드시 이 명령으로 배포
```
- 배포 전 TypeScript 빌드 오류 없어야 함
- 기존 기능 절대 깨뜨리지 않기 (새 함수 추가 방식 선호)

---

## Excel QA 추적 규칙 (절대 준수)

```
Blend_QA_Task.xlsx → 반드시 graph_excel.py (Graph API)로만 수정
openpyxl 로컬 저장 절대 금지
```
- 경로: `/Users/jesikroymin/Library/CloudStorage/OneDrive-MIN/Apps/Whichbusinesses/graph_excel.py`
- TC 현황: TEST-001 ~ TEST-092 (전부 PASS)
- Dev 시트: row 78까지 기록됨

---

## Design Variants 현황

### 메인 (default) — `/[lang]/`
- URL: `blend.ai4min.com/ko/` , `/en/`
- 상태: **안정 운영 중**
- async params 버그 수정 완료 (커밋 183adc9)

### Design1 — `/design1/[lang]/`
- URL: `blend.ai4min.com/design1/ko/qatest` , `/design1/en/qatest`
- 상태: **Phase 1~4 완료, 안정 운영 중**
- QA 페이지: `/design1/[lang]/qatest/page.tsx`

#### Design1 완료 Phase 목록
| Phase | 내용 | 커밋 |
|-------|------|------|
| Phase 1 | 채팅 빈 화면 KO+EN | - |
| Phase 2a | 채팅 활성 + 모델 드롭다운 | - |
| Phase 2b | 파일첨부 연결 + mic 버튼 제거 + meeting i18n | 297df88 |
| Phase 3 | 새 채팅, 대화 히스토리, 스크롤-투-바텀 | 06e2fa2 |
| Phase 3b | API 키 온보딩 화면 (D1KeyOnboarding) | 03783f7 |
| Phase 4 | 전체 사이드바 재설계 + feature parity | 57ac124 |
| Bug fix | async params /en/ 영어 표시 수정 | 8ebad9c |

#### Design1 남은 작업
- Phase 5+: 내부 뷰 리디자인 (Compare, Documents, Models, Meeting, Agents, Prompts, Settings, Dashboard, Security, Billing, About)
- 현재 내부 뷰는 메인 컴포넌트 재사용 중

#### Design1 핵심 규칙
- 컴포넌트 prefix: `D1` (D1ChatView, D1KeyOnboarding, D1Sidebar 등)
- `page-client.tsx` → `AppContentDesign1(urlLang)` → `D1ChatView(lang)` 순으로 lang prop 전달
- `/[lang]/qatest` (원본) 절대 수정 금지
- localStorage 키: `blend:api-keys`, `blend:design1:chat-history`

#### Design1 핵심 파일
```
src/app/design1/[lang]/page-client.tsx   ← 메인 진입점
src/app/design1/[lang]/qatest/page.tsx   ← QA 테스트 페이지
src/app/design1/layout.tsx
src/modules/chat/chat-view-design1.tsx   ← D1 채팅 뷰
```

### Design2 — `/design2/[lang]/`
- 상태: async params 버그 수정 완료 (커밋 a052d3b)

### Design3 — `/design3/[lang]/`
- 상태: async params 버그 수정 완료 (커밋 a052d3b)

---

## Design Tokens (Design1 — 절대 변경 금지)

| 항목 | 값 |
|------|-----|
| Background | `#fafaf9` |
| Text | `#0a0a0a` |
| Accent | `#c65a3c` |
| 폰트 (KR) | Pretendard Variable |
| 폰트 (EN) | Geist |
| 폰트 (Accent) | Instrument Serif |

---

## i18n 현황

- `src/locales/ko.json` = `src/locales/en.json` = **925개 키 완전 일치**
- 누락 키: 0개
- `chat.more_options` + `common.more_options` 둘 다 존재 (의도적 — 다른 컨텍스트)
- i18n 훅: `useTranslation()` — 전 뷰에서 올바르게 사용 중

---

## QA 현황 (2026-04-22 기준)

| Phase | 항목 | 결과 |
|-------|------|------|
| Phase 1 | 기본 렌더링 · i18n · 결제 | ✅ PASS |
| Phase 2 | formatUSD · i18n 커버리지 · FIX-01/03 | ✅ PASS |
| Phase 3 | 전 뷰(13개) 코드 QA | ✅ PASS |
| Phase 4 | formatUSD 엣지케이스 · i18n 925키 | ✅ PASS |

**TC 총계:** TEST-001~092, 전부 PASS  
**발견된 개선사항:** `formatUSD` 3곳 중복 정의 → 기능 이상 없음, 추후 리팩토링 대상

---

## 최근 주요 커밋 (최신순)

| 해시 | 내용 |
|------|------|
| 183adc9 | fix(QA): i18n 하드코딩 한국어 제거 + main async params 수정 |
| a052d3b | fix: design2/3 async params 수정 |
| 6f8163b | fix(i18n): chat.more_options → chat 섹션 이동 |
| 8ebad9c | fix(design1): async params /en/ 영어 표시 |
| 297df88 | feat(design1): Phase 2b |
| 57ac124 | feat(design1): Phase 4 사이드바 |
| 03783f7 | feat(design1): Phase 3b API 키 온보딩 |
| 06e2fa2 | feat(design1): Phase 3 히스토리 |

---

## 운영 환경

| 항목 | 값 |
|------|-----|
| Node | 프로젝트 로컬 |
| 배포 | Vercel (toroymin-bots-projects/blend) |
| 도메인 | blend.ai4min.com |
| 국가 감지 | `use-country.ts` — KR/PH 이중 통화 |
| 결제 | Paddle(글로벌) · Toss(KR) · Xendit(PH/SE Asia) |

---

## 새 세션 시작 방법

```
1. PROJECT_STATE.md 읽기 (이 파일)
2. 필요한 경우 WORK_LOG_DAY10.md 읽기 (마지막 일지)
3. 작업 지시 대기
```

**파일 읽기 원칙 (컨텍스트 절약):**
- 파일 전체가 아닌 필요한 줄만 읽기 (`offset` / `limit` 활용)
- 빌드 로그는 에러만 확인, 성공 로그는 버리기
- 큰 JSON 파일(ko.json, en.json) 읽을 때는 특정 섹션만 grep
