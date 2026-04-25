"""
Record improvement requests to Improvement Requests sheet (rows 13-17 = IMP-006~010).
Columns B-J: Date, Requested By, Request Type, Feature/Screen, Request Detail, Reason, Expected Outcome, Priority, Status
A column (Request ID) already populated.
"""
import sys
sys.path.insert(0, '/Users/jesikroymin/Library/CloudStorage/OneDrive-MIN/Apps/Whichbusinesses')
from graph_excel import GraphExcel

DATE = 46137  # 2026-04-25 serial

imps = [
    # IMP-006
    [DATE, 'Komi (QA 2026-04-25)', '🔧 Modify', 'D1CompareView — 빈 상태',
     '모델 선택 전 입력바가 비활성 상태로 화면 하단에 노출. "먼저 모델을 2개 이상 선택하세요" placeholder만 표시 → 모바일에서 입력바 자체가 시선 분산 + 오해 가능.',
     '신규 사용자가 입력 가능한 영역으로 오해할 수 있음. 디자인 의도("선택 후 사용")가 명확하지 않음.',
     '모델 미선택 시 입력바 자체를 숨기거나 dim 처리. 모델 선택 후에만 활성화하여 단계 진행감 부여.',
     '🟢 Low', '📋 Under Review'],
    # IMP-007
    [DATE, 'Komi (QA 2026-04-25)', '🔧 Modify', 'D1DocumentsView — 임베딩 키 없음 안내',
     '"API 키 없음 — OpenAI 또는 Google 키를 설정하면 자동 분석" 안내가 페이지 상단에 textFaint(매우 흐림)로 노출 → 모바일에서 거의 안 보임.',
     '키 미설정 사용자가 파일 업로드 후 분석 안 되는 이유를 모름.',
     '안내 강조 (accentSoft 배경 또는 inline link "키 설정하기" 버튼). 또는 키 없을 때 dropzone 위에 더 눈에 띄게.',
     '🟡 Medium', '📋 Under Review'],
    # IMP-008
    [DATE, 'Komi (QA 2026-04-25)', '🔧 Modify', 'D1CostSavingsView — 7일 미만 상태',
     '7일 미만 사용 시 "아직 충분한 사용 기록이 없어요 / 7일 이상 사용하면..." 빈 상태만 표시. 진행률 없음.',
     '사용자가 "지금 며칠 사용 중인지" 모름 → 도달 시점 예측 불가.',
     '"현재 X일 사용 중 (7일 도달까지 N일)" 같은 진행 카운터 추가. 또는 progress bar (X/7).',
     '🟢 Low', '📋 Under Review'],
    # IMP-009
    [DATE, 'Komi (QA 2026-04-25)', '🔧 Modify', 'D1SettingsView — 디자인 토큰 일관성',
     'D1SettingsView가 다른 D1 뷰와 디자인 톤이 약간 다름 (별도 컴포넌트로 작성). 동일 토큰(bg #fafaf9, accent #c65a3c, Pretendard) 사용 여부 검토 필요.',
     '11페이지 리디자인의 마지막 일관성 갭. 사용자가 Settings 진입 시 톤 변화 느낌.',
     '다른 D1 뷰와 동일한 hero/section 패턴 적용. 또는 "다음 라운드"로 별도 리디자인.',
     '🟢 Low', '📋 Under Review'],
    # IMP-010
    [DATE, 'Komi (QA 2026-04-25)', '⭐ New Feature', 'D1ModelsView — 검색 박스',
     '86개 모델 표시. 필터 칩(전체/무료/비전/추론/긴 문서)만으로 특정 모델 찾기 어려움.',
     '사용자가 특정 모델명을 알면 빨리 찾을 수 있어야 함 (예: "haiku", "deepseek").',
     '필터 칩 위에 검색 input 추가. displayName + description 매칭. 실시간 필터.',
     '🟢 Low', '📋 Under Review'],
]

gx = GraphExcel()
range_addr = f'B13:J{12 + len(imps)}'
print(f'Patching {range_addr} with {len(imps)} improvement rows...')
result = gx._patch(
    f"/worksheets/Improvement%20Requests/range(address='{range_addr}')",
    {'values': imps}
)
print(f'Done. IMP-006 ~ IMP-{6+len(imps)-1} recorded.')
