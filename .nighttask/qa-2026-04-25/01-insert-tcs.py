"""
Insert 360 test cases into Test Checklist sheet (rows 103-462).
12 menus × 30 TC = 360.
Columns: A=ID (already filled), B=Date, C=Work Type, D=Category, E=Test Item, F=Function, G=How to Test
"""
import sys, os
sys.path.insert(0, '/Users/jesikroymin/Library/CloudStorage/OneDrive-MIN/Apps/Whichbusinesses')
from graph_excel import GraphExcel

MENUS = [
    ('Chat',         'D1ChatView',         '/design1/ko (default)'),
    ('Compare',      'D1CompareView',      '사이드바 모델 비교'),
    ('Documents',    'D1DocumentsView',    '사이드바 문서'),
    ('Models',       'D1ModelsView',       '더보기 → 모델'),
    ('Dashboard',    'D1DashboardView',    '더보기 → 대시보드'),
    ('Agents',       'D1AgentsView',       '더보기 → 에이전트'),
    ('Meeting',      'D1MeetingView',      '사이드바 회의'),
    ('DataSources',  'D1DataSourcesView',  '더보기 → 데이터 소스'),
    ('CostSavings',  'D1CostSavingsView',  '더보기 → 비용 절감'),
    ('Security',     'D1SecurityView',     '더보기 → 보안'),
    ('About',        'D1AboutView',        '더보기 → 소개'),
    ('Settings',     'D1SettingsView',     '하단 설정'),
]

# (subcategory, item_template, how_template)
UI_TC = [
    ('UI',  '{m} 페이지 h1 헤딩 정확히 렌더',
            '1. {nav} 진입.\n2. h1 텍스트 확인.\n✅ 한국어/영어 헤딩 일치.'),
    ('UI',  '{m} 한국어 카피 일치 (디자인 문서 기준)',
            '1. /design1/ko 진입 → {nav}.\n2. 카피 비교.\n✅ 디자인 문서와 100% 일치.'),
    ('UI',  '{m} 영어 카피 일치',
            '1. /design1/en 진입 → {nav}.\n2. 영문 카피 비교.\n✅ 디자인 문서와 일치.'),
    ('UI',  '{m} 디자인 토큰(bg #fafaf9 / accent #c65a3c) 적용',
            '1. {nav} 진입.\n2. background-color, accent 컬러 확인.\n✅ 토큰 일치.'),
    ('UI',  '{m} 폰트 (Pretendard/Geist) 적용',
            '1. ko: Pretendard, en: Geist.\n✅ font-family stack 정확.'),
    ('UI',  '{m} 모바일 ≤ 375px 레이아웃 깨짐 없음',
            '1. 375px viewport.\n2. 가로 스크롤 발생 없음.\n✅ 컨텐츠 정상.'),
    ('UI',  '{m} 데스크탑 ≥ 1280px 레이아웃',
            '1. 1280px+.\n2. 컨테이너 max-w 적용.\n✅ 중앙 정렬 OK.'),
    ('UI',  '{m} 빈 상태 메시지 정상',
            '1. 데이터 없는 상태 진입.\n✅ 적절한 빈 상태 카피 노출.'),
    ('UI',  '{m} 메타/카운트 표기',
            '1. N개 표기 부분 검사.\n✅ 정확한 숫자/단위.'),
    ('UI',  '{m} 아이콘/이모지 렌더 정상',
            '1. SVG/이모지 모두 노출.\n✅ 깨짐 없음.'),
]

INTER_TC = [
    ('Interaction', '{m} 주 CTA 클릭 동작',
                    '1. 주 액션 버튼 클릭.\n✅ 의도된 동작 발생.'),
    ('Interaction', '{m} 텍스트 입력 동작',
                    '1. 인풋/textarea 입력.\n✅ 글자 정상 반영.'),
    ('Interaction', '{m} 토글/체크박스 상태 변경',
                    '1. 토글 클릭.\n✅ 상태 즉시 반전.'),
    ('Interaction', '{m} 모달 열림/닫힘',
                    '1. 모달 트리거.\n2. ESC/오버레이 클릭.\n✅ 정상 close.'),
    ('Interaction', '{m} 다른 뷰 네비게이션 정상',
                    '1. 다른 메뉴 클릭.\n✅ 라우팅 OK.'),
    ('Interaction', '{m} 드롭다운/팝오버 정상',
                    '1. 드롭다운 클릭.\n✅ 외부클릭 시 닫힘.'),
    ('Interaction', '{m} 스크롤 영역 동작',
                    '1. 컨텐츠 스크롤.\n✅ overflow 정상.'),
    ('Interaction', '{m} 포커스 이동 (Tab/Esc)',
                    '1. Tab 키.\n✅ 포커스 스타일 노출.'),
    ('Interaction', '{m} 키보드 단축키 (Enter/Esc)',
                    '1. Enter/Esc.\n✅ 의도된 액션.'),
    ('Interaction', '{m} Hover 시각 피드백',
                    '1. 카드/버튼 hover.\n✅ 시각 변화.'),
]

SYS_TC = [
    ('System', '{m} 콘솔 에러 0건 (진입 시)',
               '1. 페이지 진입.\n2. DevTools 콘솔 검사.\n✅ error 0.'),
    ('System', '{m} 네트워크 호출 의도된 endpoint만',
               '1. Network 탭 모니터링.\n✅ 외부 미허가 호출 없음.'),
    ('System', '{m} localStorage read/write 정상',
               '1. localStorage 키 검사.\n✅ blend:/d1: 접두만 사용.'),
    ('System', '{m} IndexedDB 누수 없음',
               '1. IDB 사용량 확인.\n✅ 비정상 증가 없음.'),
    ('System', '{m} 렌더링 < 3s',
               '1. 페이지 로드 시간 측정.\n✅ 3초 이내.'),
]

SEC_TC = [
    ('Security', '{m} API 키 DOM 평문 노출 검사',
                 '1. DOM innerHTML grep.\n✅ sk- / AIza- 패턴 평문 없음.'),
    ('Security', '{m} API 키 console.log 누출 없음',
                 '1. 콘솔 grep.\n✅ 키 노출 0.'),
    ('Security', '{m} XSS injection 차단',
                 '1. 입력에 <script> 시도.\n✅ 텍스트로만 표시.'),
    ('Security', '{m} 외부 호출 화이트리스트만',
                 '1. fetch URL 검사.\n✅ openai/anthropic/google/deepseek/groq + self만.'),
    ('Security', '{m} URL query에 민감 데이터 없음',
                 '1. location.search 검사.\n✅ 키/토큰 미포함.'),
]

CATEGORY_BLOCKS = UI_TC + INTER_TC + SYS_TC + SEC_TC  # 30 TC

# Build rows: each row is [Date, Work Type, Category, Test Item, Function, How to Test]
# Excel columns B-G (skip A=ID which is already populated)
rows = []
for menu_name, comp, nav in MENUS:
    for sub, item_tpl, how_tpl in CATEGORY_BLOCKS:
        date_added = '2026-04-25'
        work_type  = '🟢 New Feature'  # design1 새 컴포넌트
        category   = f'D1 {menu_name}'
        test_item  = item_tpl.format(m=menu_name)
        function   = sub
        how_to     = how_tpl.format(m=menu_name, nav=nav)
        rows.append([date_added, work_type, category, test_item, function, how_to])

assert len(rows) == 360

# Excel range: B103:G462
gx = GraphExcel()
range_addr = f'B103:G{103 + len(rows) - 1}'
print(f'Patching {range_addr} with {len(rows)} rows...')
result = gx._patch(
    f"/worksheets/Test%20Checklist/range(address='{range_addr}')",
    {'values': rows}
)
print(f'Done. {len(rows)} TCs inserted at rows 103-{102+len(rows)}.')
print(f'Last 3 TC samples:')
for r in rows[-3:]:
    print(f'  {r[2]} | {r[3][:50]} | {r[4]}')
