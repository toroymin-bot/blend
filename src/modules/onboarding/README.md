# Module: onboarding (BYOK 패턴)

> 신규 사용자가 처음 진입했을 때 보여주는 BYOK(Bring Your Own Key) 안내 + 키 입력 화면.

## 책임 (Single Responsibility)

이 모듈은 **사용자가 자신의 AI provider API 키를 입력하도록 유도**만 한다. 입력된 키 검증/저장은 `@/stores/api-key-store`가 담당.

## 외부 인터페이스

### Exports

- `D1OnboardingView` — 온보딩 컴포넌트 (default export)

### Props

```typescript
interface D1OnboardingViewProps {
  lang: 'ko' | 'en';
  onDone: () => void;  // 사용자가 "건너뛰기" 또는 "시작" 시 호출
}
```

### 트리거 패턴

`window.dispatchEvent(new CustomEvent('d1:open-onboarding'))` — 다른 모듈에서 이 이벤트로 onboarding 호출.

## 의존성

### 내부
- `@/stores/api-key-store` — 키 저장/조회
- `@/data/available-models` — provider 목록 표시

### 외부 (npm)
- `react` ^18

## Blend 특화 부분 (재사용 시 변경 필요)

- **카피**: "Blend는 모든 AI를..." 등 브랜드 종속 텍스트 (lang별 dictionary 분리됨)
- **5개 provider**: OpenAI / Anthropic / Google / DeepSeek / Groq — 다른 프로덕트는 다를 수 있음
- **이벤트 이름**: `d1:open-onboarding` — 다른 모듈은 다른 prefix 사용 권장
- **디자인 토큰**: `var(--d1-*)` — 사용 측에서 globals.css 변수 정의

## 재사용 시나리오

1. `src/modules/onboarding/` 복사 (또는 `@ai4min/byok-onboarding` npm 패키지로 분리)
2. `lang` prop을 사용 측 i18n 시스템과 연결
3. provider 목록을 사용 측 카탈로그로 교체
4. 디자인 토큰(`--d1-*`)을 사용 측 토큰으로 매핑

## 알려진 제약

- 현재 5개 provider 하드코딩 (cron으로 갱신되는 카탈로그가 별도)
- 키 검증은 onboarding 안에서 안 함 (사용 후 첫 호출 시 401 에러로 발견)

## 변경 이력

- 2026-04-25: 초기 README (꼬미)
