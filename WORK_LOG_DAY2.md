# Blend Work Log - Day 2 (2026-04-07)

## 세션 요약

오늘 5시간 세션에서 4가지 주요 기능을 구현하고 빌드를 성공시켰습니다.

---

## 구현 완료

### 1. URL Reader 플러그인 실제 연동
- `src/stores/plugin-store.ts` 신규 생성: 플러그인 설치 상태 관리 (Zustand + localStorage)
- `plugins-view.tsx` 업데이트: url-reader, code-runner, chart-render를 `comingSoon: false`로 변경, 설치/제거 버튼 실제 동작
- `chat-view.tsx`에 URL 감지 로직 추가: 입력창에서 URL 자동 추출 → `/api/url-reader` API 호출 → AI 컨텍스트에 자동 포함
- URL 읽는 중 하단 인디케이터 표시 (도메인명 + 펄스 아이콘)
- 입력창 placeholder가 URL Reader 활성화 시 변경됨

### 2. 코드 실행 플러그인 (JavaScript 인라인 실행)
- `src/modules/plugins/code-runner.tsx` 신규 생성
- `sandbox="allow-scripts"` iframe 사용 → XSS 완전 격리
- console.log/error/warn/info 캡처 및 출력 표시
- 5초 타임아웃 안전 장치
- 실행/초기화/출력 토글 버튼
- `code-block.tsx` 업데이트: JS/TS 코드 블록에 자동으로 실행 버튼 추가 (code-runner 플러그인 설치 시)

### 3. 차트 생성 플러그인 (외부 라이브러리 없이 SVG)
- `src/modules/plugins/chart-render.tsx` 신규 생성
- 막대/선/원형 차트 순수 SVG로 구현 (Chart.js, Recharts 불필요)
- AI 응답에서 JSON 코드 블록 자동 감지 → 차트 렌더링
- 지원 JSON 포맷: `{labels, values}`, `{key: number}`, `[{name, value}]`
- 차트 타입 런타임 전환 (막대 ↔ 선 ↔ 원형)
- 차트 접기/펼치기 기능

### 4. 대화 제목 자동 생성
- `chat-view.tsx`에 `autoGenerateTitle()` 함수 추가
- 첫 번째 AI 응답 완료 후 별도 API 호출로 15자 이내 한국어 제목 생성
- 실패해도 기존 채팅에 영향 없음 (silent fail)
- `chat-store.ts`의 기존 `updateChatTitle()` 활용

---

## 수정 파일 목록

| 파일 | 변경 유형 |
|------|-----------|
| `src/stores/plugin-store.ts` | 신규 생성 |
| `src/modules/plugins/code-runner.tsx` | 신규 생성 |
| `src/modules/plugins/chart-render.tsx` | 신규 생성 |
| `src/modules/plugins/plugins-view.tsx` | 수정 |
| `src/modules/chat/chat-view.tsx` | 수정 |
| `src/modules/chat/code-block.tsx` | 수정 |
| `src/app/page.tsx` | 수정 |

---

## 빌드 결과

```
✓ Compiled successfully
✓ TypeScript type check passed
✓ Static pages generated (5/5)
Route: / (static), /api/url-reader (dynamic)
```

---

## 이슈 및 참고

- `autoGenerateTitle`에서 `getKey()` 반환값이 `string | null`이므로 `?? ''` 처리 필요 (TypeScript strict)
- 차트 감지는 AI 응답의 첫 번째 JSON 코드 블록만 분석함 (여러 블록 시 첫 것만)
- 코드 실행은 JS/TS 계열만 지원 (Python 등은 "준비 중")
- URL Reader: 표시용 메시지는 원본 입력 그대로, API에만 URL 컨텍스트 포함

---

## 내일 계획 (Day 3)

1. **웹 검색 플러그인**: SerpAPI 또는 Brave Search API 연동
2. **이미지 생성 플러그인**: OpenAI DALL-E 3 연동
3. **채팅 내보내기 개선**: PDF 내보내기 추가
4. **모바일 UX 개선**: 스와이프 제스처, 하단 탭바
5. **다국어 지원**: i18n 설정 (ko/en 전환)
