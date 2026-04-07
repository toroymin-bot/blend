# Blend Work Log — Day 5

**날짜:** 2026-04-07
**세션 목표:** 테마 시스템 실제 적용, localStorage persist 통일, JSON 내보내기, 모바일 safe-area

---

## 구현 내용

### 1. 테마 시스템 실제 적용

**문제:** settings-view.tsx의 테마 토글이 `document.documentElement.classList.toggle('theme-light')`로만 동작 — 새로고침 시 리셋됨, store와 미연동.

**해결:**
- `src/app/theme-provider.tsx` 신규 생성 — `useSettingsStore`에서 `settings.theme`을 읽어 `<html data-theme="...">` 속성을 동적 적용
  - `system` 선택 시 `prefers-color-scheme` 미디어쿼리 자동 감지 및 변경 리스닝
- `src/app/layout.tsx` 업데이트:
  - `ThemeProvider`로 children 래핑
  - `Viewport` export 추가 (Next.js 16 방식, `viewport-fit=cover` 포함)
  - 기본값 `data-theme="dark"` HTML 속성 (hydration 전 flash 방지)
- `src/app/globals.css` 업데이트:
  - `[data-theme="dark"]` 및 `[data-theme="light"]` 셀렉터 추가
  - 기존 `.theme-light` 클래스 유지 (하위 호환)
- `src/modules/settings/settings-view.tsx` 테마 섹션 재작성:
  - 토글 버튼 → 라이트/다크/시스템 3-way 선택 버튼
  - `updateSettings({ theme: t })`로 store에 저장 → ThemeProvider가 즉시 반영

### 2. localStorage Persist 통일

**문제:** `chat-store.ts`에 `loadFromStorage` / `saveToStorage` 없음 → 새로고침 시 모든 채팅 데이터 유실.

**해결:**
- `src/stores/chat-store.ts`에 `loadFromStorage` / `saveToStorage` 추가
  - `blend:chats` 키에 `{ chats, folders, selectedModel, currentChatId }` 저장
  - 모든 변경 액션 (`createChat`, `deleteChat`, `setCurrentChat`, `addMessage`, `updateChatTitle`, `setSelectedModel`, `createFolder`, `moveToFolder`, `forkChat`, `removeLastMessage`, `addChatTag`, `removeChatTag`)에 `saveToStorage()` 호출 추가
- `src/app/page.tsx`의 `useEffect`에 `loadChatFromStorage()` 추가
  - 기존 6개 store 로드와 동일한 패턴으로 통일

### 3. 채팅 JSON 내보내기 + 일괄 내보내기

**단일 채팅 JSON 내보내기:**
- `src/modules/chat/export-chat.ts`에 `downloadChatAsJSON(chat: Chat)` 함수 추가
  - 파일명: `{채팅제목}.json`
- `src/modules/chat/chat-view.tsx` 내보내기 드롭다운에 "JSON (.json)" 옵션 추가 (MD, TXT, JSON, PDF 순)

**전체 채팅 일괄 내보내기:**
- `exportAllChatsAsJSON`을 리팩터링: `version`, `exportedAt`, `totalChats`, `chats` 필드 포함한 구조화된 JSON
  - 파일명: `chats-backup-YYYYMMDD.json`
- `src/modules/settings/settings-view.tsx` 데이터 저장소 섹션에 "채팅 JSON 내보내기" 버튼 추가

### 4. 모바일 Safe-Area / 키보드 대응

**레이아웃:**
- `src/app/layout.tsx`: `viewport` export로 `viewportFit: "cover"` 적용 (Next.js 16 Metadata API)
- `src/app/globals.css`: `--safe-area-inset-bottom` CSS 변수 정의, `.safe-area-bottom` / `.safe-area-inset-bottom` 유틸 클래스, `@supports` 블록으로 `.mobile-input-area` 정의

**컴포넌트:**
- `src/modules/chat/chat-view.tsx` 입력 영역: `style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}` 적용
- `src/modules/ui/sidebar.tsx` 모바일 하단 탭바: `style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}` 적용

---

## 빌드 결과

```
✓ Compiled successfully in 1364ms
✓ TypeScript 통과
✓ 7개 정적 페이지 생성 완료
```

오류 없음.

---

## 이슈 / 주의사항

- `ThemeProvider`가 `loadFromStorage()`도 호출하므로 `page.tsx`의 `settingsStore.loadFromStorage()` 호출과 중복될 수 있음. 단, Zustand store이므로 두 번 호출해도 마지막 값으로 덮어쓰기 — 실질적 문제 없음. 추후 `page.tsx`에서 settings load 제거하거나 ThemeProvider에서 제거 고려.
- 채팅 데이터가 `localStorage`에 저장되므로 대용량 채팅 히스토리 (~5MB 이상)에서 저장 실패 가능. 추후 IndexedDB(`local-storage.ts`의 `storage` 유틸) 마이그레이션 고려.

---

## Day 6 계획

1. **IndexedDB 마이그레이션** — chat-store의 저장소를 localStorage에서 IndexedDB로 전환 (`src/modules/storage/local-storage.ts` 활용)
2. **라이트 모드 UI 완성** — 현재 하드코딩된 `bg-gray-900`, `text-white` 등 Tailwind 클래스들이 라이트 테마에서도 다크 색상으로 표시됨. CSS 변수 적용 범위 확대 필요.
3. **채팅 검색 강화** — 전체 메시지 내용 검색, 날짜 필터
4. **비용 알림** — 일일 한도 초과 시 알림
5. **프롬프트 가져오기** — JSON/CSV 형식 프롬프트 일괄 임포트
