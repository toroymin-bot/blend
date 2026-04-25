# Module: chat (D1 Chat View)

> 멀티 프로바이더 AI 채팅 인터페이스. BYOK + 자동 매칭 + 트라이얼.

## 책임

사용자 입력을 AI provider로 라우팅하고 스트리밍 응답을 렌더한다. 메시지 히스토리는 `@/stores/d1-chat-store`가 관리.

## Exports

- `D1ChatView` (default) — 채팅 메인 화면

### Props

```typescript
interface D1ChatViewProps {
  lang: 'ko' | 'en';
  initialModel?: string;     // pre-select model (Compare에서 "채팅으로 이어가기")
  onConversationStart?: (title: string) => void;  // 첫 메시지 후 sidebar history 추가용
}
```

## 의존성

### 내부
- `@/stores/api-key-store` — provider 키 조회
- `@/stores/d1-chat-store` — 채팅 persist
- `@/stores/agent-store` — 활성 에이전트
- `@/stores/trial-store` — Gemini trial counter
- `@/data/available-models` — 모델 카탈로그
- `@/modules/chat/chat-api` — 스트리밍 fetch
- `@/modules/chat/trial-gemini-client` — Gemini SSE 직접 호출
- `@/modules/chat/history-overlay-design1` — Cmd+K 검색
- `@/modules/chat/export-dropdown-design1` — md/txt/json/pdf 내보내기
- `@/lib/analytics` — 이벤트 추적

### 외부
- `react`, `react-markdown`, `remark-gfm`, `highlight.js`

## Blend 특화 부분

- **컨셉 카피**: "무엇을 도와드릴까요?", "하나로, 더 싸게, 더 스마트하게."
- **트라이얼 정책**: Gemini 2.5 Flash 10회/일 (env `NEXT_PUBLIC_BLEND_TRIAL_GEMINI_KEY`)
- **자동 매칭**: 'auto' 모델 + agent-store auto-match agent
- **5 providers 화이트리스트**: OpenAI / Anthropic / Google / DeepSeek / Groq
- **SUGGESTIONS 4개**: 이메일/이미지/코드리뷰/요약 (lang별 카피)
- **디자인 토큰**: `var(--d1-*)` — `src/design/d1-tokens.ts`

## 재사용 시나리오

1. `chat-view-design1.tsx` + `chat-api.ts` + `trial-gemini-client.ts` 복사
2. SUGGESTIONS·카피·트라이얼 정책을 사용 측 도메인에 맞게 교체
3. 의존하는 stores를 동일 패턴으로 재구현 (api-key, chat persist 등)
4. `getFeaturedModels` 카탈로그를 사용 측 자동 갱신 시스템과 연결

## 알려진 제약

- Single conversation only at a time (Compare는 별도 모듈)
- 첨부 파일은 image/pdf/text만 (xlsx 등은 Documents 모듈)
- 모바일 textarea 자동 height 조정 (`min-h-[88px] max-h-[240px]`)

## 변경 이력
- 2026-04-25: 초기 README (꼬미)
