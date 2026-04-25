# Blend Design1 QA 보고서 — 2026-04-25

**검증 방법**: Web Claude의 디자인 문서 vs Confluence에 기록된 실제 구현 결과 대조
**검증 한계**: 정적 검증만 가능. 시각·인터랙션·렌더링 검증은 Roy의 실 브라우저 테스트로 보완 필요
**대상**: 11개 페이지 + 채팅뷰 (4.0a/4.0/3.9/BUG-003)
**기준 디자인 문서**: `/mnt/user-data/outputs/blend_designs/*_2026-04-25_v1.md`
**기준 실제 결과**: Confluence Phase별 개발일지 + Roy 제공 About 페이지 스크린샷

---

## 검증 결과 요약

| Phase | 페이지 | 디자인 일치도 | 발견 이슈 | 심각도 |
|---|---|---|---|---|
| 4.0a | 결제뷰 카피 | ✅ 일치 | 없음 | — |
| 4.0 | 컨셉 증명 | ⚠️ 일부 차이 | 모델 ID 불일치 가능성 | 중 |
| 3.9 | 모바일 반응형 | ✅ 일치 | 없음 | — |
| BUG-003 | 하이드레이션 | ✅ 완전 수정 | 없음 | — |
| 1 | Compare | ⚠️ 일부 차이 | 모델 ID 합의값과 다름 | 중 |
| 2 | Billing | ✅ 일치 | 없음 | — |
| 3 | Documents | 🔴 큰 차이 | 레이아웃 다름, CitationBlock 미구현 | 중 |
| 4 | Models | ⚠️ 일부 차이 | 86개 모델 노출 | 낮음 |
| 5 | Dashboard | ✅ 일치 | 카테고리 5종(설계 10종) | 낮음 |
| 6 | Agents | ✅ 일치 | 없음 | — |
| 7 | Meeting | 🔴 큰 차이 | YouTube 입력 미제거 | 높음 |
| 8 | DataSources | ⚠️ 일부 차이 | OAuth 흐름 다름 | 낮음 |
| 9 | CostSavings | ✅ 일치 | 없음 | — |
| 10 | Security | ⚠️ 일부 차이 | 통신 내역 로그 미구현 | 낮음 |
| 11 | About | ✅ 새 디자인 적용 (Roy 스크린샷 확인) | 없음 | — |

---

## 🔴 우선순위 1 — 디자인 문서와 명확히 다른 항목

### 이슈 1. Meeting 뷰 — YouTube 입력 노출

**디자인 문서 명시 (수정본):**
> YouTube 링크 분석 기능은 v1에서 비활성화. 코드 골격은 남겨두되 UI 노출 X.

**실제 구현 (커밋 cf31772 / d3faf6c):**
- YouTube link 인풋 화면에 표시
- `/api/youtube-transcript` POST 호출 코드 활성

**조치 필요:**
- `src/modules/meeting/meeting-view-design1.tsx`에서 YouTube 입력 UI 숨김
- YouTube 처리 코드는 유지 (향후 재활성화 가능)
- 카피 표에서 "YouTube 링크" 항목 제거

---

### 이슈 2. Documents 뷰 — 레이아웃 구조 차이

**디자인 문서 명시:**
- 좌측 파일 리스트 + 우측 채팅 영역 분할 레이아웃
- "이 문서에 대해 질문하세요" — 활성 파일에 대해 직접 질문하는 UX
- AI 응답에 인용 카드(CitationBlock) 표시

**실제 구현 (커밋 1d452c2):**
- 파일 관리 전용 뷰로 단순화 (라이브러리 형태)
- "Used in chat" 토글로 채팅뷰에서 RAG 컨텍스트 활성화
- 채팅은 별도 페이지에서 진행
- CitationBlock 미구현

**판단:** 꼬미의 단순화 결정이 사용자 mental model에 더 명확할 수 있음 ("Documents = 라이브러리, Chat = 대화"). 단, Roy가 디자인 문서대로 통합 레이아웃을 선호하면 재구현 필요.

**조치 결정 필요:**
- 옵션 A: 현재 단순화 구조 유지 (꼬미 결정대로)
- 옵션 B: 디자인 문서 원안대로 통합 레이아웃 재구현
- 인용 카드(CitationBlock): 채팅뷰 응답 표시에서 별도 작업으로 분리

---

## ⚠️ 우선순위 2 — 부분 차이 (검토 필요)

### 이슈 3. Phase 4.0 모델 ID 불일치 가능성

**디자인 문서 명시:**
```
이메일 초안 → gpt-5.4-mini
이미지 분석 → gemini-3.1-pro
코드 리뷰 → claude-sonnet-4-6
긴 글 요약 → claude-sonnet-4-6
```

**실제 구현:**
```
이메일 초안 → gpt-4o-mini
이미지 분석 → gemini-2.5-pro
코드 리뷰 → claude-sonnet-4-6
긴 글 요약 → claude-sonnet-4-6
```

**원인 추정:** 
디자인 문서에 합의했던 차세대 모델 ID(`gpt-5.4-mini`, `gemini-3.1-pro`)가 실제 모델 카탈로그에 존재하지 않는 경우 자동으로 fallback. 또는 꼬미가 현재 사용 가능한 모델로 자체 매핑.

**조치 결정 필요:**
- 모델 카탈로그 자동 갱신(3시간 cron)에서 `gpt-5.4-mini` / `gemini-3.1-pro` 등이 실제로 잡히는지 확인
- 없다면 SUGGESTIONS 모델 매핑을 카탈로그 동기로 변경 필요

---

### 이슈 4. Compare 뷰 비용 추정 테이블의 모델 ID

**디자인 문서 가정:** `claude-opus-4-7`, `gpt-5.4` 등 합의된 차세대 ID

**실제 구현 (PRICE_PER_1M):**
```typescript
const PRICE_PER_1M: Record<string, { in: number; out: number }> = {
  'gemini-2.5-flash': { in: 0.15, out: 0.60 },
  'claude-sonnet-4-6': { in: 3.00, out: 15.00 },
  'gpt-4o': { in: 5.00, out: 15.00 },
  // ...
};
```

**조치 결정 필요:**
- 비용 테이블의 모델 ID가 모델 카탈로그(AVAILABLE_MODELS)와 동기되어야 함
- 새 모델 추가될 때마다 테이블 업데이트 필요 → 모델 레지스트리에서 가격 정보를 직접 가져오는 방식으로 통합 권장

---

### 이슈 5. Models 뷰 — 86개 모델 노출

**디자인 문서 가정:** "5개 프로바이더 17+개 모델"

**실제:** Models 뷰에 **86개 모델** 노출 (Confluence 검증 결과)

**원인:** 모델 레지스트리 자동 갱신(Phase 3.7)이 각 프로바이더의 모든 모델을 포함. 채팅뷰 드롭다운은 큐레이션(11개), Models 뷰는 전체.

**조치 결정 필요:**
- 86개가 너무 많으면 필터 칩(전체/무료/비전/추론/긴 문서) 외에 추가 필터 도입
- 또는 META_OVERRIDES에서 화이트리스트로 노출 모델 제한
- 또는 86개 그대로 유지 (전체 카탈로그 = 차별화 포인트)

---

### 이슈 6. Dashboard 카테고리 분류 5종 (설계 10종)

**디자인 문서:**
> 자동 매칭 카테고리 10가지 (코딩, 추론, 창작, 번역, 이미지 분석/생성, 데이터, 간단 질문, 문서, 일반)

**실제 구현:**
> 카테고리 5종: 코딩 / 분석 / 창작 / 번역 / 일반

**원인:** 메시지에 카테고리 저장 안 되어 모델 ID 휴리스틱으로 추정. 5종으로 단순화.

**조치 결정 필요:**
- 카테고리를 메시지에 저장하는 스키마 변경 (Phase 4+ 검토 항목)
- 또는 5종 휴리스틱 유지

---

### 이슈 7. DataSources OAuth 연결 흐름

**디자인 문서:**
- "연결" 버튼 → OAuth 팝업 → 폴더 선택 (Google Picker)
- 즉시 임베딩 진행

**실제 구현:**
- "연결" 버튼 → LegacyHandoff 모달 (추후 통합 안내)

**원인:** OAuth Implicit flow + 정적 빌드 환경에서 즉시 구현 어려움. 기존 Legacy 시스템으로 핸드오프.

**조치 결정 필요:**
- 옵션 A: 현재 LegacyHandoff 유지
- 옵션 B: 직접 OAuth 흐름 구현 (별도 Phase)

---

### 이슈 8. Security 뷰 — 통신 내역 로그 미구현

**디자인 문서 명시:**
- ServerCommunicationLog 카드 (실시간)
- fetch 인터셉터로 외부 API 호출 기록 표시

**실제 구현:**
- 데이터 위치 카드 + API 키 보안 카드 + 데이터 관리는 구현
- 통신 내역 로그 카드는 미구현

**조치 결정 필요:**
- 별도 Phase로 통신 내역 로그 추가
- 또는 현재 3개 카드만으로 충분하다고 판단 시 디자인 문서에서 제거

---

## ✅ 우선순위 3 — 일치 항목 (검증 완료)

### Phase 4.0a — 결제뷰 카피 통일
- KO/EN locales 새 카피 적용 ✅
- "75%는 낭비입니다" → "모든 AI를 하나의 키로." ✅
- 서브카피 "하나로, 더 싸게, 더 스마트하게." ✅

### Phase 3.9 — 모바일 반응형
- 사이드바 hidden md:flex ✅
- MobileDrawer 280ms slide-in ✅
- 햄버거 메뉴 + 좌측 슬라이드 ✅
- 체험 배지 모바일 단축형 ("무료 · N/10") ✅
- 내보내기 아이콘 모바일 숨김 ✅
- 제안 버튼 grid-cols-2 (모바일) → flex (데스크탑) ✅
- 히어로 clamp(28px, 4.5vw, 52px) ✅

### BUG-003 — React Hydration Error #418
- `useParams()` 도입 (`next/navigation`) ✅
- trial badge 내부 span에 `suppressHydrationWarning` 추가 ✅
- 3개 라우트 모두 Resolved (꼬미 자체 검증) ✅

### Phase 1 — Compare 뷰
- 다중 모델 동시 스트리밍 (Promise.all) ✅
- 최대 3개 선택, 4번째 시 자동 해제 + toast ✅
- 채팅으로 이어가기 (handleContinueInChat → chatInitialModel) ✅
- 프로바이더 그룹핑 ✅

### Phase 2 — Billing 뷰
- 3섹션 구조 (이번 달 / 사용 추이 / 비용 한도) ✅
- 환율 1370 KRW/USD ✅
- 30일 SVG 라인 차트 자체 구현 ✅
- 일일 한도 기본 $2 ✅
- USD 정규화 (라운드 트립 검증 통과) ✅
- "누적 절약" 미포함 (CostSavings로 분리) ✅

### Phase 6 — Agents 뷰
- Built-in 8개 + Custom 분리 ✅
- AgentCard (4/5 aspect) + AgentEditor 모달 ✅
- 이모지 팔레트 32개 ✅

### Phase 9 — CostSavings 뷰
- Hero "Blend 사용 후 ₩X 절약" ✅
- Comparison (실제 / 구독 시 / 차이) ✅
- Baseline picker (3services / 5services) ✅
- 7일 미만 빈 상태 ✅
- savings = max(0, sub_per_day × days - actual_total) ✅

### Phase 11 — About 뷰 (Roy 스크린샷 검증 완료)
- 새 디자인 적용 ✅
- "왜 만들었나" 3줄 압축 ✅
- "만든 곳: MIN Company" ✅
- "연락: blend@ai4min.com" ✅
- "어떻게/누가/어디로" 섹션 제거 ✅

---

## 🔍 Roy의 실 브라우저 테스트 필요 항목

코드 레벨에선 일치하지만 시각적·인터랙션 검증이 안 된 항목:

### 채팅뷰 (Phase 4.0)
- [ ] 빈 상태 진입 시 서브카피 "하나로, 더 싸게, 더 스마트하게." 표시 (현재 web_fetch는 stale 캐시 가능성)
- [ ] 제안 카드 "이메일 초안 써줘" 클릭 시 모델 자동 전환 애니메이션 (0.5초 펄스 + 글로우)
- [ ] 모델 칩 색상 점이 프로바이더별로 다른지 (anthropic coral / openai green / google blue)
- [ ] 메시지 푸터 메타 (모델명 · 토큰수 · ₩) 표시
- [ ] "다른 AI로" 버튼 hover 시 등장 → 클릭 시 toast "곧 지원됩니다"

### 모바일 (Phase 3.9)
- [ ] iPhone 14 Pro / SE 실기기에서 사이드바 햄버거 동작
- [ ] 체험 배지가 한 줄로 표시 ("무료 · 10/10", 줄바꿈 X)
- [ ] 히어로 타이틀이 깨짐 없이 표시
- [ ] 제안 버튼 2x2 그리드 (모바일)
- [ ] 내보내기 아이콘 모바일에서 숨겨짐
- [ ] iPad / 데스크탑에서 회귀 없음

### Compare 뷰
- [ ] 모델 2-3개 선택 → 동시 스트리밍 정상
- [ ] 한 컬럼 재생성 시 다른 컬럼 영향 없음
- [ ] "채팅으로 이어가기" 클릭 → 일반 채팅뷰 진입 + 해당 모델 pre-select
- [ ] 모바일 세로 스택 레이아웃

### Billing 뷰
- [ ] 빈 상태 (사용 0): "아직 사용 기록이 없어요" + 한도 섹션 표시
- [ ] 사용 후: 4-5개 위젯 정상 렌더
- [ ] 한도 입력 시 라운드 트립 (KO ₩5,000 → 저장 → 재로드 ₩5,000)
- [ ] 한도 80% 도달 시 토스트
- [ ] 한도 100% + 자동 정지 ON: 채팅 전송 차단

### Documents 뷰
- [ ] PDF/Excel/CSV 업로드 → 파싱 진행 표시
- [ ] 임베딩 키 없을 때 안내 문구
- [ ] "Used in chat" 토글 ON/OFF 시 채팅에서 RAG 적용/비적용
- [ ] 50MB 초과 파일 거부 + 빨간 인라인 에러

### Models 뷰
- [ ] 86개 모델 카탈로그 그룹핑 정상 (5개 프로바이더)
- [ ] 필터 칩 5개 (전체/무료/비전/추론/긴 문서) 동작
- [ ] 키 없는 상태에서 유료 모델 카드 → "키 필요" 표시

### Dashboard 뷰
- [ ] 빈 상태: "아직 사용 기록이 없어요"
- [ ] 사용 후: 4 KPI + 7×24 히트맵 + 모델 막대 + 카테고리 도넛
- [ ] 기간 토글 (이번 주/이번 달/올해/전체) 동작

### Agents 뷰
- [ ] Built-in 8개 카드 표시
- [ ] "+ 새 에이전트" → AgentEditor 모달
- [ ] 카드 클릭 → 채팅뷰 진입 + 시스템 프롬프트 적용

### Meeting 뷰 🔴
- [ ] **YouTube 입력 UI 숨김 확인 (이슈 1 수정 후)**
- [ ] 텍스트 붙여넣기 → 분석 → 5섹션 정상 렌더
- [ ] 액션 아이템 체크박스 → strikethrough + localStorage 반영

### DataSources 뷰
- [ ] Connected/Available 섹션 분리 표시
- [ ] WebDAV "준비 중" disabled
- [ ] NAS 카드 미존재 확인
- [ ] "연결" 클릭 시 LegacyHandoff 모달

### CostSavings 뷰
- [ ] 7일 미만: 빈 상태
- [ ] 7일 이상: Hero 숫자 + 비교 표 + 차트 + 모델별 기여
- [ ] Baseline picker (3 vs 5) 변경 → 즉시 갱신

### Security 뷰
- [ ] 데이터 위치 카드 (localStorage / IndexedDB 사용량 progress bar)
- [ ] API 키 마스킹 (sk-te•••890 형식)
- [ ] 모든 데이터 삭제 → 2-step 확인 ("blend" 타이핑) → reload

### About 뷰 (Roy 스크린샷 검증됨)
- ✅ 새 디자인 적용
- ✅ "왜 만들었나" 3줄
- ✅ MIN Company / blend@ai4min.com

---

## 📋 즉시 수정 권장 (꼬미에게 BACKLOG 추가)

### 핫픽스 1 — Meeting YouTube 입력 숨김 (이슈 1)

```
파일: src/modules/meeting/meeting-view-design1.tsx
변경: YouTube link 인풋 컴포넌트를 hidden 또는 주석 처리
유지: /api/youtube-transcript 호출 코드 (향후 재활성화 가능)
카피: 카피 표에서 "YouTube 링크" 항목 제거

커밋: design1: hide YouTube input in Meeting view (defer to future phase)
```

### 핫픽스 2 — 모델 ID 동기화 검증 (이슈 3, 4)

```
검증: 모델 레지스트리(AVAILABLE_MODELS)에 다음 ID 존재 확인:
- gpt-5.4-mini, gemini-3.1-pro, claude-opus-4-7, gpt-5.4

미존재 시 옵션:
A. SUGGESTIONS / PRICE_PER_1M에서 실제 존재 ID로 fallback
B. META_OVERRIDES 통해 displayName + 모델 ID 정합 확보

이 작업은 정보 수집 후 결정 → Roy에게 보고
```

---

## 🎯 결정 요청 항목 (Roy 답 필요)

다음 항목은 디자인 문서와 실제 구현이 다르지만, 어느 쪽이 옳은지 Roy 결정 필요:

1. **Documents 뷰 레이아웃 (이슈 2)**: 통합 레이아웃 vs 라이브러리 단순화 → 어느 방향?
2. **Models 뷰 86개 노출 (이슈 5)**: 추가 필터링 vs 그대로 유지?
3. **Dashboard 카테고리 5종 (이슈 6)**: 10종으로 확장 vs 5종 유지?
4. **DataSources OAuth (이슈 7)**: Legacy 핸드오프 vs 직접 OAuth?
5. **Security 통신 내역 로그 (이슈 8)**: 추가 구현 vs 디자인 문서에서 제거?

---

## 검증 한계 명시

이 보고서는 다음 자료 기반:
- ✅ Confluence 개발일지 11페이지 (꼬미 보고)
- ✅ Web Claude 디자인 문서 13개 (직접 작성)
- ✅ Roy 제공 About 페이지 스크린샷
- ⚠️ blend.ai4min.com 메인 페이지 1회 web_fetch (캐시 stale 의심)
- ❌ JavaScript 렌더링 결과 미확인
- ❌ 시각·레이아웃·색상 미확인
- ❌ 인터랙션·애니메이션 미확인
- ❌ 모바일 뷰포트 미확인

따라서 **위 "Roy의 실 브라우저 테스트 필요 항목" 섹션이 최종 검증의 핵심**임. 코드 레벨에서 일치한다고 해서 시각적으로 의도대로 보이는 것은 아님.

---

## 다음 단계

1. **Roy 실 브라우저 테스트** (체크리스트 위 섹션) → 시각·인터랙션 이슈 발견 시 보고
2. **이슈 1 (Meeting YouTube) 핫픽스 즉시 처리** — 꼬미 BACKLOG 추가
3. **이슈 3/4 (모델 ID) 검증** — 모델 카탈로그 vs 코드 정합 확인
4. **결정 항목 5개에 Roy 답** → 추가 핫픽스 BACKLOG 정리
