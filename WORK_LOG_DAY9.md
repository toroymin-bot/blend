# Blend — Day 9 Work Log (2026-04-07)

## 완료 항목

### 1. Cmd+R / Cmd+E 단축키 완성
- `chat-view.tsx`에 글로벌 키이벤트 핸들러 추가
- **Cmd+R**: 마지막 AI 응답을 재생성 (`handleRegenerateLast`)
  - 마지막 어시스턴트 메시지 찾아 제거 → 동일 컨텍스트로 재스트리밍
- **Cmd+E**: 마지막 사용자 메시지 인라인 편집 모드 진입 (`handleEditLast`)
- **/** (슬래시): 입력창 즉시 포커스 (입력 중이 아닐 때)

### 2. 검색 하이라이트 인라인 개선
- `highlightText(text, query)` 헬퍼 함수 추가 — 정규식 분할 + `<mark>` 감싸기
- 사용자 메시지(`<p>`)에서 검색어에 해당하는 텍스트를 **노란 배경 span**으로 인라인 강조
- 어시스턴트 메시지는 기존 ring 테두리 강조 유지 (ReactMarkdown 파서 제약)
- 검색 쿼리 없을 때는 원본 텍스트 그대로 렌더링 (성능 최적화)

### 3. Cmd+K 사이드바 검색 실제 구현
- **이전**: Cmd+K → 채팅 탭 이동만 (검색창 포커스 없음)
- **이후**: Cmd+K → 채팅 탭 이동 + `blend:focus-sidebar-search` 커스텀 이벤트 발송
- `sidebar.tsx`에서 이벤트 리스닝 → 사이드바 펼치기 + 검색 input 자동 포커스
- 검색 input에 `ESC` 키 핸들러 추가 (쿼리 클리어 + 포커스 해제)
- 이벤트 버스 방식으로 prop drilling 없이 깔끔하게 구현

### 4. 모델 비교 뷰 — 성능 지표 시각화
- `model-compare-view.tsx`: 모든 응답 완료 시 상단에 **3종 막대 그래프** 자동 표시
  - 🔵 **응답 시간** 비교 (초, `Clock` 아이콘)
  - 🟢 **비용** 비교 (달러, `DollarSign` 아이콘)
  - 🟣 **출력 토큰** 비교 (`Zap` 아이콘)
- 각 바는 최댓값 기준 상대적 길이 (0~100%)로 표시
- CSS transition 700ms로 부드럽게 채워짐
- 비용 / 토큰 섹션은 해당 데이터가 있을 때만 표시

### 5. 모바일 터치 스크롤 시 검색 패널 숨김
- `chat-view.tsx` 메시지 컨테이너에 `onTouchMove` 핸들러 추가
- 검색 패널이 열린 상태에서 터치 스크롤 시 자동으로 패널 닫힘 (쿼리 초기화 포함)
- 모바일 화면에서 검색 패널이 메시지 영역을 가리는 문제 해소

### 6. PWA Manifest + 앱 아이콘
- `public/manifest.json` 신규 생성
  - `display: "standalone"` — 홈 화면 추가 시 앱처럼 실행
  - `theme_color: "#0f1117"` — 다크 배경 (기본 테마와 통일)
  - `background_color: "#0f1117"`
- `public/icon.svg` 신규 생성 — 파란→보라 그라디언트 배경 + 흰색 **B** 글자
- `public/icon-maskable.svg` 신규 생성 — 안드로이드 adaptive icon용 (full-bleed 배경)
- `layout.tsx` 메타데이터 업데이트:
  - `manifest: "/manifest.json"`
  - Apple Web App 메타 (`capable`, `statusBarStyle: black-translucent`, `title: Blend`)
  - `mobile-web-app-capable: yes`
  - `theme-color: #0f1117`

## 이슈 및 해결

| 이슈 | 해결 |
|------|------|
| Turbopack 에러 로그가 stale한 과거 로그를 계속 표시 | TSC pass + 스크린샷으로 실제 렌더링 정상 확인 |
| `handleRegenerateLast`에서 `streamAIResponse` 순서 문제 | 동일 스코프 내 클로저 참조 — 호출 시점에 이미 바인딩 완료, 문제 없음 |

## 빌드 결과

```
✓ TypeScript check passed (tsc --noEmit)
✓ App renders correctly (screenshot verified)
```

## Day 10 계획

1. **대화 요약 기능** — 긴 채팅을 AI로 자동 요약하는 버튼 (채팅 액션 메뉴)
2. **시스템 프롬프트 라이브러리** — 자주 쓰는 시스템 프롬프트 저장 및 원클릭 적용
3. **멀티모달 이미지 입력** — 이미지 파일을 채팅창에 드래그 앤 드롭 후 AI에게 전송
4. **Cmd+[ / Cmd+]** — 이전/다음 채팅 이동 단축키
5. **다크/라이트 토글 단축키** — Cmd+Shift+T
6. **접근성 개선** — aria-label 및 키보드 포커스 트랩 (모달)
