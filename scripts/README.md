# scripts/ — 자동화 스크립트

## update-models.ts

3시간 cron(GitHub Actions)으로 5개 provider의 모델 카탈로그 갱신.

### 동작

1. 각 provider API 호출 → 사용 가능 모델 목록
2. dated-snapshot 필터 (alias 있을 때 skip)
3. 기존 META_OVERRIDES와 머지 → `available-models.generated.json`
4. 새 모델은 Gemini 2.5 Flash로 한국어/영어 description 자동 생성 (`generate-descriptions.ts`)
5. diff 있으면 git commit (workflow가 push)

### 추출 시 변경 필요

- 각 provider 키는 GitHub Secrets로
- 한국어 description prompt는 블렌드 톤 (다른 프로덕트는 교체)
- Gemini 모델 ID (`gemini-2.5-flash`) 동기화

## generate-descriptions.ts

`update-models.ts`가 새 모델 발견 시 호출. Gemini로 KO/EN 한 줄 설명 생성.

### 핵심 옵션
- `thinkingBudget: 0` — Gemini 2.5는 chain-of-thought 비활성 필수
- `maxOutputTokens: 2000` — 300이면 응답 잘림 (실제 발견)

## sync-models.ts

`available-models.generated.json` 동기화 보조 (legacy).

## 변경 이력

- 2026-04-25: 초기 README (꼬미)
