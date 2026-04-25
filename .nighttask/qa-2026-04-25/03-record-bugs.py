"""
Record bugs to Bug Report sheet (rows 9-12 reserved for BUG-004 ~ BUG-007).
Columns B-J: Linked Test, Who, When (date), Where, What, How, Why, Expected, Severity
A column (Bug ID) already populated.
"""
import sys
sys.path.insert(0, '/Users/jesikroymin/Library/CloudStorage/OneDrive-MIN/Apps/Whichbusinesses')
from graph_excel import GraphExcel

# Excel serial date for 2026-04-25 = 46137
DATE_2026_04_25 = 46137

bugs = [
    # BUG-004 (from BACKLOG)
    [
        '',                              # B Linked Test
        'Komi (QA 2026-04-25)',          # C Who
        DATE_2026_04_25,                 # D When
        'API 라우트 (web-search/transcribe/image-gen 등)',  # E Where
        '/api/* 공개 라우트에 IP 기반 rate limiting 미구현. 무제한 호출 가능.',  # F What
        '1. 클라이언트가 /api/web-search 등에 POST 반복 호출.\n2. 서버는 모든 요청 처리 (제한 없음).',  # G How
        'DDoS / API 키 남용 위험. yt-transcript.js 외 라우트 모두 노출.',  # H Why
        'IP 기반 rate limiter (분당 N회) 적용. 초과 시 429 Too Many Requests.',  # I Expected
        '🟡 Medium',                     # J Severity
    ],
    # BUG-005 (from BACKLOG)
    [
        '',
        'Komi (QA 2026-04-25)',
        DATE_2026_04_25,
        'localStorage 기반 stores (chat-store, document-store 등)',
        '대용량 데이터 저장 시 QuotaExceededError 발생해도 silent fail. try-catch + 사용자 알림 없음.',
        '1. 채팅/문서를 매우 많이 누적.\n2. localStorage 5~10MB 초과.\n3. setItem 호출 시 예외 발생하지만 UI에 표시 안 됨.',
        '데이터 손실 + 사용자가 모름. 다음 세션에서 일부 데이터 복원 안됨.',
        'try-catch로 QuotaExceededError 잡고 사용자에게 토스트/모달로 알림. 오래된 데이터 정리 옵션 제시.',
        '🟡 Medium',
    ],
    # BUG-006 (today found)
    [
        'TEST-397 (About), TEST-427 (Settings)',
        'Komi (QA 2026-04-25)',
        DATE_2026_04_25,
        'D1AboutView, D1SettingsView',
        '페이지에 <h1> 태그 누락. 페이지 제목 의미 마크업 없음.',
        '1. /design1/ko 또는 /design1/en 진입.\n2. 더보기 → 소개(About) 또는 하단 설정 클릭.\n3. document.querySelector("h1") → null.\n4. 다른 D1 뷰는 모두 <h1>로 마크업되어 있는데 이 둘만 누락.',
        '접근성(스크린리더) + SEO + 스타일 일관성 문제. 페이지 구조 파악이 어려움.',
        'About: 로고 div 외에 페이지 제목용 visually-hidden 또는 명시적 <h1> 추가. Settings: "설정" 헤더를 <h1>로 마크업.',
        '🟡 Medium',
    ],
    # BUG-007 (today found)
    [
        'TEST-249 (Agents UI EN copy)',
        'Komi (QA 2026-04-25)',
        DATE_2026_04_25,
        'D1AgentsView (built-in agents 카드)',
        '/design1/en 진입 시 페이지 chrome(헤더/CTA/섹션라벨)은 영어로 정상 노출되나, built-in 8개 에이전트 카드의 name + description은 한국어로 표시됨.',
        '1. /design1/en 진입.\n2. 더보기 → Agents 클릭.\n3. BUILT-IN 섹션의 카드 확인 → "번역가 / 전문 번역가입니다..." 한국어로 노출.\n4. agent-store.getDefaultAgents()가 마운트 시점 lang을 한 번만 평가하여 lang 변경에 반응 안 함.',
        '글로벌 사용자 혼란. "Agents" 페이지가 EN인데 카드만 KO → 일관성 깨짐.',
        '/en 진입 시 built-in agents의 name/description이 영어로 표시되어야 함. agent-store loadFromStorage가 lang 변경 감지하여 default agents 갱신하거나, 컴포넌트에서 useTranslation 기반 매핑.',
        '🟡 Medium',
    ],
]

gx = GraphExcel()
range_addr = f'B9:J{8 + len(bugs)}'
print(f'Patching {range_addr} with {len(bugs)} bug rows...')
result = gx._patch(
    f"/worksheets/Bug%20Report/range(address='{range_addr}')",
    {'values': bugs}
)
print(f'Done. Bug-004 ~ Bug-{4+len(bugs)-1} recorded.')
