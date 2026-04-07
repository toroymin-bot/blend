# Blend — Day 8 Work Log (2026-04-07)

## 완료 항목

### 1. 테마 토큰 전체 마이그레이션
- **대상 파일**: `settings-view.tsx`, `prompts-view.tsx`, `agents-view.tsx`, `chat-view.tsx`, `dashboard-view.tsx`, `page.tsx`
- Tailwind 하드코딩 클래스(`bg-gray-900`, `text-white`, `text-gray-400`, `border-gray-700` 등)를 디자인 토큰 클래스(`bg-surface`, `bg-surface-2`, `text-on-surface`, `text-on-surface-muted`, `border-border-token`)로 교체
- `globals.css`의 `@theme inline` 블록에 이미 매핑된 CSS 변수 활용 (라이트/다크 모두 자동 적용)
- 기존 동작 100% 유지 — 인터랙티브 요소(버튼, 입력창) 하드코딩은 의도적으로 유지

### 2. 대화 내 메시지 검색 (Ctrl+F / Cmd+F)
- `chat-view.tsx`에 인라인 검색 패널 추가
- **단축키**: `Cmd+F` / `Ctrl+F` → 검색 패널 토글 + 자동 포커스
- **검색**: 입력 시 실시간 매칭 메시지 하이라이트
  - 현재 매치: `ring-2 ring-yellow-400` (노란 테두리)
  - 기타 매치: `ring-1 ring-yellow-600/50` (연한 노란 테두리)
- **이동**: `↑` `↓` 버튼 또는 `Enter` (다음) / `Shift+Enter` (이전)
- **결과 카운터**: `X / N` 형식 표시
- **닫기**: `ESC` 또는 X 버튼
- `messageRefs` ref 맵으로 각 메시지 DOM 요소 추적 → `scrollIntoView` 자동 스크롤

### 3. 대시보드 차트 개선
- **SVG 바 차트** (`SVGBarChart`): 순수 SVG로 구현
  - 최근 7일 + 최근 14일 두 개 섹션
  - Y축 눈금선 + 레이블 (비용 표시)
  - X축 날짜 레이블 (MM-DD)
  - 요청 수를 막대 상단에 표시
- **SVG 도넛 파이차트** (`SVGPieChart`): 순수 SVG로 구현
  - 프로바이더별 비용 비율 시각화
  - 중앙에 총 비용 표시
  - 옆에 범례 (비율 % 포함)
- 외부 차트 라이브러리 미사용 (100% SVG)
- 테마 토큰 클래스 적용 (라이트 모드 자동 대응)

### 4. 키보드 단축키 확장
- `keyboard-shortcuts.tsx` 업데이트:
  - `metaOrCtrl` 옵션 추가 (크로스 플랫폼 Cmd/Ctrl 지원)
  - `ShortcutHelpModal` 컴포넌트 신규 추가
  - `SHORTCUT_LIST` 업데이트 (새 단축키 추가)
- `page.tsx`에 신규 단축키 등록:
  - `Cmd+Shift+F`: 채팅 탭 이동 + (chat-view가 Cmd+F 처리)
  - `?`: 단축키 도움말 모달 표시
- `ShortcutHelpModal`: ESC / 바깥 클릭으로 닫기, 전체 단축키 목록 표시
- 참고: `Cmd+R` (재생성), `Cmd+E` (편집) 은 chat-view 내부에서 기존 버튼으로 처리 가능하므로 Day 9로 이관

## 이슈 및 해결

| 이슈 | 해결 |
|------|------|
| `chat` 변수 선언 전에 `useCallback`에서 참조 → TypeScript 오류 | `searchMatches`와 관련 effects를 `chat = getCurrentChat()` 선언 이후로 이동 |
| `ChevronDown`이 이미 import에 있어 `ChevronDownIcon` alias 충돌 없이 추가 | 새 import alias `ChevronDownIcon`, `XIcon` 사용 |

## 빌드 결과

```
✓ Compiled successfully in 1126ms
✓ TypeScript check passed
✓ Static pages generated (7/7)
```

## Day 9 계획

1. **Cmd+R / Cmd+E 단축키 완성** — chat-view 내부에서 마지막 메시지 대상으로 키 이벤트 직접 처리
2. **검색 하이라이트 개선** — 메시지 텍스트 내 키워드 인라인 하이라이트 (노란 배경 span)
3. **사이드바 대화 목록 검색** — Cmd+K 기능 실제 구현 (현재는 탭 이동만)
4. **모델 비교 뷰 개선** — `model-compare-view.tsx` SVG 차트 적용
5. **모바일 UX 개선** — 터치 스크롤 중 검색 패널 숨김 처리
6. **PWA manifest 아이콘** — 앱 아이콘 및 splash screen 추가
