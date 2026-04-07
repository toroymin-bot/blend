# Blend — Work Log Day 3 (2026-04-07)

## 구현 완료

### 1. 웹 검색 플러그인 (Brave Search API)
- `src/app/api/web-search/route.ts` 생성 — POST: Brave Search API 호출, GET: 가용성 확인
- 서버에 `BRAVE_SEARCH_API_KEY` 환경변수 없으면 `{available: false}` 반환
- `src/modules/plugins/web-search.ts` 생성
  - `performWebSearch(query)`: API 라우트 호출
  - `checkWebSearchAvailable()`: 서버 가용성 확인
  - `extractSearchQuery(input)`: `!search 검색어` / `?검색어` 패턴 파싱
  - `formatSearchResultsAsContext(query, results)`: 결과를 AI 컨텍스트 블록으로 포맷
- `chat-view.tsx`: handleSend 내 웹 검색 패턴 감지 → 검색 → 결과를 userContent에 추가 후 AI에 전달
- `plugins-view.tsx`: web-search `comingSoon: true` → `false`
- 검색 중 상태 표시 (초록 인디케이터)

### 2. 이미지 생성 플러그인 (DALL-E 3)
- `src/app/api/image-gen/route.ts` 생성 — OpenAI API BYOK(사용자 키 전달)
- DALL-E 3, 1024x1024, standard quality
- `src/modules/plugins/image-gen.tsx` 생성
  - `generateImage(prompt, apiKey)`: 이미지 생성 API 호출
  - `extractImagePrompt(input)`: `/image 프롬프트` 패턴 파싱
  - `extractImageURLs(text)`: AI 응답 내 이미지 URL 감지 (png/jpg/jpeg/webp/gif)
- `chat-view.tsx`:
  - `/image 프롬프트` 입력 시 DALL-E 3 호출, 결과 이미지 URL을 마크다운 이미지로 메시지에 추가
  - AI 응답 내 이미지 URL 감지 시 `<img>` 태그로 렌더링
- `plugins-view.tsx`: image-gen `comingSoon: true` → `false`
- 이미지 생성 중 상태 표시 (보라 인디케이터)

### 3. 채팅 PDF 내보내기
- `src/modules/chat/export-chat.ts` 수정 — `downloadChatAsPDF()` 함수 추가
  - 순수 HTML + 인쇄 CSS 방식 (`window.print()`)
  - 외부 라이브러리 없이 새 창에서 PDF 저장 가능
  - 사용자 메시지는 파란 배경, AI 메시지는 회색 배경으로 시각적 구분
- `chat-view.tsx`: 입력창 상단에 내보내기 드롭다운 추가 (MD / TXT / PDF)
  - 메시지가 있을 때만 표시

### 4. 모바일 UX 개선
- `src/modules/ui/sidebar.tsx`: `MobileBottomBar` 컴포넌트 추가
  - 채팅 / 모델 / 설정 3개 탭을 화면 하단에 고정
  - `md:hidden`으로 데스크톱에서는 숨김
- `src/app/page.tsx`:
  - `MobileBottomBar` import 및 렌더링
  - `onTouchStart` / `onTouchEnd` 핸들러 추가 — 왼쪽 엣지에서 오른쪽 스와이프 → 사이드바 열기, 왼쪽 스와이프 → 닫기
  - 모바일 메인 콘텐츠에 `pb-16` 추가 (하단 탭바 공간 확보)
- `chat-view.tsx`: 플러그인 상태에 따른 플레이스홀더 텍스트 동적 업데이트

## 빌드 결과
```
✓ Compiled successfully
✓ TypeScript 검사 통과
Route: /api/image-gen (Dynamic)
Route: /api/web-search (Dynamic)
Route: /api/url-reader (Dynamic)
```

## 이슈 및 참고사항
- BRAVE_SEARCH_API_KEY: 서버 환경변수에 설정해야 함 (`.env.local` 또는 서버 설정)
  - 없을 경우 플러그인 설치는 가능하나 검색 시 안내 메시지 표시
- DALL-E 3 이미지 URL은 OpenAI CDN에서 1시간 후 만료됨 — 저장이 필요한 경우 다운로드 권장
- PDF 내보내기는 `window.open()`을 사용하므로 팝업 차단 시 작동하지 않을 수 있음

## Day 4 계획
1. **대화 폴더/태그 시스템** — 채팅을 폴더로 분류하거나 태그 추가
2. **프롬프트 변수 치환** — `{{변수명}}` 패턴을 프롬프트 사용 시 입력창으로 치환
3. **모델 비교 개선** — 같은 질문을 동시에 여러 모델에 보내 응답 비교
4. **오프라인 지원 / PWA** — next-pwa 또는 service worker로 오프라인 접근 가능하게
5. **Anthropic Claude API 스트리밍 디버그** — 간헐적 스트리밍 끊김 원인 조사
