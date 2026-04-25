# Stores (Zustand)

D1 라우트 + legacy 라우트가 공유하는 client-side 상태.

## 추출 우선순위

| 모듈 | 추출 후보 npm 이름 | Tier | 비고 |
|---|---|---|---|
| `api-key-store.ts` | `@ai4min/api-key-store` | S | BYOK 핵심. Trial은 별도 |
| `trial-store.ts` | `@ai4min/trial-store` | A | Gemini trial 카운터 (10회/일) |
| `d1-chat-store.ts` | `@ai4min/chat-store` | A | localStorage persist |
| `usage-store.ts` | `@ai4min/usage-analytics-store` | S | 사용량/비용 추적 |
| `agent-store.ts` | `@ai4min/agent-store` | A | 에이전트 + 자동 매칭 |
| `document-store.ts` | `@ai4min/rag-document-store` | A | IndexedDB |
| `datasource-store.ts` | (블렌드 전용) | C | OAuth 통합 |

## api-key-store.ts

### Public API
```typescript
useAPIKeyStore((s) => s.keys)               // Record<AIProvider, string>
useAPIKeyStore((s) => s.getKey(provider))   // string
useAPIKeyStore((s) => s.hasKey(provider))   // boolean
useAPIKeyStore((s) => s.setKey)             // (provider, key) => void
useAPIKeyStore((s) => s.loadFromStorage)    // 마운트 시 호출
```

### Storage
- localStorage `blend:api-keys` — 평문 JSON (BYOK 정책)
- env fallback 제거됨 (IMP-011, 2026-04-25)
- Trial 키만 별도: `NEXT_PUBLIC_BLEND_TRIAL_GEMINI_KEY` (`@/modules/chat/trial-gemini-client`)

### Blend 특화
- 5 providers 하드코딩 (OpenAI/Anthropic/Google/DeepSeek/Groq + custom)
- 다른 프로덕트는 provider enum 교체 필요

## usage-store.ts

각 AI 호출 시 `addRecord()` 호출 → 90일 자동 정리. localStorage QuotaExceededError catch + trim 50% retry (BUG-005, 2026-04-25).

### Public API
- `addRecord({ timestamp, model, provider, inputTokens, outputTokens, cost, chatId })`
- `getThisMonthCost()`, `getCostByDay(days)`, `getCostByModel()`, `getCostByProvider()`
- `checkDailyLimit(limit)`

## d1-chat-store.ts

`useD1ChatStore` — design1 전용 (메인 `useChatStore`와 분리). localStorage `d1:chats` persist.

### Public API
- `chats: D1Chat[]`
- `upsertChat(chat)`, `deleteChat(id)`, `loadFromStorage(force?)`

## 변경 이력

- 2026-04-25: 초기 README (꼬미)
