# 꼬미 검증 보고 — 첨부 파일 처리 모드 분기 (Tori 17989643)

**검증 시각**: 2026-04-28 ~14:00 KST
**소요**: 약 30분 (목표 1시간 내)
**상태**: 명세 정정 필요 — Roy 결정 후 PR 진행 권장

---

## 결론 한 줄

**Tori의 핵심 진단(Issue D — 모드 분기 부재)은 정확.** Issue A·B는 추측이 빗나갔거나 부분만 맞음. C는 가능성 낮음. **PR #1(모드 분기)이 단연 핵심**, PR #2는 작은 보강, PR #3은 edge case 정리, PR #4는 별도 phase 권장.

---

## Tori 추측 vs 코드 사실

### Issue A — 영어 fallback 하드코딩

**Tori 추측**: 영어 문자열이 코드에 하드코딩되어 있음 → lang 분기 없음.

**검증** (`grep -rn 'Not found in the provided sources'`):
```
src/locales/ko.json:702: "model_not_found": "모델을 찾을 수 없어요"
```
- "Not found in the provided sources" 정확한 영어 문자열은 **하드코딩 0건**.
- 정작 발견된 건 model registry용 i18n 키 하나.

**진짜 출처**: `chat-view-design1.tsx`의 Answer Guard에 EN 가드 텍스트로 들어있음 ("If a fact isn't in the provided sources, reply 'Not found in the provided sources'"). **AI가 이 가드 phrase를 verbatim echo** 한 것 — 하드코딩 fallback이 아니라 **시스템 프롬프트 그 자체**.

어제(2026-04-28 commit `edc9b76`)에 가드 톤을 완화하면서 그 phrase는 가드에서 제거됨. 이미 수정됨. **추가 작업 불필요**. 다만 Roy의 스크린샷이 그 fix 배포 이전이었을 가능성 높음.

**판정**: ❌ Tori 추측 틀림. 이미 해결.

---

### Issue B — Sources에 같은 PDF 6번 중복

**Tori 추측**: 청크 단위로 표시. 파일 단위 그루핑 누락.

**검증** (`chat-view-design1.tsx:965-971`):
```ts
const matches = docContext.match(/\[source:\s*([^\]]+)\]/g) ?? [];
const set = new Set<string>();
matches.forEach((m) => {
  const v = m.replace(/^\[source:\s*/, '').replace(/\]$/, '').trim();
  if (v) set.add(v);
});
docSources = Array.from(set).slice(0, 8);
```
- **이미 파일명 단위로 Set dedupe** 적용됨.
- 그래도 Roy 스크린샷에 6개 중복 → Set이 string identity로 비교하니 **case·whitespace·encoding 차이가 한 글자라도 있으면 별개로 간주**.

**가능 시나리오**:
1. 동일 파일을 사용자가 여러 번 업로드(이름 동일, 다른 ID) → 메모리상 별개 doc → 청크 source가 서로 같은 파일명이라 Set은 1개로 합쳐야 함. 그런데 청크 생성 시 source 필드에 file ID 또는 timestamp 접미사가 붙는다면 Set이 dedupe 못함.
2. 파일 이름 자체가 진짜로 다름 (확장자/공백 차이).
3. 트림 후에도 NBSP 등 보이지 않는 문자 차이.

**다음 작업**:
- 파일 ID + 정규화된 파일명을 키로 한 그루핑으로 변경 (단순 string Set → 정규화 + ID match)
- 또는 chunk source를 처음 만들 때 항상 동일 normalized name으로 강제

**판정**: 🟡 Tori 추측 부분 맞음. 그루핑 자체는 있으나 dedupe 키가 약함. **PR #3에서 '파일 ID 단위' 그루핑으로 강화 필요**.

---

### Issue C — PDF 추출 실패 가능성 5개

**검증**:
- `pdfjs-dist 5.6.205` 사용 중 (package.json) — 텍스트 PDF 추출 가능.
- Roy 스크린샷에 Sources 6개 표시됨 = 청크는 생성된 것 → 추출 자체는 성공.
- 의심되는 PDF는 학술/기술 PDF (텍스트 PDF로 추정).

**5개 sub-cause 진단**:
- C-1 (PDF 추출 실패): ❌ 가능성 낮음. 청크 존재 확인됨.
- C-2 (임베딩 미완료): 🟡 활성 칩 dot이 녹색이었음 = 완료 상태. 어제 추가한 진행 배너가 표시 안 됐던 게 정상이라면 완료.
- C-3 (top-k 매칭 실패): ✅ **이게 진짜 문제** — `searchSemantic`의 0.35 threshold가 "한국어로 번역해줘" 같은 메타 쿼리에는 매칭 0건. 어제 fix로 summary fallback이 12 청크 반환하지만 **"번역" 키워드는 summary trigger에도 미포함** → fallback 미작동.
- C-4 (컨텍스트 LLM 전달 누락): ❌ docContext 빌드 흐름 정상.
- C-5 (활성 소스 충돌): ❌ 코드상 모든 활성 doc을 chunks에 합친 후 search.

**판정**: 🟡 C-3 만 사실. **PR #1(모드 분기) 적용하면 자동 해결** — "번역" 키워드 → full_context 모드 → 매칭 우회.

---

### Issue D — 모든 첨부 RAG 단일 모드

**검증** (`grep classifyIntent\|detectIntent\|fullContext`):
- `classifyIntent`, `detectIntent`, `full_context` **하나도 없음**.
- 모든 활성 doc이 buildContext → searchHybrid → top-k 청크만 LLM에 전달.
- "번역", "요약" 등 메타 의도는 RAG 검색으로 동일하게 흘러감.

**판정**: ✅ Tori 추측 정확. **PR #1 = 가장 중요한 작업**.

---

### 부수 검증 — "번역" 키워드 누락

어제 내가 추가한 summary triggers에서 누락:
```ts
const summaryTriggersKo = ['내용', '요약', '뭔데', '뭐야', '뭐가', '전체', '알려줘', '설명', '어떤', '있어', '첨부', '파일'];
const summaryTriggersEn = ['summar', 'overview', 'tell me', 'what is', 'describe', 'explain', 'about', 'content', 'attach', 'this file', 'this pdf', 'this document', 'tldr', 'tl;dr'];
```
- KO: "번역" 없음. 추가 필요.
- EN: "translate" 없음. 추가 필요.

이건 PR #1 모드 분기로 흡수되거나, 단순히 trigger 추가로 quick fix 가능.

---

## Roy 결정 필요 항목

1. **Issue A** (영어 fallback) — Tori 추측 틀림 + 어제 fix됨. 그래도 추가 명세대로 작업할까? **내 권장**: 스킵. 다음 검증 시 Roy가 한국어 응답 다시 받는지 확인.

2. **PR #1 (모드 분기)** — Tori 명세대로 진행할까?
   - **내 권장**: **YES, 즉시 진행**. 핵심 가치 복원.
   - 단, 의도 분류 키워드는 더 풍부하게 가져갈 것. Tori 제시 + 추가:
     - full_context: 번역, 요약, 전체, 다시 써줘, 표로 정리, "이 파일을 ~", translate, summarize, rewrite, restructure, "this file"
     - metadata: 페이지, 크기, 언제, page count, file size, when
     - rag_search: 그 외 + 구체적 단어 매칭

3. **PR #2 (한국어 응답 강제)** — Tori 추측 A가 틀렸으니 PR #2 작업 필요한가?
   - **내 권장**: **PR #1에 흡수**. 시스템 프롬프트 첫 줄에 lang 강제는 모드 분기 prompt builder에 자연스럽게 들어감. 별도 PR 불필요.

4. **PR #3 (Sources 그루핑)** — Tori 추측 부분 정정 필요. 그래도 진행할까?
   - **내 권장**: **YES, 단 작은 fix로**. file ID 기반 dedupe + 정규화. Tori 명세보다 단순.

5. **PR #4 (PDF 추출 검증)** — Issue C 진단 거의 다 false였음.
   - **내 권장**: **별도 phase로 미루기**. 노랑 dot/추출 실패 안내는 좋은 UX지만 P0 아님. P1 백로그.

---

## 권장 작업 큐 (검증 후 정정)

| # | 작업 | 시간 | 우선순위 |
|---|---|---|---|
| 0 | 검증 (이미 완료) | — | ✅ Done |
| 1 | **모드 분기 + 의도 분류 + 한국어 응답 강제** (PR #1+#2 통합) | 2시간 | 🔴 P0 |
| 2 | **Sources 그루핑 강화** (file ID 기반) | 30분 | 🟡 P1 |
| 3 | PDF 추출 검증 / 노랑 dot | (보류) | P2 백로그 |

총 ~2.5시간 (Tori 견적 5시간 → 검증 결과 절반으로 단축).

---

## Roy 결정 요청

A. **위 큐대로 진행** — 즉시 PR #1(통합) 시작. 30분 ETA 보고 후 PR #2(소스 그루핑) 진행.
B. **Tori 명세 그대로 4 PR** — 시간이 좀 더 걸리지만 명세 충실.
C. **다른 방향** — 알려주면 반영.

내 추천: **A**. PR #1 핵심만 빠르게 살려서 사용자 가치 복원.

알려주면 즉시 시작.

— 꼬미
