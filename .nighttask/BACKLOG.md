# 📋 Blend Backlog — 꼬미 영구 할일 목록
> 이 파일은 절대 삭제하지 않음. 매 nighttask 시작 시 **가장 먼저** 읽고 미완료 항목 전부 실행.
> 완료된 항목은 ✅로 표시하고 날짜 기록. 절대 삭제 금지 (히스토리 보존).
> 사용자가 새 요청하면 즉시 이 파일에 추가.

---

## 🔴 미완료 (오늘 밤 반드시 실행)

### [이전 세션 누락 항목]

- [ ] **PREV-01** `meeting-view.tsx` — PDF 출력 버튼 추가
  - PDF 출력 버튼 (회의 분석 화면 상단)
  - 클릭 시 미리보기 모달 → 전문 회의록 포맷 (제목/날짜/시간/참석자/안건/대화/분석/요약/액션아이템)
  - 미리보기에서 "출력" + "취소" 버튼
  - 모든 탭(대화내용+분석+요약+Mind Map) 통합 PDF
  - 요청일: 2026-04-19

### [오늘 (2026-04-19) 신규 요청]

- [ ] **TODAY-01** `meeting-view.tsx` — Mind Map 버그 수정
  - 현상: Mind Map 탭 선택 시 마크다운 텍스트 그대로 표시됨
  - 수정: 마크다운 파싱 → 노드/브랜치 시각적 마인드맵으로 렌더링
  - 요청일: 2026-04-19

- [ ] **TODAY-02** `data-source-view.tsx` / `chat-view.tsx` — RAG/회의분석/데이터소스 채팅 연동 버그
  - 현상: 파일 업로드+활성화해도 채팅에서 AI가 내용 모름
  - 수정: 활성화된 문서 청크를 채팅 context에 자동 주입
  - 채팅 자동 AI 매칭이 문서 관련 질문 감지 → 관련 청크 주입 → 최적 AI 답변
  - 문서검색 RAG + 회의분석 + 데이터소스 연결 세 메뉴 모두 적용
  - 요청일: 2026-04-19

- [ ] **TODAY-03** `data-source-view.tsx` — UI 텍스트 변경
  - "데이터 소스 (기업용)" → "데이터 소스 연결"
  - 요청일: 2026-04-19

- [ ] **TODAY-04** `data-source-view.tsx` — OneDrive OAuth 버그 수정
  - 현상: Microsoft 로그인 시 `unsupported_response_type` 에러
  - 수정: OAuth redirect_uri / response_type 파라미터 확인 및 수정
  - 요청일: 2026-04-19

- [ ] **TODAY-05** `data-source-view.tsx` — NAS/WebDAV 비활성화
  - 클릭 불가 + 회색 처리 + "준비 중" 뱃지 표시
  - 요청일: 2026-04-19

- [ ] **TODAY-06** `model-registry.ts` + `blend-model-sync` — 모델 날짜 버전 정리
  - 정책: 모델 패밀리별 최신 2개만 유지, 날짜 버전 전부 제거
  - 모든 메뉴 (채팅 드롭다운, 모델 뷰, 자동 AI 매칭) 동일 정책
  - blend-model-sync (3시간마다) 실행 시마다 자동 필터링 적용
  - 요청일: 2026-04-19

---

## ✅ 완료된 항목

*(완료 시 여기로 이동 + 날짜 기록)*

---

## 📌 영구 정책 (매 nighttask마다 자동 적용, 절대 빠뜨리면 안됨)

### 🔁 개발 완료 후 반드시 실행하는 4단계 프로세스

**① GitHub 커밋** — 파일별 세부 내용 전부 포함
```bash
git add -A
git commit -m "feat: ... (변경된 모든 파일 + 구체적 내용)"
git push
```

**② Blend_QA_Task.xlsx Dev 시트 기록** — graph_excel.py 사용
```python
gx.append_dev_row({
    "commit_hash": "커밋해시",       # → H열 GitHub URL 자동생성
    "confluence_url": "컨플루언스URL", # → I열
    "summary": "작업 요약",
    "details": "파일별 상세 내용",
})
```

**③ Confluence 개발일지 업데이트**
- cloudId: 74f8aa88-85be-4fe3-a0af-6526eb54a763
- space: 5079095 (Blend), parent: 9371649
- 상세하게 작성: 변경 파일별 bullet + QA 결과 표 + 다음 예정 작업

**④ GAS 이메일 발송** — 오늘 실제 데이터로 업데이트 후 발송
```bash
GAS_URL="https://script.google.com/macros/s/AKfycbzZbYIKx7CSfMC2HhxBtkmL4p4t1DBYwoMAZwgRwSKRYztjwQbXcvxEK2MeoMvdMFfM/exec"
curl -s -L "${GAS_URL}?action=setData&data=${오늘데이터}"
curl -s -L "${GAS_URL}?action=sendDevReport"
```

---

### 기타 영구 정책
- QA: ko/qatest + en/qatest 두 화면 모두 테스트
- QA Phase 1~4 매일 실행 (총 300개+)
- 모델 sync: 패밀리별 최신 2개만 유지
- 실행 시간: 새벽 1:07 ~ 오전 7:00 (6시간 풀가동)
