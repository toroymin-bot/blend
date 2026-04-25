# Blend D1 전면 QA — 2026-04-25 (Roy 지시)

**Scope**: design1 11페이지 + Settings = 12메뉴 × 30 TC = 360개
**Time**: 13:49 KST 시작 → 22:00 KST 종료 (~8시간)
**Excel**: Test Checklist (TEST-097 ~ TEST-456) + Bug Report (BUG-006~) + Improvement Requests (IMP-006~)

## 카테고리 분포 (메뉴당 30개)

| Category | 개수 | 내용 |
|---|---|---|
| UI/Render | 10 | 헤더/카피/색상/폰트/반응형/빈상태/메타/푸터/아이콘/레이아웃 |
| Interaction | 10 | 클릭/입력/토글/모달/네비/드롭다운/스크롤/포커스/단축키/CTA |
| System | 5 | 콘솔/네트워크/localStorage/IDB/렌더링 성능 |
| Security | 5 | API 키 노출/로그 누출/XSS/외부전송/CORS |

## 메뉴 매핑

| # | 메뉴 | TC 범위 (UI / Inter / Sys / Sec) | Excel rows |
|---|---|---|---|
| 1 | Chat (D1ChatView) | 097-126 | 103-132 |
| 2 | Compare | 127-156 | 133-162 |
| 3 | Documents | 157-186 | 163-192 |
| 4 | Models | 187-216 | 193-222 |
| 5 | Dashboard | 217-246 | 223-252 |
| 6 | Agents | 247-276 | 253-282 |
| 7 | Meeting | 277-306 | 283-312 |
| 8 | DataSources | 307-336 | 313-342 |
| 9 | CostSavings | 337-366 | 343-372 |
| 10 | Security | 367-396 | 373-402 |
| 11 | About | 397-426 | 403-432 |
| 12 | Settings | 427-456 | 433-462 |

## 결과 기록 규칙

- **Test Checklist**: 모든 360개 TC에 Komi Result(L) / Komi Date(M) / Komi Notes(N) 채움
  - ✅ Pass / ❌ Fail / 🟡 Partial
- **Bug Report**: 실제 버그(❌ Fail) → BUG-006부터 5W1H 작성
- **Improvement Requests**: 개선 제안 → IMP-006부터
- **Dev**: 작업 로그 (QA-batch-1, QA-batch-2 ...)
- **Dashboard**: 마지막에 종합 통계 갱신

## 카테고리별 시나리오 템플릿 (모든 메뉴에 공통 적용)

### UI/Render (10)
1. 페이지 진입 시 h1 헤딩 정확히 렌더
2. 한국어 카피 일치
3. 영어 카피 일치
4. 디자인 토큰(bg/accent) 적용
5. 폰트(Pretendard/Geist) 적용
6. 모바일 ≤ 375px 깨짐 없음
7. 데스크탑 ≥ 1280px 깨짐 없음
8. 빈 상태 메시지 정상
9. 메타 정보(N개, 시간 등) 표기
10. 아이콘/이모지 렌더 정상

### Interaction (10)
11. 메인 CTA 클릭 동작
12. 텍스트 입력 동작
13. 토글/체크박스 상태 변경
14. 모달 열림/닫힘
15. 네비게이션(다른 뷰) 진입
16. 드롭다운/팝오버 동작
17. 스크롤 영역 동작
18. 포커스 이동 (Tab/Esc)
19. 키보드 단축키 (Enter/Esc/Cmd+K)
20. Hover 상태 시각 피드백

### System (5)
21. 콘솔 에러 0건 (페이지 진입 시)
22. 네트워크 호출 의도된 endpoint만
23. localStorage 정상 read/write
24. IndexedDB 누수 없음
25. 렌더링 < 3s

### Security (5)
26. API 키 DOM 평문 노출 안 됨
27. API 키 console.log 누출 안 됨
28. XSS injection 차단 (사용자 입력 sanitize)
29. CORS / 외부 도메인 호출 화이트리스트만
30. 민감 데이터 url query 노출 안 됨

## 실행 순서

1. **Phase A** (시나리오 + Excel 입력): 13:50 ~ 15:30 (100분)
2. **Phase B** (12메뉴 자동 실행 + 결과 기록): 15:30 ~ 20:30 (300분)
3. **Phase C** (버그 분류 + Dashboard 갱신 + 보고): 20:30 ~ 22:00 (90분)
