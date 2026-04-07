# Blend — Work Log Day 7

**날짜:** 2026-04-07
**빌드 상태:** ✓ 성공 (Next.js 16.2.2 Turbopack)

---

## 구현 내용

### 1. 메시지 편집 & 재생성

**파일 변경:**
- `src/stores/chat-store.ts` — `editMessage(chatId, messageId, newContent)` 액션 추가
  - 해당 메시지까지만 유지하고 이후 메시지 전체 삭제
  - localStorage 즉시 저장
- `src/modules/chat/chat-view.tsx`
  - 사용자 메시지에 연필(Pencil) 아이콘 버튼 추가 (스트리밍 중 비활성)
  - 클릭 시 인라인 textarea로 전환, Enter 또는 "저장 후 재생성" 버튼으로 저장
  - `handleEditSave()`: editMessage 호출 → zustand getState()로 최신 메시지 목록 읽기 → AI 재호출
  - `streamAIResponse()` 헬퍼 함수 추출 — editMessage & regen 모두 재사용
  - 재생성(RefreshCw) 버튼: 기존엔 setInput만 하던 것을 AI 즉시 재호출로 변경

### 2. 스트리밍 토큰 카운터

**파일 변경:**
- `src/modules/chat/chat-view.tsx`
  - `streamTokenCount`, `showTokenCounter` 상태 추가
  - `tokenHideTimerRef` 로 3초 후 자동 숨김 처리
  - 스트리밍 중 우측 하단 고정 pill UI: `~N 토큰 · $0.000xxx`
  - 토큰 수 근사치: `content.length / 4`
  - 스트리밍 완료 후 파란 점 → 회색 점으로 전환, 3초 유지 후 사라짐
  - handleSend 와 streamAIResponse 양쪽 모두 카운터 업데이트

### 3. 프롬프트 내보내기

**파일 변경:**
- `src/modules/prompts/prompts-view.tsx`
  - "내보내기" 버튼 추가 (가져오기 버튼 왼쪽)
  - 클릭 시 JSON / CSV 드롭다운 표시
  - `handleExportJSON()`: `[{title, content, tags}]` 형식 JSON 다운로드
  - `handleExportCSV()`: 헤더 포함 quoted CSV 다운로드
  - Blob + createObjectURL 방식으로 브라우저 다운로드 트리거

### 4. Tailwind 테마 토큰 부분 도입

**파일 변경:**
- `src/app/globals.css`
  - `:root`, `[data-theme="dark"]`, `[data-theme="light"]`, `.theme-light` 각각에 6개 CSS 변수 추가:
    - `--surface`, `--surface-2`, `--on-surface`, `--on-surface-muted`, `--border`, `--accent-token`
  - `@theme inline` 블록에 Tailwind v4 방식으로 색상 토큰 등록:
    - `--color-surface`, `--color-surface-2`, `--color-on-surface`, `--color-on-surface-muted`, `--color-border-token`, `--color-accent-token`
- `src/modules/ui/sidebar.tsx` — 시범 마이그레이션
  - `bg-gray-900` → `bg-surface`
  - `bg-gray-800` → `bg-surface-2`
  - `border-gray-700/800` → `border-border-token`
  - `text-gray-400/500` → `text-on-surface-muted`
  - `text-white` → `text-on-surface`
  - `hover:bg-gray-800` → `hover:bg-surface-2`

---

## 이슈 & 결정 사항

- **Tailwind v4 설정 방식**: `tailwind.config.ts` 파일이 없음. v4는 `globals.css` 의 `@theme inline` 블록에서 직접 토큰 등록. `--color-*` prefix 를 사용해야 Tailwind 유틸리티 클래스(`bg-surface` 등)로 사용 가능.
- **`border` 토큰 이름 충돌**: Tailwind 기본 `border` 색상과 충돌 방지를 위해 CSS 변수명은 `--border`, Tailwind 토큰명은 `--color-border-token` / 클래스명 `border-border-token` 으로 분리.
- **`accent` 토큰 이름**: 기존 `--accent` CSS 변수와 구분을 위해 토큰명 `--accent-token` 사용.
- **streamAIResponse 헬퍼**: handleSend 내 인라인 스트리밍 로직을 별도 함수로 추출해 edit & regen 모두 재사용. auto-title 생성은 신규 메시지 흐름(handleSend)에서만 적용.
- **editMessage 후 getState()**: React state는 비동기 반영이므로 zustand `useChatStore.getState()` 로 즉시 최신 메시지 목록 읽기.

---

## Day 8 계획

1. **사이드바 전체 마이그레이션** — 나머지 파일들도 토큰 기반으로 전환
2. **메시지 검색** — 대화 내 전문 검색 (Ctrl+F 스타일)
3. **API 사용량 대시보드 차트 개선** — 일별/모델별 분류 시각화
4. **프롬프트 편집 UI 개선** — 인라인 편집 모달 폼 개선
5. **키보드 단축키 확장** — 편집(E), 재생성(R) 단축키
