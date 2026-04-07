# Blend Work Log — Day 4

Date: 2026-04-07

---

## 구현 내용

### 1. 대화 태그 시스템

**변경 파일:**
- `src/types/index.ts` — `Chat` 타입에 `tags?: string[]` 이미 존재 확인 (하위 호환 유지)
- `src/stores/chat-store.ts` — 3개 액션 추가:
  - `addChatTag(chatId, tag)` — 중복 방지 포함
  - `removeChatTag(chatId, tag)` — 태그 제거
  - `getAllChatTags()` — 전체 채팅에서 고유 태그 집합 반환
- `src/modules/chat/chat-tags.tsx` — 신규 생성: 태그 배지 + 인라인 입력 UI (Enter/Escape 지원)
- `src/modules/ui/sidebar.tsx` — 태그 필터 바 추가:
  - "전체" 버튼 + 태그별 버튼으로 필터링
  - 각 채팅 항목 아래에 태그 표시 (클릭 이벤트 버블링 방지)
  - 태그가 없는 채팅은 태그 영역 미표시

### 2. 프롬프트 변수 치환 모달

**변경 파일:**
- `src/modules/prompts/prompt-variable-modal.tsx` — 신규 생성:
  - `{{변수명}}` 변수별 입력 필드
  - 마지막 필드에서 Enter 시 자동 확인
  - Escape 로 취소
- `src/modules/prompts/prompts-view.tsx` — `handleUse` 개선:
  - 기존 `window.prompt()` (블로킹 네이티브 다이얼로그) 제거
  - 변수가 있는 프롬프트: `PromptVariableModal` 표시
  - 변수 없는 프롬프트: 기존처럼 즉시 채팅 입력창에 삽입

### 3. 모델 비교 개선

**변경 파일:**
- `src/modules/models/model-compare-view.tsx`:
  - 최대 3개 모델 선택 제한 (`MAX_COMPARE_MODELS = 3`) 명시적 적용
  - 3개 선택 시 나머지 버튼 비활성화 + 툴팁 표시
  - 기존 소요시간/토큰/비용 표시 기능 유지
  - 기존 3-column 그리드 레이아웃 유지

### 4. Anthropic 스트리밍 안정화

**변경 파일:**
- `src/modules/chat/chat-api.ts`:
  - `handleAnthropic` — 라인 버퍼(`lineBuffer`) 도입: 네트워크 청크가 줄 경계에서 끊겨도 안전
  - `message_start` 이벤트에서 `input_tokens` 수집 (기존 코드는 `message_delta`에서만 읽어 0이 되는 버그)
  - `content_block_delta`의 `delta.type === 'text_delta'` 조건 명시 (Anthropic API 스펙 준수)
  - `handleOpenAI`도 동일 라인 버퍼 방식으로 통일
  - 불완전 JSON은 `try/catch`로 무시 (기존 동작 유지)

---

## 이슈 & 메모

- `Chat` 타입의 `tags?: string[]`는 Day 1~3 생성된 기존 채팅 데이터에 해당 필드가 없어도 `undefined`로 처리되어 하위 호환 유지
- 프롬프트 스토어의 `loadFromStorage` / `saveToStorage`는 현재 수동 호출 방식 — Day 5에서 Zustand persist 미들웨어로 통일 고려
- 모델 비교는 선택 모델 초기값이 `['gpt-4o-mini', 'claude-haiku-4-5', 'gemini-2.0-flash']`이지만 API 키 없으면 빈 목록 표시됨 (기존 동작 유지)

---

## Day 5 계획

1. **로컬스토리지 persist 통일** — chat-store, agent-store를 Zustand persist 미들웨어로 마이그레이션 (새로고침 후 데이터 유지)
2. **채팅 내보내기 강화** — JSON 포맷 추가, 전체 대화 일괄 내보내기
3. **에이전트 도구 호출 UI** — function calling 결과 렌더링
4. **모바일 UX 개선** — 채팅 입력창 safe-area, 키보드 팝업 대응
5. **설정 화면 완성** — 테마 실제 적용 (CSS 변수 방식)
