---
name: nighttask-country-detection-billing
description: 국가 감지 + 결제 탭 강조 + 이중 통화 표시 + Excel 기록
---


## 오늘(2026-04-19 새벽) 해야 할 작업

### 1. 국가 감지 훅 추가
`src/lib/use-country.ts` 파일 새로 생성:
- 앱 로드 시 `https://ipapi.co/country/` 호출 → 국가 코드(KR/PH/기타) 저장
- localStorage에 캐시 (24시간) — 매번 API 호출 방지
- 반환: `{ country: 'KR' | 'PH' | string, loading: boolean }`

### 2. billing-view.tsx 수정
**결제 탭 이름 변경 (locale 기반):**
- Paddle → 한국어: "카드", 영어: "Card"
- Toss → 한국어: "토스 간편결제", 영어: "Toss Pay"
- Xendit → 한국어: "Xendit 간편결제", 영어: "Xendit Pay"

**국가별 탭 강조:**
- KR 접속: "카드"(Paddle)와 "토스 간편결제"(Toss) 탭에 "추천" 뱃지 또는 강조 테두리 표시
- PH 접속: "Xendit 간편결제"(Xendit) 탭에 강조 표시
- 기타 국가: Paddle(카드) 탭만 강조
- 강조 표시와 무관하게 모든 탭은 클릭해서 결제 가능해야 함

**locale 키 추가 (ko.json, en.json):**
```
"billing.tab_card": "카드" / "Card"
"billing.tab_toss": "토스 간편결제" / "Toss Pay"
"billing.tab_xendit": "Xendit 간편결제" / "Xendit Pay"
"billing.tab_recommended": "추천" / "Recommended"
```

### 3. 이중 통화 표시
환율 기준값 (고정, 파일 상단 상수로 정의):
- $1 = ₩1,380 (KRW)
- $1 = ₱56 (PHP)

적용할 3곳:
1. `billing-view.tsx` — 플랜 가격 ($9 → KR: "$9 (₩12,420)", PH: "$9 (₱504)")
2. `cost-savings-dashboard.tsx` — 개별 구독료 합계, Blend 예상 비용, 절약액
3. `dashboard-view.tsx` — 오늘 비용, 이번달, 총 누적 비용 카드

국가 감지가 로딩 중일 때는 달러만 표시. 기타 국가도 달러만 표시.

함수 예시:
```ts
function formatDual(usd: number, country: string): string {
  if (country === 'KR') return `$${Math.round(usd)} (₩${Math.round(usd * 1380).toLocaleString()})`;
  if (country === 'PH') return `$${Math.round(usd)} (₱${Math.round(usd * 56).toLocaleString()})`;
  return `$${Math.round(usd)}`;
}
```

### 4. 모델 비교 뷰 모바일 레이아웃 수정

**파일:** `src/modules/models/model-compare-view.tsx`

**문제:** 모바일에서 Results grid(`grid-cols-3`)가 세로로 쌓임.

**수정 내용:**

1. **Results grid (line 377) — grid → 가로 스크롤 flex로 변경:**
```tsx
// 변경 전:
<div className={`grid gap-4 ${results.length === 1 ? 'grid-cols-1' : results.length === 2 ? 'grid-cols-2' : results.length === 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>

// 변경 후:
<div className="flex gap-4 overflow-x-auto pb-2">
```

2. **각 결과 카드 (line 379) — 최소 너비 고정:**
```tsx
// 변경 전:
<div key={result.modelId} className="bg-gray-800 rounded-xl p-4 flex flex-col">

// 변경 후:
<div key={result.modelId} className="bg-gray-800 rounded-xl p-4 flex flex-col min-w-[260px] w-[260px] flex-shrink-0">
```

3. **카드 내 텍스트 영역 (line 397) — 10줄 높이 + 스크롤바 항상 표시:**
```tsx
// 변경 전:
<div className="flex-1 overflow-y-auto max-h-96">

// 변경 후:
<div className="overflow-y-scroll h-[15rem]" style={{ scrollbarWidth: 'thin', scrollbarColor: '#4b5563 transparent' }}>
```

**결과:** 모바일에서 카드들이 가로로 나열되고 좌우 스와이프로 탐색 가능. 각 카드는 약 10줄 높이 고정, 초과 텍스트는 카드 내 세로 스크롤바로 확인 가능.

### 5. 모든 페이지 통화 소수점 제거 (Math.round)

**규칙:** 달러 금액은 전부 `Math.round()` → 소수점 없이 정수로 표시

**대상 파일 및 수정 내용:**

`dashboard-view.tsx`:
- 오늘 비용 카드: `todayCost.toFixed(4)` → `Math.round(todayCost)`
- 이번 달 카드: `monthCost.toFixed(4)` → `Math.round(monthCost)`
- 총 누적 비용 카드: `totalCost.toFixed(4)` → `Math.round(totalCost)`
- 도넛 차트 합계: `total.toFixed(3)` → `Math.round(total)`
- 모델별 비용 목록: `s.value.toFixed(4)` → `Math.round(s.value)`
- 일별 비용 바 차트: `d.cost.toFixed(4)` → `Math.round(d.cost)`
- 비용 범례 val: `val.toFixed(val < 0.01 ? 5 : val < 0.1 ? 4 : 3)` → `Math.round(val)`

`chat-view.tsx`:
- 메시지별 비용: `msg.cost.toFixed(4)` → `Math.round(msg.cost)`
- 일일 한도 초과 메시지: `settings.dailyCostLimit.toFixed(2)` → `Math.round(settings.dailyCostLimit)`, `getTodayCost().toFixed(4)` → `Math.round(getTodayCost())`
- 스트림 토큰 비용: `(streamTokenCount * 0.000003).toFixed(6)` → `Math.round(streamTokenCount * 0.000003)`

`cost-alert-toast.tsx`:
- `todayCost.toFixed(4)` → `Math.round(todayCost)`
- `limit.toFixed(2)` → `Math.round(limit)`

`settings-view.tsx`:
- `(settings.dailyCostLimit ?? 1).toFixed(2)` → `Math.round(settings.dailyCostLimit ?? 1)`

**참고:** cost-savings-dashboard.tsx는 2026-04-18에 이미 적용 완료. 나머지 파일만 수정할 것.

### 6. 모델 탭 "적용" 버튼 + 채팅 연동 [개선 IMP]

**파일:** `src/modules/models/models-view.tsx`, `src/components/app-content.tsx`

**요구사항:**
- 모델 선택 시 오른쪽에 노란색 "적용" 버튼 표시
- 클릭하면 채팅 탭으로 이동 + 선택한 모델 적용 + 자동 AI 매칭 OFF

**구현:**

1. `app-content.tsx` — ModelsView에 onApply 콜백 전달:
```tsx
// case 'models':
case 'models': return <ModelsView onApply={() => setActiveTab('chat')} />;
```

2. `models-view.tsx` — props 추가 및 적용 버튼 구현:
```tsx
// 함수 시그니처 변경:
export function ModelsView({ onApply }: { onApply?: () => void }) {
  const { selectedModel, setSelectedModel } = useChatStore();
  const { setActiveAgent } = useAgentStore(); // import 추가
  // ...

  // 각 모델 카드에 노란 적용 버튼 추가 (isSelected인 모델 카드 오른쪽):
  {isSelected && onApply && (
    <button
      onClick={(e) => {
        e.stopPropagation();
        setActiveAgent(null); // 자동 AI 매칭 OFF
        onApply();
      }}
      className="ml-auto px-3 py-1 bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-bold rounded-lg shrink-0"
    >
      적용
    </button>
  )}
```

- `setActiveAgent(null)` → 자동 AI 매칭 해제, 선택한 모델로 채팅
- `AUTO_MATCH_AGENT_ID` import 불필요 (null로 비우면 됨)
- import: `useAgentStore` from `@/stores/agent-store`

### 7. 모델 탭 ↔ 채팅 모델 수 불일치 수정 [버그 BUG]

**파일:** `src/modules/chat/chat-view.tsx`, `src/modules/models/models-view.tsx`

**현상:** 모델 탭에 보이는 모델 수 ≠ 채팅창 모델 드롭다운 모델 수

**조사 및 수정:**
- `models-view.tsx`: `[...DEFAULT_MODELS, ...customModels]` 전체 표시
- `chat-view.tsx`: 모델 드롭다운에서 필터링 조건 확인 (API 키 유무, provider 필터 등)
- 두 곳에서 동일한 `allModels` 목록을 표시하도록 통일
- 필터 로직이 다르면 동일하게 맞출 것

**Excel 기록:**
이 두 항목은 아래 Excel 기록 목록에 추가. 유형 분류:
- IMP (개선): 모델 탭 적용 버튼 + 채팅 연동
- BUG (버그): 모델 탭 ↔ 채팅 모델 수 불일치

### 8. [IMP] Lifetime Plan — $29 one-time payment

**File:** `src/modules/ui/billing-view.tsx`, `src/locales/ko.json`, `src/locales/en.json`

**Add new plan to PLANS array (after Pro):**
```tsx
{
  id: 'lifetime',
  name: 'Lifetime',
  price: { monthly: 29, yearly: 29 }, // fixed, no toggle
  descKey: 'billing.lifetime_desc',   // "한 번 결제로 평생 사용"
  badge: 'billing.lifetime_badge',    // "평생 회원"
  features: [
    { text: 'Everything in Pro' },
    { text: 'All future updates' },
    { text: 'Unlimited messages' },
    { text: 'All AI models' },
    { text: 'Voice chat',       accent: true },
    { text: 'Image generation', accent: true },
    { text: 'Meeting analysis', accent: true },
    { text: 'Priority support' },
  ],
  ctaKey: 'billing.lifetime_cta',    // "평생 회원 가입"
  highlighted: false,
  isLifetime: true,
},
```

**UI changes:**
- Plan cards grid: change to `grid-cols-1 md:grid-cols-3`
- Lifetime card: show `$29` with "one-time" label instead of "/월"
  - `<span className="text-gray-400 text-sm ml-1">one-time</span>`
- Add gold badge at top: `"Lifetime"` — `bg-amber-500 text-black font-bold`
- Monthly/Yearly toggle: hide price change for lifetime card (always $29)
- Hide the toggle badge ("Save X%") for lifetime card

**Lifetime card border — gold gradient (distinct from Pro's blue):**
```tsx
// Wrap the lifetime card div with gradient border technique:
<div className="p-[1px] rounded-2xl bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-600 shadow-[0_0_24px_rgba(251,191,36,0.2)]">
  <div className="bg-gray-900 rounded-2xl p-7 flex flex-col h-full">
    {/* card content */}
  </div>
</div>
```
- Pro card: blue ring (`border-blue-500 ring-2 ring-blue-500/30`)
- Lifetime card: gold gradient border + soft amber glow
- Free card: plain gray border (unchanged)

**Payment:**
- Paddle: use `NEXT_PUBLIC_PADDLE_LIFETIME_PRICE_ID` env var (one-time product, not subscription)
- Toss: `amount: 29 * 1000 = 29000`, `orderName: 'Blend Lifetime'`
- Xendit: `amount: 29 * 56 = 1624 PHP`, `description: 'Blend Lifetime'`

**"Buy once, use forever" emphasis — "평생" appears exactly TWICE, in the most prominent positions:**
- 1st (card subtitle, large/visible): `"단 한 번 결제, 평생 사용"` / `"Pay once. Yours forever."`
- 2nd (CTA button, full-width): `"평생 이용 시작하기 — $29"` / `"Get Lifetime Access — $29"`
- Under $29 price (no "평생", supporting text): `"✓ 월정액 없음 · 갱신 없음 · 영구 소유"` / `"✓ No subscription · No renewal · Permanently yours"`
- Below CTA (no "평생", tiny muted): `"한 번 결제 후 모든 기능 즉시 활성화"` / `"All features unlocked instantly after purchase"`

**Locale keys to add (ko.json + en.json):**
```
"billing.lifetime_desc": "단 한 번 결제, 평생 사용" / "Pay once. Yours forever."
"billing.lifetime_badge": "Lifetime"
"billing.lifetime_oneshot": "월정액 없음 · 갱신 없음 · 영구 소유" / "No subscription · No renewal · Permanently yours"
"billing.lifetime_cta": "평생 이용 시작하기 — $29" / "Get Lifetime Access — $29"
"billing.lifetime_after": "한 번 결제 후 모든 기능 즉시 활성화" / "All features unlocked instantly after purchase"
```

**Excel entry:**
`17. [IMP] billing-view.tsx — Add Lifetime plan ($29 one-time, permanent access)`

### 9. [IMP] BYOK Notice — 3 locations + style fix

**Additional fix on billing page BYOK notice:**
Current text is too small. Make it same size as "결제 수단" heading + gold color:
```tsx
// Change from:
<p className="text-xs text-gray-500 text-center mb-6">
  🔑 Blend는 내 API 키로 직접 연결해요...
</p>

// Change to:
<p className="text-base font-semibold text-amber-400 text-center mb-6">
  🔑 Blend는 내 API 키로 직접 연결해요. API 비용은 각 서비스에 별도 청구되며, 평균 월 $5 수준이에요.
</p>
```

### 10. [IMP] Settings — "About Blend" service introduction section

**File:** `src/modules/settings/settings-view.tsx`

Add a new section at the top of Settings (before other sections):
- Title: "Blend 소개" / "About Blend"
- Content: Clear explanation of what Blend is, no misunderstanding
```
• Blend는 여러 AI 모델을 하나의 앱에서 사용할 수 있는 서비스예요.
• 본인의 API 키를 직접 연결하는 BYOK(Bring Your Own Key) 방식이에요.
• AI 사용 비용은 OpenAI, Anthropic 등 각 서비스에 직접 청구됩니다.
• Blend 구독료($9/월 또는 $29 평생)는 앱 기능 이용료예요.
• 평균 API 비용은 월 $5 수준이며 사용량에 따라 달라져요.
```
Style: soft info card, `bg-blue-900/20 border border-blue-800/30 rounded-xl p-4`

Add locale keys for ko/en.

### 11. [IMP] Billing FAQ — Add subscription benefits Q&A

**File:** `src/modules/ui/billing-view.tsx`, `src/locales/ko.json`, `src/locales/en.json`

Add new FAQ item to FAQ_KEYS array:
```tsx
{ q: 'billing.faq_benefits_q', a: 'billing.faq_benefits_a' }
```

Locale content:
```
Q (ko): "서비스 구독 시 좋은 점은 무엇인가요?"
A (ko): "Blend 구독 시 모든 AI 모델(GPT, Claude, Gemini 등)을 하나의 앱에서 자유롭게 사용할 수 있어요. 보이스챗, 이미지 생성, 회의 분석 등 프리미엄 기능도 포함돼요. 각 AI 서비스를 따로 구독하면 월 $90 이상이지만, Blend는 실제 쓴 만큼만 API 비용을 내는 구조라 훨씬 합리적이에요."

Q (en): "What are the benefits of subscribing?"
A (en): "With a Blend subscription, you get access to all AI models (GPT, Claude, Gemini, and more) in one app. Premium features like voice chat, image generation, and meeting analysis are all included. Instead of paying $90+/month for separate subscriptions, you only pay for what you actually use — making Blend a much smarter choice."
```

### 14. [IMP] Model registry — Cleanup + 10-char descriptions

**File:** `src/modules/models/model-registry.ts`
Also applies to: chat model dropdown + models-view.tsx (model management menu)

**Rule 1 — Remove dated snapshot versions if non-dated exists:**
- If both "GPT 5 Pro" and "GPT 5 Pro 2025 10 06" exist → remove the dated one
- Keep the dated version ONLY if it's the only version of that model
- Set `enabled: false` on dated duplicates (don't delete, just disable)

**Rule 2 — Per model family, max 2 versions visible:**
- Same base name with different version numbers = same family
- Example: Gemma 3 1B / 4B / 12B / 27B / 3n E4B / 3n E2B → keep only 2 most recently added
- GPT 3.5 Turbo (multiple dated) → keep max 2
- Set `enabled: false` on excess older versions

**Rule 3 — Rewrite ALL descriptions (10 chars max in Korean, use-case focused):**
No "최신", "최강", "최고급", "가장 강력" — only what the model is GOOD FOR.

```
// OpenAI
GPT-4.1:           ko: "코딩·분석용"      en: "Coding & analysis"
GPT-4.1 Mini:      ko: "일상 대화용"      en: "Everyday chat"
GPT-4.1 Nano:      ko: "초경량 대화용"    en: "Ultra-light chat"
GPT-4o:            ko: "이미지·텍스트용"  en: "Image + text tasks"
GPT-4o Mini:       ko: "빠른 일상용"      en: "Fast everyday use"
o3:                ko: "수학·논리용"      en: "Math & logic"
o4-mini:           ko: "추론·분석용"      en: "Reasoning tasks"
o1 Pro:            ko: "고난도 문제용"    en: "Hard problem solving"
GPT 5:             ko: "글·코딩 범용"     en: "Writing & coding"
GPT 5 Pro:         ko: "복잡한 작업용"    en: "Complex tasks"
GPT 5 Mini:        ko: "빠른 범용"        en: "Fast general use"
GPT 5 Codex:       ko: "코딩 전용"        en: "Coding only"
GPT Image 1:       ko: "이미지 생성용"    en: "Image generation"
DALL-E 3:          ko: "이미지 생성용"    en: "Image generation"
GPT-3.5 Turbo:     ko: "단순 질문용"      en: "Simple Q&A"

// Anthropic
Claude Opus 4.7:   ko: "심층 분석용"      en: "Deep analysis"
Claude Opus 4.6:   ko: "심층 분석용"      en: "Deep analysis"
Claude Sonnet 4.6: ko: "코딩·작업용"      en: "Coding & tasks"
Claude Haiku 4.5:  ko: "빠른 답변용"      en: "Quick answers"
Claude 3.5 Sonnet: ko: "안정적 작업용"    en: "Stable tasks"
Claude 3 Haiku:    ko: "초저가 대화용"    en: "Budget chat"

// Google
Gemini 2.5 Pro:    ko: "대용량 처리용"    en: "Large doc processing"
Gemini 2.5 Flash:  ko: "빠른 범용"        en: "Fast general use"
Gemini 2.0 Flash:  ko: "일상 작업용"      en: "Everyday tasks"
Gemma 3 27B:       ko: "오픈소스 대형"    en: "Open-source large"
Gemma 3 12B:       ko: "오픈소스 중형"    en: "Open-source mid"
Gemma 4:           ko: "오픈소스 4세대"   en: "Open-source gen4"

// Others
DeepSeek-V3:       ko: "저가 코딩용"      en: "Budget coding"
DeepSeek-R1:       ko: "수학·논리용"      en: "Math & reasoning"
Llama 3.3 70B:     ko: "오픈소스 범용"    en: "Open-source general"
Llama 3.1 8B:      ko: "초고속 경량용"    en: "Ultra-fast lite"
Mixtral 8x7B:      ko: "다국어·코딩용"    en: "Multilingual & code"
```

**Excel entry:**
`22. [IMP] model-registry.ts — Remove dated duplicates, limit 2 per family, rewrite all descriptions (10 chars, use-case focused)`

### 15. [BUG/IMP] Chat toolbar — Mobile dropdown for action buttons

**File:** `src/modules/chat/chat-view.tsx`

**Problem:** On mobile, the bottom toolbar shows model selector + 요약 + 음성 + 내보내기 + etc. all in a row — text overflows vertically, labels become unreadable.

**Fix:** On mobile (`sm` breakpoint and below), collapse action buttons into a single `⋯` dropdown menu. Desktop layout unchanged.

**Implementation:**
```tsx
// Desktop (md+): show all buttons inline as-is (current behavior)
// Mobile: show model selector + single "⋯" more button

// Mobile toolbar layout:
<div className="flex items-center gap-2">
  {/* Model selector — always visible */}
  <ModelDropdown />

  {/* Desktop: show all action buttons */}
  <div className="hidden md:flex items-center gap-1">
    <SummaryButton />
    <VoiceButton />
    <ExportButton />
    {/* ...other buttons */}
  </div>

  {/* Mobile: collapse into ⋯ dropdown */}
  <div className="flex md:hidden relative" ref={mobileMenuRef}>
    <button
      onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
      className="px-2 py-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-white text-lg"
    >
      ···
    </button>
    {mobileMenuOpen && (
      <div className="absolute bottom-full right-0 mb-1 bg-gray-800 border border-gray-700 rounded-xl shadow-lg p-2 flex flex-col gap-1 min-w-[120px] z-50">
        <SummaryButton fullLabel />
        <VoiceButton fullLabel />
        <ExportButton fullLabel />
        {/* ...other buttons with labels */}
      </div>
    )}
  </div>
</div>
```

**Result:** Mobile shows clean: `[GPT-4.1 Mini ▾]  [···]`
Tapping `···` opens a tidy vertical dropdown with all actions labeled clearly.

**File:** `src/modules/ui/billing-view.tsx`

**Problem:** On mobile, clicking "Pro로 업그레이드" or "평생 이용 시작하기" shows no visible reaction — users think nothing happened.

**Fix:** Add a ref to the payment section and scroll to it when plan CTA buttons are clicked:
```tsx
// Add ref:
const paymentRef = useRef<HTMLDivElement>(null);

// Plan card CTA button onClick:
onClick={() => {
  paymentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}}

// Add ref to payment section div:
<div ref={paymentRef} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-8">
  <h3>결제 수단</h3>
  ...
</div>
```

This way tapping a plan button immediately scrolls to the payment section — users clearly see the next action.

**Goal:** Clearly communicate that Blend is a BYOK service and API costs are separate.

**Design principle:** Subtle but readable. No bold boxes or warning colors. Small, muted, natural — like a footnote. Users notice it without feeling pressured.

**Location 1 — billing-view.tsx (below plan cards):**
```tsx
// Subtle single line with a soft divider feel — no box, no border
<p className="text-xs text-gray-500 text-center mb-6">
  🔑 Blend는 내 API 키로 직접 연결해요. API 비용은 각 서비스에 별도 청구되며, 평균 월 $5 수준이에요.
</p>
```

**Location 2 — welcome-view.tsx (onboarding):**
```tsx
// Soft caption below the main tagline — same muted gray, small font
<p className="text-xs text-gray-500 mt-2">
  Bring Your Own Key — 비싼 구독료 대신, 쓴 만큼만 스마트하게
</p>
```

**Location 3 — settings-view.tsx (above API key inputs):**
```tsx
// Inline helper text style — blends into the UI naturally
<p className="text-xs text-gray-500 mb-2">
  입력한 API 키로 각 서비스에 직접 연결돼요. 비용은 해당 서비스에서 확인할 수 있어요.
</p>
```

**Common style rules:**
- Font size: `text-xs` (12px) — small but readable
- Color: `text-gray-500` — muted, not white, not alarming
- No background, no border, no icon emphasis
- Centered on billing page, left-aligned on settings

**Excel entry:**
`16. [IMP] BYOK notice added — billing page, welcome screen, API settings (3 locations)`

### 9. [IMP] API Usage Breakdown Panel in Dashboard

**File:** `src/modules/ui/dashboard-view.tsx`

**Goal:** Add a detailed usage breakdown panel (similar to Claude Code's context window breakdown) — simple rows with colored bar + percentage + value.

**Display 3 sections:**

1. **Cost by Model** — each model as a row with color bar + % of total spend
   - e.g. `● GPT-4.1   ████████░░  $0  62%`
   - e.g. `● Claude Sonnet  ████░░░░  $0  28%`

2. **Token breakdown** — Input vs Output tokens
   - e.g. `● Input tokens   ██████░░  45%  1.2k`
   - e.g. `● Output tokens  ████████  55%  1.5k`

3. **Usage by Provider** — grouped provider totals
   - e.g. `OpenAI  $0  70%`  /  `Anthropic  $0  20%`  /  `Google  $0  10%`

**Style:** Dark card, compact rows, colored dot per model/provider, thin progress bar, right-aligned % and value. No decimals (Math.round).

**Excel entry:**
`15. [IMP] dashboard-view.tsx — Add API usage breakdown panel (cost by model, token ratio, provider totals)`

### 16. [BUG] $0 API Cost Bug — Root Cause Investigation + Transparent Cost Display

**Files to investigate first:**
- `src/modules/chat/chat-view.tsx` — where `addRecord()` is called (lines ~409 and ~814)
- `src/stores/usage-store.ts` — `addRecord()`, `getThisMonthCost()`, `loadFromStorage()`
- `src/app/api/chat/route.ts` (or equivalent streaming API handler) — where usage tokens are returned
- `src/modules/models/model-registry.ts` — `calculateCost()` function

**Known root cause candidates:**

1. **`addRecord()` only fires when `usage` is truthy:**
   ```ts
   // chat-view.tsx ~line 409, ~line 814:
   if (usage && currentModel) {
     addRecord({ ... cost: calculateCost(usage.inputTokens, usage.outputTokens, currentModel) })
   }
   ```
   If `usage` is `undefined` or `null` after a streaming response → cost never recorded → stays $0.

2. **Streaming responses may not include usage data:**
   - OpenAI streaming: usage tokens only returned in the FINAL chunk (with `stream_options: { include_usage: true }`)
   - Anthropic streaming: `message_delta` event includes usage
   - Google streaming: usage in final candidate
   - If the API request does NOT set `stream_options: { include_usage: true }` for OpenAI → `usage` is null in every chunk

3. **qatest environment:** Uses hardcoded env var keys (`NEXT_PUBLIC_*`), same streaming path. If usage tokens aren't being parsed from the stream, `addRecord()` never fires.

**Investigation steps:**

1. Open `src/app/api/chat/route.ts` — check if OpenAI streaming requests include:
   ```ts
   stream_options: { include_usage: true }
   ```
   If missing → add it.

2. Check how the streaming response is parsed in chat-view.tsx — look for where `usage` is extracted from chunks. Confirm it reads the final chunk's usage data.

3. Check Anthropic and Google providers — confirm usage tokens are extracted from their final events.

**Fix plan:**

**Fix A — Ensure usage tokens are always requested (OpenAI):**
In the API route (or wherever OpenAI stream is created), add:
```ts
stream_options: { include_usage: true }
```

**Fix B — Fallback estimation when usage tokens unavailable:**
If after parsing the full stream `usage` is still null, estimate tokens from response text length:
```ts
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4); // ~4 chars per token
}

// In the stream completion handler:
const finalUsage = usage ?? {
  inputTokens: estimateTokens(lastUserMessage),
  outputTokens: estimateTokens(assistantResponse),
  isEstimated: true, // flag to show "~" prefix in UI
};
if (finalUsage && currentModel) {
  addRecord({
    modelId: currentModel.id,
    inputTokens: finalUsage.inputTokens,
    outputTokens: finalUsage.outputTokens,
    cost: calculateCost(finalUsage.inputTokens, finalUsage.outputTokens, currentModel),
    isEstimated: finalUsage.isEstimated ?? false,
  });
}
```

**Fix C — Transparent cost display in chat:**
In `chat-view.tsx`, show cost per message in a subtle way:
- After each AI response: `cost > 0 ? "$0" : "~$0"` (estimated prefix if isEstimated)
- If cost is still 0 after fix, show tooltip: "Usage data unavailable for this provider"

**Fix D — Add `loadFromStorage()` call on dashboard mount:**
In `dashboard-view.tsx`, ensure `loadFromStorage()` is called in useEffect on mount — otherwise costs recorded in chat won't show on dashboard until page reload.
```ts
useEffect(() => {
  loadFromStorage();
}, []);
```

**Expected result:**
- qatest page API usage → tokens captured → cost > $0 → dashboard shows real spend
- If tokens truly unavailable (rare edge case) → estimated cost shown with "~" prefix
- User can see transparent cost breakdown at all times

**Excel entry:**
`23. [BUG] chat-view.tsx + usage-store.ts — $0 cost bug: investigate why usage tokens not captured, fix addRecord() to always fire + show real cost transparently`

### 17. [IMP] Currency Decimal — Restore toFixed(1) (was Math.round, now show 1 decimal)

**Context:** 2026-04-18에 소수점을 완전 제거(Math.round)했으나, 사용자가 소수점 1자리를 보여달라고 요청.

**Rule:** 달러 금액은 `toFixed(1)` — 소수점 한 자리 표시 (예: $0.1, $2.5)

**Files + locations:**

`src/modules/ui/dashboard-view.tsx`:
- `formatDual()` function: `Math.round(usd)` → `parseFloat(usd.toFixed(1))`
  ```ts
  function formatDual(usd: number, country: string): string {
    if (country === 'KR') return `$${usd.toFixed(1)} (₩${Math.round(usd * KRW).toLocaleString()})`;
    if (country === 'PH') return `$${usd.toFixed(1)} (₱${Math.round(usd * PHP).toLocaleString()})`;
    return `$${usd.toFixed(1)}`;
  }
  ```
  Note: Keep KRW/PHP values as Math.round (whole numbers only for foreign currency)
- SVG bar chart y-axis labels: `Math.round(val)` → `val.toFixed(1)`
- ModelCostBars: `Math.round(d.cost)` → `d.cost.toFixed(1)`
- UsageBreakdownPanel cost values: `Math.round(cost)` → `cost.toFixed(1)`, `Math.round(s.value)` → `s.value.toFixed(1)`
- Donut chart total: keep Math.round (tiny label, ok)
- Provider chips: `Math.round(cost)` → `cost.toFixed(1)`

`src/modules/ui/cost-savings-dashboard.tsx`:
- `formatDual()` function: same change as above — `$${Math.round(usd)}` → `$${usd.toFixed(1)}`

`src/modules/chat/chat-view.tsx`:
- `msg.cost.toFixed(4)` was already changed to `Math.round` → change to `msg.cost.toFixed(1)`
- Daily cost limit values: `Math.round(settings.dailyCostLimit)` → `settings.dailyCostLimit.toFixed(1)`
- `Math.round(getTodayCost())` → `getTodayCost().toFixed(1)`

`src/modules/ui/cost-alert-toast.tsx`:
- `Math.round(todayCost)` → `todayCost.toFixed(1)`
- `Math.round(limit)` → `limit.toFixed(1)`

`src/modules/settings/settings-view.tsx`:
- `Math.round(settings.dailyCostLimit ?? 1)` → `(settings.dailyCostLimit ?? 1).toFixed(1)`

**Excel entry:**
`24. [IMP] All pages — Restore currency decimals to toFixed(1) (1 decimal place, was Math.round)`

---

### 18. [IMP] Dashboard — Remove duplicate "모델별 비용 (바 차트)" section

**File:** `src/modules/ui/dashboard-view.tsx`

**Problem:** "모델별 비용 (바 차트)" (the `ModelCostBars` grid section) shows the same data as the "API Usage Breakdown" panel's "Cost by Model" section — this is a duplicate.

**Fix:** Remove the entire `<div>` grid block that contains:
```tsx
{/* Cost by Model — bar chart */}
<div className="bg-surface-2 rounded-xl p-4">
  <h2 className="text-sm font-medium text-on-surface-muted mb-3">{t('dashboard.model_cost')}</h2>
  {Object.keys(costByModel).length === 0 ? (
    ...
  ) : (
    <ModelCostBars ... />
  )}
</div>
```
This is the second card in the `grid md:grid-cols-2` block. After removing it, the Provider pie chart can take full width:
- Change the grid from `grid md:grid-cols-2 gap-4 mb-6` to just a plain div (or `mb-6`)
- Keep the Provider pie chart section

Also remove the `ModelCostBars` component function definition (lines ~221-238) since it's no longer used.

**Excel entry:**
`25. [IMP] dashboard-view.tsx — Remove duplicate "모델별 비용 (바 차트)" section (redundant with API Usage Breakdown)`

---

### 19. [IMP] Dashboard — Localize ALL English section headers

**Files:** `src/modules/ui/dashboard-view.tsx`, `src/locales/ko.json`, `src/locales/en.json`

**Rule (IMPORTANT — apply to all future features too):**
> All section titles/headings MUST use i18n locale keys. Korean environment = Korean text. English environment = English text. NEVER hardcode English strings in components that Korean users will see. This applies to ALL labels, section titles, column headers, and badge text.

**Changes in dashboard-view.tsx:**

1. `UsageBreakdownPanel` title — hardcoded `"API Usage Breakdown"` → `{t('dashboard.usage_breakdown_title')}`
2. "Cost by Model" sub-heading → `{t('dashboard.breakdown_cost_by_model')}`
3. "Token Breakdown" sub-heading → `{t('dashboard.breakdown_token')}`
4. "Usage by Provider" sub-heading → `{t('dashboard.breakdown_by_provider')}`
5. "Input tokens" label → `{t('dashboard.input_tokens_label')}`
6. "Output tokens" label → `{t('dashboard.output_tokens_label')}`
7. `Updated X min ago` in the header → `{t('dashboard.last_updated', { min: ... })}`

**Also fix `daily_cost_7` and `daily_trend_14` locale values** — remove "(SVG 바 차트)" and "(라인 차트)" from the display labels, they look unfinished:
- ko: `"최근 7일 일별 비용"` / en: `"Daily Cost — Last 7 Days"`
- ko: `"최근 14일 비용 추이"` / en: `"Cost Trend — Last 14 Days"`

**Add to ko.json** (`"dashboard"` section):
```json
"usage_breakdown_title": "API 사용량",
"breakdown_cost_by_model": "모델별 비용",
"breakdown_token": "토큰 사용",
"breakdown_by_provider": "프로바이더별",
"input_tokens_label": "입력 토큰",
"output_tokens_label": "출력 토큰",
"last_updated": "{{min}}분 전 업데이트"
```

**Add to en.json** (`"dashboard"` section):
```json
"usage_breakdown_title": "API Usage Breakdown",
"breakdown_cost_by_model": "Cost by Model",
"breakdown_token": "Token Breakdown",
"breakdown_by_provider": "Usage by Provider",
"input_tokens_label": "Input tokens",
"output_tokens_label": "Output tokens",
"last_updated": "Updated {{min}} min ago"
```

Also update existing keys:
- ko `daily_cost_7`: `"최근 7일 일별 비용"` (remove "(SVG 바 차트)")
- ko `daily_trend_14`: `"최근 14일 비용 추이"` (remove "(라인 차트)")
- en `daily_cost_7`: `"Daily Cost — Last 7 Days"`
- en `daily_trend_14`: `"Cost Trend — Last 14 Days"`
- ko `model_cost`: `"모델별 비용"` (remove "(바 차트)")
- en `model_cost`: `"Cost by Model"`

**Excel entry:**
`26. [IMP] dashboard-view.tsx — Localize all hardcoded English headers with i18n keys (ko/en)`

---

### 20. [IMP] Dashboard — Redesign "모델별 토큰 사용량" chart

**File:** `src/modules/ui/dashboard-view.tsx`

**Problem:** Current "모델별 토큰 사용량" section shows a stacked bar (blue=input, green=output) with "입력 X%" / "출력 X%" labels below — this looks plain and inconsistent with the API Usage Breakdown panel.

**Goal:** Match the API Usage Breakdown style — for each model, show:
```
● claude-sonnet-4-6   ████████░░░░  10.7K tokens   [input/output ratio bar split]
                      입력 95% / 출력 5%
```

**New design for the token usage section:**
```tsx
<div className="space-y-3">
  {Object.entries(tokensByModel)
    .sort(([, a], [, b]) => (b.input + b.output) - (a.input + a.output))
    .map(([model, tokens], i) => {
      const total = tokens.input + tokens.output;
      const inputPct = total > 0 ? Math.round((tokens.input / total) * 100) : 0;
      const color = MODEL_COLORS[i % MODEL_COLORS.length];
      return (
        <div key={model}>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <span className="text-xs text-on-surface truncate flex-1 max-w-[140px]">{model}</span>
            <span className="text-xs text-on-surface-muted shrink-0">{(total / 1000).toFixed(1)}K {t('dashboard.tokens_label')}</span>
          </div>
          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden flex mx-4">
            <div className="bg-blue-500 h-full" style={{ width: `${inputPct}%` }} />
            <div className="bg-green-500 h-full" style={{ width: `${100 - inputPct}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-on-surface-muted mt-0.5 mx-4">
            <span>{t('dashboard.input_pct', { pct: inputPct })}</span>
            <span>{t('dashboard.output_pct', { pct: 100 - inputPct })}</span>
          </div>
        </div>
      );
    })}
</div>
```

Key improvements:
- Colored dot per model (using `MODEL_COLORS` array, same as Cost by Model section)
- Total token count on the right
- Stacked bar still shows input(blue)/output(green) split
- Input/output % labels below the bar
- Visual style now consistent with the Breakdown panel

Also add locale key:
- ko: `"tokens_label": "토큰"`
- en: `"tokens_label": "tokens"`

**Excel entry:**
`27. [IMP] dashboard-view.tsx — Redesign token usage chart: colored dots + model name + bar + token count (matches API Usage Breakdown style)`

---

### 21. [IMP] billing-view.tsx — Localize ALL hardcoded English strings

**Files:** `src/modules/ui/billing-view.tsx`, `src/locales/ko.json`, `src/locales/en.json`

**Problem:** Korean users see all plan features in English (hardcoded strings):
- "Unlimited messages", "All AI models", "Voice chat", "Image generation", "Meeting analysis", "Priority support"
- "Everything in Pro", "All future updates"
- "one-time" label
- "For power users who want the best AI" (plan subtitle)
- Badge: "가장 인기" already Korean ✓ but "Lifetime" badge — keep as-is (brand name)

**Rule:** Every visible text string in billing-view.tsx MUST use `t('key')`. No hardcoded English strings visible to Korean users.

**Add to ko.json** (`"billing"` section):
```json
"feature_unlimited_msg": "무제한 메시지",
"feature_all_models": "모든 AI 모델",
"feature_voice_chat": "보이스 챗",
"feature_image_gen": "이미지 생성",
"feature_meeting": "회의 분석",
"feature_priority_support": "우선 지원",
"feature_all_in_pro": "Pro 모든 기능 포함",
"feature_future_updates": "모든 업데이트 영구 제공",
"plan_pro_subtitle": "최고의 AI를 원하는 파워 유저를 위한 플랜",
"plan_free_subtitle": "API 키 연결로 무료 시작",
"label_one_time": "일회성 결제",
"label_per_month": "/월",
"label_most_popular": "가장 인기",
"lifetime_oneshot_ko": "월정액 없음 · 갱신 없음 · 영구 소유"
```

**Add to en.json** (`"billing"` section):
```json
"feature_unlimited_msg": "Unlimited messages",
"feature_all_models": "All AI models",
"feature_voice_chat": "Voice chat",
"feature_image_gen": "Image generation",
"feature_meeting": "Meeting analysis",
"feature_priority_support": "Priority support",
"feature_all_in_pro": "Everything in Pro",
"feature_future_updates": "All future updates",
"plan_pro_subtitle": "For power users who want the best AI",
"plan_free_subtitle": "Start free with your API key",
"label_one_time": "one-time",
"label_per_month": "/mo",
"label_most_popular": "Most Popular",
"lifetime_oneshot_ko": "No subscription · No renewal · Permanently yours"
```

**Implementation:**
- In the PLANS array (or wherever features are defined), replace hardcoded strings with locale key references
- Each feature object: `{ textKey: 'billing.feature_unlimited_msg', accent: false }`
- Render: `<span>{t(feature.textKey)}</span>`
- Plan subtitles: replace hardcoded subtitle strings with `t('billing.plan_pro_subtitle')` etc.
- "one-time" label next to $29: `{t('billing.label_one_time')}`
- "/월" label: `{t('billing.label_per_month')}` (en: "/mo")

**Excel entry:**
`28. [IMP] billing-view.tsx — Localize all hardcoded English plan features, labels, and subtitles (ko/en i18n)`

---

### 22. [IMP] FULL i18n Audit — ALL pages hardcoded English → locale keys

**Context:** User confirmed billing was not the only page with hardcoded English. ALL visible user-facing text must use `t('key')`. This is a full audit + fix pass.

**Rule (permanent, applies to all future work):**
> ANY string visible to users MUST be in ko.json + en.json. No hardcoded English in JSX. No exceptions.
> Korean environment = Korean. English environment = English.
> Only brand names (e.g. "Blend", "Lifetime" badge, model names like "GPT-4o") may remain in English.

**Audit targets — scan these files for hardcoded English strings:**

```
src/modules/chat/chat-view.tsx
src/modules/ui/billing-view.tsx          ← already item 28
src/modules/ui/dashboard-view.tsx        ← already items 26
src/modules/ui/cost-savings-dashboard.tsx
src/modules/agents/agents-view.tsx       ← __auto__ already fixed 2026-04-19
src/modules/models/models-view.tsx
src/modules/models/model-compare-view.tsx
src/modules/settings/settings-view.tsx
src/modules/ui/sidebar.tsx
src/modules/ui/welcome-view.tsx
src/components/app-content.tsx
```

**How to audit each file:**
1. Search for JSX text content: `>[A-Z][a-z ]+<` or string literals in className-adjacent positions
2. Check button labels, placeholder text, toast messages, error messages, section headings, badge text, helper text
3. For each hardcoded string found:
   - Add a key to ko.json (Korean translation) and en.json (English original)
   - Replace the hardcoded string with `{t('section.key')}`

**Common patterns to look for:**
- `<span>Some English</span>` → `<span>{t('key')}</span>`
- `placeholder="Type here..."` → `placeholder={t('key')}`
- `title="Something"` → `title={t('key')}`
- `aria-label="Close"` → `aria-label={t('key')}`

**Excel entry:**
`29. [IMP] All pages — Full i18n audit: replace all hardcoded English strings with locale keys across all modules
30. [IMP] New "About Blend" menu item + page — AI 중계 플랫폼 explanation, simple language, FAQ, comparison table`

---

### 23. [IMP] "About Blend" — New menu item + full explanation page

**Goal:** Add a brand-new top-level menu item **"About Blend"** (한국어: "블렌드 소개") at the very end of the navigation menu. This is NOT inside Settings — it's a separate menu entry.

**Step 1 — Add tab to navigation**

Find where nav tabs are defined (e.g. `src/components/app-content.tsx` or `src/modules/ui/sidebar.tsx`).
Add a new tab at the end:
```tsx
{ id: 'about', label: t('nav.about'), icon: <Info size={20} /> }
```
Locale keys:
- ko: `"nav.about": "블렌드 소개"`
- en: `"nav.about": "About Blend"`

**Step 2 — Create new component**

Create: `src/modules/ui/about-view.tsx`

Full page, scrollable, dark theme. Structure:

---

**[Section 1 — Hero: 가장 크게, 가장 강조]**
```
🔀  Blend는 AI 중계 플랫폼이에요

여러 AI 서비스를 하나의 앱에서 연결해 드려요.
ChatGPT, Claude, Gemini… 하나만 골라 쓸 필요 없어요.
```
Style: 큰 이모지 + h1 굵은 글씨 + 부제목. "AI 중계 플랫폼" 부분은 `text-blue-400 font-bold` 강조.

---

**[Section 2 — 초등학생 눈높이 설명 카드 3장]**

카드 1 — 📡 AI 중계란?
```
블렌드는 AI와 나 사이의 연결고리예요.
마치 TV 리모컨처럼, 채널(AI)을 바꿔가며 쓸 수 있어요.
ChatGPT, Claude, Gemini — 전부 블렌드 하나로!
```

카드 2 — 🔑 내 API 키로 직접 연결
```
AI를 쓰려면 "열쇠(API 키)"가 필요해요.
블렌드는 그 열쇠를 내가 직접 갖고, AI 서비스에 연결해줘요.
비용은 내가 쓴 만큼만 — 평균 월 $5 수준이에요.
```

카드 3 — 💰 구독료 vs AI 사용료 구분
```
블렌드 구독료: 앱을 쓰는 비용 ($9/월 또는 $29 평생)
AI 사용료: 실제 AI에게 질문한 비용 (OpenAI·Anthropic 등에 직접 청구)
두 가지는 따로따로예요!
```

Style: `bg-surface-2 rounded-2xl p-5` 카드 3개, grid 1-col (mobile) / 3-col (desktop)

---

**[Section 3 — 비교표: 왜 블렌드인가?]**

```
|              | 개별 구독       | 블렌드          |
|--------------|--------------|--------------|
| ChatGPT Plus | $20/월        | ✓ 포함         |
| Claude Pro   | $20/월        | ✓ 포함         |
| Gemini Adv   | $19.99/월     | ✓ 포함         |
| 합계          | $60+/월       | $9/월 + API비  |
```

심플한 `<table>` 또는 row-by-row 비교 컴포넌트. 마지막 줄 강조.

---

**[Section 4 — FAQ 2개]**

Q. 블렌드가 내 API 키를 서버에 저장하나요?
A. 아니요! API 키는 내 기기(브라우저)에만 저장돼요. 블렌드 서버로 절대 전송되지 않아요.

Q. AI 사용료는 얼마나 나오나요?
A. 사용량에 따라 다르지만 일반적으로 월 $3~$10 수준이에요. 블렌드 대시보드에서 실시간으로 확인할 수 있어요.

---

**[Section 5 — CTA 버튼]**
```
[채팅 시작하기 →]   [요금제 보기]
```
onClick: navigate to 'chat' tab / 'billing' tab

---

**Locale keys to add (ko.json + en.json):**

ko:
```json
"about": {
  "title": "블렌드 소개",
  "hero_title": "Blend는 AI 중계 플랫폼이에요",
  "hero_subtitle": "여러 AI 서비스를 하나의 앱에서 연결해 드려요",
  "card1_title": "AI 중계란?",
  "card1_body": "블렌드는 AI와 나 사이의 연결고리예요. 마치 TV 리모컨처럼, 채널(AI)을 바꿔가며 쓸 수 있어요. ChatGPT, Claude, Gemini — 전부 블렌드 하나로!",
  "card2_title": "내 API 키로 직접 연결",
  "card2_body": "AI를 쓰려면 열쇠(API 키)가 필요해요. 블렌드는 그 열쇠를 내가 직접 갖고 AI 서비스에 연결해줘요. 비용은 내가 쓴 만큼만 — 평균 월 $5 수준이에요.",
  "card3_title": "구독료 vs AI 사용료",
  "card3_body": "블렌드 구독료는 앱 이용료예요. AI 사용료는 OpenAI·Anthropic 등에 별도 청구돼요. 두 가지는 따로따로예요!",
  "compare_title": "왜 블렌드인가?",
  "faq_title": "자주 묻는 질문",
  "faq1_q": "API 키가 서버에 저장되나요?",
  "faq1_a": "아니요! API 키는 내 기기(브라우저)에만 저장돼요. 블렌드 서버로 절대 전송되지 않아요.",
  "faq2_q": "AI 사용료는 얼마나 나오나요?",
  "faq2_a": "사용량에 따라 다르지만 일반적으로 월 $3~$10 수준이에요. 블렌드 대시보드에서 실시간으로 확인할 수 있어요.",
  "cta_chat": "채팅 시작하기",
  "cta_billing": "요금제 보기"
}
```

en:
```json
"about": {
  "title": "About Blend",
  "hero_title": "Blend is an AI relay platform",
  "hero_subtitle": "Connect multiple AI services in one app",
  "card1_title": "What is an AI relay?",
  "card1_body": "Blend is the bridge between you and AI. Like a TV remote, you can switch channels (AI models) anytime. ChatGPT, Claude, Gemini — all in one app!",
  "card2_title": "Connect with your own API key",
  "card2_body": "To use AI, you need a key (API key). Blend lets you hold that key yourself and connect directly to AI services. You only pay for what you use — about $5/month on average.",
  "card3_title": "Subscription vs AI usage fee",
  "card3_body": "Blend subscription covers the app. AI usage fees go directly to OpenAI, Anthropic, etc. They're two separate costs!",
  "compare_title": "Why Blend?",
  "faq_title": "Frequently Asked Questions",
  "faq1_q": "Is my API key stored on your servers?",
  "faq1_a": "No! Your API key is stored only on your device (browser). It is never sent to Blend's servers.",
  "faq2_q": "How much are AI usage fees?",
  "faq2_a": "It varies by usage, but typically $3–$10 per month. You can check real-time costs on the Blend dashboard.",
  "cta_chat": "Start Chatting",
  "cta_billing": "View Plans"
}
```

**Step 3 — Register in app-content.tsx**
```tsx
case 'about': return <AboutView onNavigate={setActiveTab} />;
```

**Excel entry:**
`30. [IMP] New "About Blend" menu item + page — AI 중계 플랫폼 explanation, simple language, FAQ, comparison table`

### 9. vercel --prod 배포
모든 수정 완료 후 반드시 배포:
```
cd "/Users/jesikroymin/Library/CloudStorage/OneDrive-MIN/Apps/Whichbusinesses/Blend"
vercel --prod
```

### 9. QA Testing — MANDATORY after every nighttask (permanent rule)

**This step is ALWAYS required after completing code changes and deployment.**

After `vercel --prod` completes:
1. Open blend.ai4min.com in browser (use MCP browser tool)
2. For EVERY item recorded in Task Checklist (A-G rows added this session):
   - Follow the "G: How to Test (Summary)" instructions
   - Perform the test exactly as a human tester would
   - Record result in:
     - **L column**: `PASS` or `FAIL`
     - **M column**: Short note (e.g. "Confirmed dual currency ₩ showing", "Button not responding", etc.)
3. If FAIL: note the specific failure detail in M column; do NOT re-fix tonight — flag for next session
4. Update Excel via graph_excel.py only

**This QA step runs every night after nighttask, no exceptions.**

### 9. Excel Recording (Blend_QA_Task.xlsx)
Use graph_excel.py (Graph API) to record entries in the Dev tab.
File path: /Users/jesikroymin/Library/CloudStorage/OneDrive-MIN/Apps/Whichbusinesses/Blend_QA_Task.xlsx

**STEP 1 — Translate all existing Korean rows to English first:**
- Read all rows in the Dev tab (and TC tab if applicable)
- Find any cell containing Korean text
- Translate to English in-place using graph_excel.py
- All columns must be in English: Test Item, Function, How to Test (Summary), Work Type, Category, etc.
- Do this before adding new entries

**STEP 2 — Add new entries (all in English):**

**Completed 2026-04-18:**
1. yt-transcript.js — Add IP-based rate limiting (10 req/min)
2. billing-view.tsx — Fix mobile scroll bug on pricing page (min-h-full → h-full)
3. cost-savings-dashboard.tsx — Update market price year 2024 → 2026
4. dashboard-view.tsx — Add per-device notice + AI provider links dropdown
5. billing-view.tsx — Highlight Voice chat / Image generation / Meeting analysis in yellow on Pro plan
6. Cloudflare transfer reminder — Schedule alert for 2026-05-13 09:00 KST
7. cost-savings-dashboard.tsx — Remove currency decimals (Math.round)

**Completed 2026-04-19 (tonight):**
8. use-country.ts — Add country detection hook via ipapi.co (KR/PH/other)
9. billing-view.tsx — Update payment tab names by language + highlight recommended tab by country
10. billing / savings / dashboard — Add dual currency display ($+₩ or $+₱)
11. model-compare-view.tsx — Fix mobile compare view: horizontal scroll + fixed 10-line card height + scrollbar
12. Remove currency decimals across all pages — dashboard-view, chat-view, cost-alert-toast, settings-view
13. [IMP] models-view.tsx — Add yellow "Apply" button in model tab + navigate to chat + disable auto AI matching
14. [BUG] models-view ↔ chat-view model list count mismatch — investigate and unify
15. [IMP] dashboard-view.tsx — Add API usage breakdown panel (cost by model, token ratio, provider totals)
16. [IMP] BYOK notice added — billing page (gold, larger text), welcome screen, API settings
17. [IMP] billing-view.tsx — Add Lifetime plan ($29 one-time, permanent access)
18. [IMP] settings-view.tsx — Add "About Blend" BYOK service introduction section
19. [IMP] billing-view.tsx — Add FAQ: subscription benefits Q&A
20. [IMP] billing-view.tsx — Plan CTA buttons scroll to payment section on click (mobile UX fix)
21. [BUG/IMP] chat-view.tsx — Mobile chat toolbar: collapse action buttons into dropdown on small screens
22. [IMP] model-registry.ts — Remove dated duplicates, limit 2 per family, rewrite all descriptions (10 chars, use-case focused)
23. [BUG] chat-view.tsx + usage-store.ts — $0 cost bug: investigate why usage tokens not captured, fix addRecord() to always fire + show real cost transparently
24. [IMP] dashboard-view.tsx — Restore decimal display: Math.round() → toFixed(1) across all currency values (all pages)
25. [IMP] dashboard-view.tsx — Remove duplicate "모델별 비용 (바 차트)" section (already covered by API Usage Breakdown panel)
26. [IMP] dashboard-view.tsx + locales — Localize all English section headers (API Usage Breakdown / COST BY MODEL / TOKEN BREAKDOWN / USAGE BY PROVIDER) with i18n keys; Korean env = Korean text
27. [IMP] dashboard-view.tsx — Redesign "모델별 토큰 사용량" chart: match API Usage Breakdown style (colored dot + model name + bar + % + token count)
28. [IMP] billing-view.tsx — Localize ALL hardcoded English strings: plan features, badges, labels, subtitles — Korean env = Korean, English env = English
29. [IMP] FULL i18n audit — scan ALL src/modules/**/*.tsx files for hardcoded English strings visible to users; replace every occurrence with t('key'); update ko.json + en.json

IMPORTANT: Only use graph_excel.py to modify Excel. Never use openpyxl local save.
graph_excel.py path: /Users/jesikroymin/Library/CloudStorage/OneDrive-MIN/Apps/Whichbusinesses/
