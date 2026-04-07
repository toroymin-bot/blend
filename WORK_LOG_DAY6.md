# WORK_LOG_DAY6.md — Blend 개발 일지

날짜: 2026-04-07

---

## 구현 내용

### 1. 라이트 모드 UI 완성 (`src/app/globals.css`)

- `globals.css`에 `[data-theme="light"]` 셀렉터를 이용한 CSS 오버라이드 블록 추가
- 대상 클래스: `bg-gray-900/800/700/600`, `text-white/gray-*`, `border-gray-*`, hover 상태, placeholder
- prose(마크다운) 영역, 스크롤바, 코드 블록도 라이트 모드용 색상 적용
- 기존 컴포넌트 수정 없이 CSS 레이어에서만 처리 → 기존 다크 동작 유지

### 2. 채팅 검색 강화 (`src/modules/ui/sidebar.tsx`)

- 날짜 필터 버튼 추가: **오늘 / 이번 주 / 이번 달** (토글 방식, 다시 클릭하면 해제)
- `dateFilter` state와 `useMemo` 안에서 `updatedAt` 기준으로 필터링
- 검색어 입력 시 매칭된 메시지 미리보기 표시: 매칭 위치 ±10자 스니펫 (최대 60자) + `…`
- 기존 태그 필터·메시지 내용 전문 검색과 조합 가능

### 3. 프롬프트 가져오기 (`src/modules/prompts/prompts-view.tsx`)

- 프롬프트 라이브러리 헤더에 **"가져오기"** 버튼 추가
- `<input type="file" accept=".json,.csv">` 로 파일 선택 (숨김 input + ref)
- **JSON**: `[{title, content, tags}]` 배열 파싱
- **CSV**: 첫 행 헤더(`title,content,tags`), 이후 행 파싱 (따옴표 포함 필드 처리)
- 중복 제목 자동 건너뜀 (같은 파일 재가져오기 안전)
- 결과 토스트: "N개 추가됨, M개 중복 건너뜀" — 4초 후 자동 사라짐

### 4. 비용 알림

- **`src/types/index.ts`**: `AppSettings`에 `dailyCostLimit: number` 필드 추가 (기본값 1.0)
- **`src/stores/settings-store.ts`**: `DEFAULT_SETTINGS`에 `dailyCostLimit: 1.0` 추가
- **`src/stores/usage-store.ts`**: `checkDailyLimit(limit)`, `resetDailyAlert()`, `dailyLimitAlerted` 상태 추가
- **`src/modules/ui/cost-alert-toast.tsx`** (신규): 황색 경고 배너, 6초 자동 사라짐, X 버튼으로 수동 닫기; 자정에 `dailyLimitAlerted` 초기화
- **`src/app/theme-provider.tsx`**: `<CostAlertToast />` 앱 전역 마운트
- **`src/modules/settings/settings-view.tsx`**: "비용 알림" 섹션 추가 — 일일 한도(USD) 입력 필드, 0이면 비활성화 표시

---

## 빌드 결과

```
✓ Compiled successfully in 1170ms
✓ TypeScript 오류 없음
✓ Static/Dynamic 페이지 정상 생성
```

---

## 이슈 및 결정 사항

- **라이트 모드**: Tailwind 하드코딩 클래스를 `!important` CSS 오버라이드로 처리. 완전한 해결책은 tailwind.config에서 CSS 변수 기반 테마 토큰 도입이지만, 현재 구조에서는 CSS 오버라이드가 파급 범위 최소화에 유리
- **CSV 파싱**: 라이브러리 없이 `String.prototype.match` 기반 간이 파서 사용. RFC 4180 완전 준수는 아니지만 일반적인 내보내기 형식 처리 가능
- **비용 알림**: 같은 세션 내 중복 알림 방지를 위해 `dailyLimitAlerted` 플래그 사용; 자정 타이머로 리셋

---

## Day 7 계획 (우선순위 순)

1. **Tailwind CSS 변수 기반 테마 전환** — `tailwind.config.ts` 도입, `bg-primary`/`text-primary` 커스텀 색상 토큰으로 컴포넌트 점진적 마이그레이션
2. **메시지 편집 & 재생성** — 사용자 메시지 인라인 편집 후 그 이후 대화 재생성
3. **채팅 폴더 UI** — 사이드바에서 폴더 생성/이동 drag-and-drop
4. **스트리밍 토큰 카운터** — 응답 중 실시간 토큰/비용 표시
5. **프롬프트 내보내기** — 현재 프롬프트 목록을 JSON/CSV로 다운로드
