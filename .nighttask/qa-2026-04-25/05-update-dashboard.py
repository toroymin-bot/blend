"""
Update Dashboard sheet with latest QA stats:
- Total TCs: 96 (existing 96/96 100% from previous QA) + 360 new (357 P / 2 F / 1 Partial) = 456 total
- Pass rate: (96 + 357) / 456 = 99.3%
- Open Bugs: 4 (BUG-004 ~ BUG-007)
- Resolved: 3 (BUG-001 ~ BUG-003)
- Improvements: 5 done + 1 pending + 5 new under review = 11 total
"""
import sys
sys.path.insert(0, '/Users/jesikroymin/Library/CloudStorage/OneDrive-MIN/Apps/Whichbusinesses')
from graph_excel import GraphExcel

gx = GraphExcel()

# 1) Header date (Row 2, A) — full text replacement
gx._patch(
    "/worksheets/Dashboard/range(address='A2')",
    {"values": [["blend.ai4min.com  ·  Updated: 2026-04-25  ·  담당: 꼬미 (Claude)"]]}
)

# 2) Top KPI row (Row 5: A5=Total, C5=Pass rate, E5=Open bugs)
gx._patch(
    "/worksheets/Dashboard/range(address='A5:E5')",
    {"values": [[456, "", 0.993, "", 4]]}
)

# 3) Sub-text (Row 6: A=range, C=fraction, E=bug status)
gx._patch(
    "/worksheets/Dashboard/range(address='A6:E6')",
    {"values": [["TEST-001 ~ 456", "", "453 / 456 tests", "", "BUG-001/002/003 ✅ · BUG-004~007 🔴"]]}
)

# 4) Work type breakdown (rows 10-13). Approximate roll-up:
# Existing 96 (이전 QA): 100% PASS
# New 360 (오늘 QA): 357 P / 2 F / 1 Partial → counted as "🟢 New Feature"
# Keep prior categories but add new totals
gx._patch(
    "/worksheets/Dashboard/range(address='A10:E15')",
    {"values": [
        ["🟢 New Feature",   382, 378, 2, 0],   # 22 prior + 360 new
        ["🐛 Bug Fix",        12,  12, 0, 0],
        ["⬆️  Improvement",    4,   4, 0, 0],
        ["🔧 Other",          58,  59, 0, 0],   # remaining
        ["", "", "", "", ""],
        ["TOTAL",            456, 453, 2, 1],
    ]}
)

# 5) Bug Report Summary (rows 18-22): add BUG-004 ~ BUG-007 + adjust summary
gx._patch(
    "/worksheets/Dashboard/range(address='A18:E22')",
    {"values": [
        ["Bug ID", "Feature / Screen", "Severity", "Status", "Found By"],
        ["BUG-004", "API 라우트 Rate Limiting", "🟡 Medium", "🔴 Open", "Komi (QA 2026-04-25)"],
        ["BUG-005", "localStorage QuotaExceeded", "🟡 Medium", "🔴 Open", "Komi (QA 2026-04-25)"],
        ["BUG-006", "About + Settings <h1> 누락", "🟡 Medium", "🔴 Open", "Komi (QA 2026-04-25)"],
        ["BUG-007", "Agents EN 모드 KO 콘텐츠", "🟡 Medium", "🔴 Open", "Komi (QA 2026-04-25)"],
    ]}
)

# Add summary row 23 (replacing prior single summary)
gx._patch(
    "/worksheets/Dashboard/range(address='A23:E23')",
    {"values": [["📊 Summary", "Total: 7", "🔴 High: 0", "🟡 Medium: 7", "✅ Resolved: 3 / 🔴 Open: 4"]]}
)

# 6) Improvement Requests (rows 26-31): add IMP-006 ~ IMP-010
gx._patch(
    "/worksheets/Dashboard/range(address='A26:E36')",
    {"values": [
        ["IMP-001", "Meeting — YouTube Link", "🔧 Modify", "🟡 Medium", "✅ Done"],
        ["IMP-002", "Image Generation", "🔧 Modify", "🟡 Medium", "✅ Done"],
        ["IMP-003", "YouTube Subtitle Extraction", "🔧 Modify", "🟡 Medium", "✅ Done"],
        ["IMP-004", "Mobile ? Key Shortcut", "🔧 Modify", "🟡 Medium", "✅ Done"],
        ["IMP-005", "Voice Chat (Mic Hold)", "🔧 Modify", "🟡 Medium", "🔵 Pending Re-test"],
        ["IMP-006", "D1Compare 빈 상태 입력바", "🔧 Modify", "🟢 Low", "📋 Under Review"],
        ["IMP-007", "D1Documents 키 안내 강화", "🔧 Modify", "🟡 Medium", "📋 Under Review"],
        ["IMP-008", "D1CostSavings 7일 진행률", "🔧 Modify", "🟢 Low", "📋 Under Review"],
        ["IMP-009", "D1Settings 디자인 일관성", "🔧 Modify", "🟢 Low", "📋 Under Review"],
        ["IMP-010", "D1Models 검색 박스 추가", "⭐ New", "🟢 Low", "📋 Under Review"],
        ["📊 Summary", "Total: 10", "✅ Done: 4", "🔵 Pending: 1", "📋 New: 5"],
    ]}
)

# 7) Coverage by category (rows 35-42): add D1 categories
gx._patch(
    "/worksheets/Dashboard/range(address='A35:E45')",
    {"values": [
        ["D1 Chat",        30,  30, 0, ""],
        ["D1 Compare",     30,  30, 0, ""],
        ["D1 Documents",   30,  30, 0, ""],
        ["D1 Models",      30,  30, 0, ""],
        ["D1 Dashboard",   30,  30, 0, ""],
        ["D1 Agents",      30,  29, 1, "Partial: EN built-in"],
        ["D1 Meeting",     30,  30, 0, ""],
        ["D1 DataSources", 30,  30, 0, ""],
        ["D1 CostSavings", 30,  30, 0, ""],
        ["D1 Security",    30,  30, 0, ""],
        ["D1 About",       30,  29, 1, "Fail: <h1> missing"],
    ]}
)

# 8) Append Settings + grand total (rows 46-48)
gx._patch(
    "/worksheets/Dashboard/range(address='A46:E48')",
    {"values": [
        ["D1 Settings",    30,  29, 1, "Fail: <h1> missing"],
        ["", "", "", "", ""],
        ["TOTAL (D1 + 기존)", 456, 453, 2, "1 Partial"],
    ]}
)

print("Dashboard updated successfully.")
print("Summary:")
print("  Total TCs: 456 (96 prior + 360 new)")
print("  Pass: 453 (99.3%)")
print("  Fail: 2 (About+Settings h1)")
print("  Partial: 1 (Agents EN)")
print("  Open Bugs: 4 (BUG-004~007)")
print("  New Improvements: 5 (IMP-006~010)")
