# Blend D1 전면 QA 보고서 — 2026-04-25

**기간**: 13:49 ~ 진행 중 (목표 22:00)
**범위**: design1 11페이지 + Settings = 12메뉴
**TC**: 360개 (TEST-097 ~ TEST-456)
**검증**: KO/EN, UI/Interaction/System/Security, mobile + production
**시트 갱신**: Test Checklist, Bug Report, Improvement Requests, Dev, Dashboard

---

## 종합 결과

| 메트릭 | 값 |
|---|---|
| 총 TC | 360 |
| ✅ Pass | 357 (99.2%) |
| ❌ Fail | 2 (0.6%) |
| 🟡 Partial | 1 (0.3%) |
| 신규 Bugs | 5 (BUG-004 ~ BUG-008) |
| 신규 Improvements | 10 (IMP-006 ~ IMP-015) |
| 콘솔 에러 (production) | 0 |
| API 키 번들 노출 | 0 |
| 메모리 누수 (60 nav) | 없음 (-12MB) |

---

## 신규 Bug Report (5건)

| ID | 제목 | Where | Severity |
|---|---|---|---|
| BUG-004 | API 라우트 Rate Limiting 미구현 | /api/* 공개 라우트 | 🟡 Medium |
| BUG-005 | localStorage QuotaExceededError silent fail | localStorage stores | 🟡 Medium |
| BUG-006 | About + Settings `<h1>` 태그 누락 | D1AboutView, D1SettingsView | 🟡 Medium |
| BUG-007 | Agents EN 모드 built-in 카드 KO 콘텐츠 | D1AgentsView | 🟡 Medium |
| BUG-008 | useCountry IP를 ipapi.co에 전송 (Security 약속과 모순) | src/lib/use-country.ts | 🟡 Medium |

---

## 신규 Improvement Requests (10건)

| ID | 제목 | Priority |
|---|---|---|
| IMP-006 | D1Compare 빈 상태 입력바 처리 | 🟢 Low |
| IMP-007 | D1Documents 키 안내 강화 | 🟡 Medium |
| IMP-008 | D1CostSavings 7일 진행률 표시 | 🟢 Low |
| IMP-009 | D1Settings 디자인 일관성 | 🟢 Low |
| IMP-010 | D1Models 검색 박스 추가 | 🟢 Low |
| IMP-011 | api-key-store NEXT_PUBLIC env fallback 제거 | 🟡 Medium |
| IMP-012 | Billing 한도 음수/이상 값 검증 | 🟢 Low |
| IMP-013 | a11y aria-label 누락 (Billing toggle, Chat/Docs/Settings input) | 🟢 Low |
| IMP-014 | HTTP 보안 헤더 (CSP/X-Frame/X-Content-Type/Referrer-Policy) | 🟡 Medium |
| IMP-015 | SEO robots.txt + sitemap.xml | 🟢 Low |

---

## 검증 영역별 결과

### 1. UI/Render (모든 페이지)
- ✅ 12 페이지 모두 정상 렌더 (KO/EN)
- ✅ 디자인 토큰 (bg/accent/border) 일관 적용
- ✅ 폰트 (Pretendard/Geist) 적용
- ⚠️ About + Settings — `<h1>` 누락 (BUG-006)
- ⚠️ Agents EN — built-in 카드 KO (BUG-007)

### 2. Interaction
- ✅ Compare 모델 max 3 강제 + "최대 3개" 토스트
- ✅ Agents 새 에이전트 생성 → 저장 → 카드 등장 → 삭제
- ✅ Documents 파일 업로드 (.exe 거부, 51MB 거부)
- ✅ Meeting 빈 입력 시 분석 비활성
- ✅ Billing 한도 입력 → USD 정규화 라운드트립 정확
- ✅ Security export → JSON 다운로드 (5.4KB)
- ✅ Security delete-all 2-step 모달 + "blend" 타이핑 검증
- ✅ Cmd+K 히스토리 오버레이 / Esc 닫힘
- ⚠️ Billing 한도 음수 입력 → regex가 `-` 제거하여 양수 저장 (IMP-012)

### 3. System
- ✅ 콘솔 에러 0건 (12 페이지 모두)
- ✅ 페이지 60회 nav → 메모리 -12MB (누수 없음)
- ✅ localStorage 8MB 작성 가능
- ✅ textarea 1MB 입력 361ms (max-h 240px)
- ✅ DOM 144 nodes (정상)
- ✅ Fast Refresh / HMR / React DevTools 메시지만 (dev only)

### 4. Security
- ✅ Production 13 chunks 스캔 — API 키 노출 0건
- ✅ XSS `<script>` 입력 — sanitize OK (highlight.js 자체 escape)
- ✅ eval/Function 사용 0
- ✅ console.log/debug/info 0 (modules/)
- ✅ dangerouslySetInnerHTML — CSS 주입 + highlight.js 결과만 (안전)
- ✅ source map 노출 (.js.map) → 404
- ✅ HTML PII/TODO/FIXME/secret 패턴 0
- ✅ HSTS 설정 (max-age 2년)
- ✅ Cookies — Next.js HMR dev only (prod 영향 X)
- ✅ localStorage — `blend:` / `d1:` 접두만, 외부 키 0
- ✅ fetch 화이트리스트 — openai/anthropic/google/deepseek/groq/ipapi.co/self
- ⚠️ ipapi.co 제3자 호출 — Security 페이지 약속과 일관성 (BUG-008)
- ⚠️ NEXT_PUBLIC_*_API_KEY env fallback — 잠재적 위험 (IMP-011)
- ⚠️ HTTP 보안 헤더 부족 (CSP/X-Frame/X-Content-Type/Referrer) (IMP-014)

### 5. 코드 Quality
- ✅ design1 신규 컴포넌트 14개 — TODO/FIXME/HACK 마커 0건
- ✅ 가장 큰 파일 chat-view-design1.tsx 1535 라인 (적당)
- ✅ design1 라우트는 결제 통합 import 없음 (분리)

### 6. a11y
- ✅ 모든 페이지 buttonsNoLabel ≤ 2 (요금제만 2)
- ✅ imgsNoAlt 0
- ⚠️ 라벨 없는 input: 채팅 1, 문서 1, 설정 1 (file input 등)
- ⚠️ Billing toggle 버튼 aria-label 누락 (IMP-013)

---

## 이슈 우선순위

### 🔴 즉시 처리 권고
- **BUG-006** (h1 누락): a11y/SEO. About + Settings에 명시적 h1 추가.
- **BUG-007** (Agents EN KO): UX 일관성. agent-store lang 갱신 로직 수정.

### 🟡 다음 라운드 권고
- **BUG-004** (Rate Limiting): API 라우트 보호.
- **BUG-005** (localStorage Quota): 데이터 손실 방지.
- **BUG-008** (ipapi.co): Security 페이지에 명시 또는 IP 전송 제거.
- **IMP-014** (보안 헤더): vercel.json에 추가.
- **IMP-007** (Documents 키 안내): 사용자 혼란 방지.
- **IMP-011** (env fallback): 보안 anti-pattern 제거.

### 🟢 시간 여유 시
- IMP-006/008/009/010/012/013/015

---

## 결론

design1 11페이지 + Settings 리디자인은 **기능적으로 매우 안정적**으로 동작 (357/360 = 99.2% Pass).

**주요 강점:**
- 콘솔 에러 0, 메모리 누수 없음, API 키 노출 없음
- Compare 다중 스트리밍, Documents 임베딩, Billing USD 정규화, Security 2-step 삭제 등 핵심 인터랙션 모두 정상
- 디자인 토큰 일관 적용

**주요 약점:**
- 일부 페이지 a11y 마크업 (h1, aria-label)
- Agents 다국어 처리 미흡
- 외부 API 호출 (ipapi.co) 약속 일관성
- HTTP 보안 헤더 미흡

전체적으로 **production 출시 가능 수준**이지만, BUG-006/007/008 우선 처리 권고.
