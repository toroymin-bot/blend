# Blend — Day 10 Work Log (2026-04-07)

## 완료 항목

### 1. 멀티모달 이미지 입력 (Vision 지원)
- `types/index.ts`: `ChatMessage`에 `images?: string[]` 필드 추가
- `chat-api.ts`: 멀티모달 아키텍처 전면 리팩터
  - `MultimodalPart` / `MessageContent` / `ChatRequestMessage` 타입 신규 추출
  - `toOpenAIContent()` — OpenAI vision API 포맷 변환 (image_url 배열)
  - `toAnthropicContent()` — Anthropic vision 포맷 변환 (base64 image block)
  - `toGoogleParts()` — Google inlineData 포맷 변환
  - 기존 텍스트 전용 경로 100% 유지 (string content → 변환 없이 통과)
- `chat-view.tsx`:
  - `resizeImage()` 헬퍼 — Canvas로 최대 1024px / JPEG 0.82 품질 리사이즈
  - `handleImageFiles()` — FileList 처리, 최대 4장 제한
  - 📎 **Paperclip 버튼** — 클릭 시 파일 선택, 이미지 파일만 필터
  - **드래그 앤 드롭** — 채팅 전체 영역에 onDragOver/onDrop 핸들러
  - **이미지 미리보기 칩** — 전송 전 썸네일 + × 제거 버튼
  - 메시지 히스토리에 첨부 이미지 렌더링 (사용자 메시지 내 `msg.images`)
  - API 전송 시 이미지가 있으면 MultimodalPart 배열로 변환하여 전달

### 2. 대화 요약 (AI 자동 요약)
- `chat-view.tsx`에 `handleSummarize()` 함수 추가
  - 전체 메시지를 최대 400자씩 콘텐츠로 압축, 시스템 프롬프트로 "3~5 불릿 요약" 지시
  - 스트리밍으로 실시간 요약 생성
- **✨ 요약 모달** — 다크 오버레이 + 스크롤 가능 컨텐츠 영역
  - 생성 중 펄스 인디케이터
  - ReactMarkdown으로 마크다운 렌더링 (불릿 포인트 등)
  - ESC / 바깥 클릭 닫기, `aria-modal`, `role="dialog"` 접근성 속성
- **✨ 요약 버튼** — 입력창 상단 툴바에 `<Sparkles>` 아이콘 (2개 이상 메시지 있을 때 표시)

### 3. 시스템 프롬프트 라이브러리
- `settings-store.ts`:
  - `SystemPromptPreset` 인터페이스 추출 (export)
  - `systemPromptPresets: SystemPromptPreset[]` 상태 추가
  - `addSystemPromptPreset(name, content)` / `removeSystemPromptPreset(id)` 액션
  - `loadFromStorage` / `saveToStorage` 업데이트
- `settings-view.tsx`:
  - 시스템 프롬프트 textarea 하단에 **프리셋 라이브러리** 섹션 추가
  - "+ 현재 내용 저장" 버튼 → 인라인 이름 입력 폼 토글
  - Enter 저장 / ESC 취소 / 버튼 클릭 저장
  - 저장된 프리셋을 **클릭 가능한 칩**으로 표시 (클릭 시 textarea에 적용)
  - 각 칩 호버 시 × 삭제 버튼 표시
  - `aria-label` 접근성 속성 추가

### 4. Cmd+[ / Cmd+] — 채팅 이동 단축키
- `page.tsx`에 추가:
  - `Cmd+[`: chats 배열에서 현재 채팅의 이전 항목으로 이동
  - `Cmd+]`: 다음 항목으로 이동
  - 이동 시 자동으로 채팅 탭 전환

### 5. Cmd+Shift+T — 테마 토글
- `page.tsx`에 추가: dark ↔ light 즉시 전환
- `settingsStore.updateSettings` 호출 → ThemeProvider가 자동으로 `data-theme` 반영

### 6. 접근성 개선
- 요약 모달: `role="dialog"`, `aria-modal="true"`, `aria-label`
- 이미지 첨부/제거 버튼: `aria-label`
- 내보내기 버튼: `aria-label`
- 시스템 프롬프트 프리셋 버튼: 각각 `aria-label`
- 단축키 목록 업데이트 (`keyboard-shortcuts.tsx`):
  - ⌘[, ⌘], ⌘⇧T 추가
  - 설명 문구 정리

## 빌드 결과

```
✓ TypeScript check passed (tsc --noEmit)
✓ App renders correctly (screenshot verified)
✓ Paperclip icon visible in chat input area
```

## Day 11 계획

1. **커스텀 모델 지원** — 설정에서 OpenAI 호환 API base URL 설정 (Ollama, OpenRouter 등)
2. **채팅 폴더** — 사이드바에서 채팅을 폴더로 묶어 정리
3. **프롬프트 → 채팅 시작** — 프롬프트 뷰에서 직접 채팅 시작 버튼
4. **코드 블록 파일명 표시** — ` ```js filename.js ` 형식 지원
5. **메시지 타임스탬프** — 호버 시 메시지 전송 시각 표시
6. **통계 개선** — 대시보드에 모델별 평균 응답 시간 추가
