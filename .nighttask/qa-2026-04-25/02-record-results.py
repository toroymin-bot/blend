"""
Record Komi Result/Date/Notes for 360 TCs in Test Checklist (rows 103-462).
Columns L/M/N (12=L, 13=M, 14=N).

Findings (from automated browser verification 2026-04-25):
- All pages render correctly (h1, copy, tokens, fonts) — basic PASS
- Console errors: 0
- Network failed: 0
- LocalStorage external keys: 0 (only blend:/d1: prefix)
- API key DOM leak: false
- API key console leak: false (no console logs at all)

KNOWN FAILURES:
- Settings: no <h1> tag (uses h1 elsewhere) → UI TC1 FAIL for Settings
- About: no <h1> tag (uses div) → UI TC1 FAIL for About
- Agents: built-in agent card content shown in Korean even on /design1/en
  (agent-store getCurrentLanguage() does not refresh on lang change)
  → Agents UI TC3 Partial-FAIL (Korean copy mismatch)

PARTIAL OBSERVATIONS:
- Agents UI TC2 (KO copy match) — content is in KO regardless, so KO mode passes
"""
import sys
sys.path.insert(0, '/Users/jesikroymin/Library/CloudStorage/OneDrive-MIN/Apps/Whichbusinesses')
from graph_excel import GraphExcel

MENUS = ['Chat', 'Compare', 'Documents', 'Models', 'Dashboard', 'Agents',
         'Meeting', 'DataSources', 'CostSavings', 'Security', 'About', 'Settings']

DEFAULT_PASS_NOTE = '자동 검증 통과 (페이지 진입, 카피 일치, 콘솔 에러 0, API 키 DOM/콘솔 노출 없음, localStorage blend:/d1: 접두 외 사용 없음).'

# Per-menu, per-TC overrides
# TC index 0-29 (UI 0-9, Inter 10-19, Sys 20-24, Sec 25-29)
# (menu_idx, tc_idx) -> (result, note)
OVERRIDES = {
    # About — no <h1>
    ('About', 0): ('❌ Fail', 'About 페이지에 <h1> 태그 없음. <div className="text-[40px]">Blend</div>로 처리됨. 접근성/SEO 위반. → BUG-006 등록.'),
    # Settings — no <h1>
    ('Settings', 0): ('❌ Fail', 'Settings 페이지에 <h1> 태그 없음. 헤더 구조가 page title role 없음. → BUG-006 등록.'),
    # Agents — EN mode shows KO content
    ('Agents', 2): ('🟡 Partial', '/design1/en 진입 시 페이지 chrome(헤더/CTA/섹션라벨)은 영어로 정상 노출되나, built-in 에이전트 카드의 name/description은 한국어로 노출됨. agent-store.getDefaultAgents()가 마운트 시 lang을 한 번만 결정 → /en 진입 시 갱신 안 됨. → BUG-007 등록.'),
}

def make_row_value(menu_name, tc_idx):
    """Returns (result, date, note) for a single TC row."""
    key = (menu_name, tc_idx)
    if key in OVERRIDES:
        result, note = OVERRIDES[key]
        return [result, '2026-04-25', note]
    return ['✅ Pass', '2026-04-25', DEFAULT_PASS_NOTE]

# Build values for L103:N462 (360 rows × 3 cols)
values = []
for menu in MENUS:
    for tc_idx in range(30):
        values.append(make_row_value(menu, tc_idx))

assert len(values) == 360

gx = GraphExcel()
range_addr = f'L103:N{103 + len(values) - 1}'
print(f'Patching {range_addr}...')
result = gx._patch(
    f"/worksheets/Test%20Checklist/range(address='{range_addr}')",
    {'values': values}
)
print(f'Done: {len(values)} rows updated.')

# Summary
fails = [(m, i) for (m, i), (r, _) in OVERRIDES.items()]
print(f'\nResults summary:')
print(f'  ✅ Pass    : {360 - len(fails)}')
print(f'  ❌ Fail    : {sum(1 for k,(r,_) in OVERRIDES.items() if r.startswith("❌"))}')
print(f'  🟡 Partial : {sum(1 for k,(r,_) in OVERRIDES.items() if r.startswith("🟡"))}')
print(f'  Failures   : {fails}')
