// ============================================================
// AI/Cloud Cost Report - Google Apps Script
// 매일 아침 8:30 API 비용 통계 이메일 발송
// Espresso Cloud Billing Bot 포맷 참조
// ============================================================
// 스크립트 속성:
//   OPENAI_ADMIN_KEY      : sk-admin-xxxxx (platform.openai.com/settings/organization/admin-keys)
//   ANTHROPIC_ADMIN_KEY   : sk-ant-admin-xxxxx (console.anthropic.com/settings/admin-keys)
//   GCP_PROJECT_ID        : BigQuery 프로젝트 ID (예: my-project-123)
//   GCP_BILLING_DATASET   : BigQuery 결제 내보내기 데이터셋 이름 (예: billing_export)

var RECIPIENT = 'roy@ai4min.com';

function sendCostReport() {
  try {
    Logger.log('=== AI Cost Report Start ===');
    var openai = fetchOpenAICosts();
    var anthropic = fetchAnthropicCosts();
    var gemini = fetchGeminiCosts();
    var html = buildCostHTML(openai, anthropic, gemini);
    var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    GmailApp.sendEmail(RECIPIENT, '[Blend Cost Report] ' + today, '', {htmlBody:html, name:'Blend Cost Bot', charset:'UTF-8'});
    Logger.log('Cost report sent!');
  } catch(e) {
    Logger.log('Error: ' + e.message);
    GmailApp.sendEmail(RECIPIENT, '[Blend Cost] Error', 'Error: ' + e.message);
  }
}

// ============================================================
// OpenAI Costs (Admin API)
// ============================================================
function fetchOpenAICosts() {
  var key = PropertiesService.getScriptProperties().getProperty('OPENAI_ADMIN_KEY');
  if (!key) return {available:false, provider:'OpenAI', reason:'OPENAI_ADMIN_KEY not set'};

  var now = Math.floor(Date.now()/1000);
  var day30 = now - 86400*30;

  try {
    var url = 'https://api.openai.com/v1/organization/costs?start_time=' + day30 + '&bucket_width=1d&limit=31';
    var res = UrlFetchApp.fetch(url, {headers:{'Authorization':'Bearer '+key}, muteHttpExceptions:true});
    var json = JSON.parse(res.getContentText());
    if (json.error) return {available:false, provider:'OpenAI', reason:json.error.message};

    var buckets = (json.data || []).sort(function(a,b){return a.start_time - b.start_time;});
    var day1ts = now - 86400;
    var day7ts = now - 86400*7;
    var today_cost = 0, week_cost = 0, month_cost = 0;

    // 이번달 계산
    var nowDate = new Date();
    var monthStart = Math.floor(new Date(nowDate.getFullYear(), nowDate.getMonth(), 1).getTime()/1000);
    var thismonth_cost = 0;

    var daily = [];
    buckets.forEach(function(b) {
      var cost = 0;
      (b.results||[]).forEach(function(r) { cost += (r.amount||{}).value || 0; });
      var ts = b.start_time || 0;
      daily.push({
        date: Utilities.formatDate(new Date(ts*1000), Session.getScriptTimeZone(), 'MM/dd'),
        cost: cost
      });
      month_cost += cost;
      if (ts >= day7ts) week_cost += cost;
      if (ts >= day1ts) today_cost += cost;
      if (ts >= monthStart) thismonth_cost += cost;
    });

    return {
      available: true, provider: 'OpenAI', icon: '&#x1F9E0;', color: '#10a37f',
      today: today_cost, week: week_cost, month: month_cost, thismonth: thismonth_cost,
      daily: daily.slice(-7)
    };
  } catch(e) {
    return {available:false, provider:'OpenAI', reason:e.message};
  }
}

// ============================================================
// Anthropic Costs (Admin API)
// ============================================================
function fetchAnthropicCosts() {
  var key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_ADMIN_KEY');
  if (!key) return {available:false, provider:'Anthropic', reason:'ANTHROPIC_ADMIN_KEY not set'};

  var now = new Date();
  var day30ago = new Date(now.getTime() - 30*86400000);
  var startAt = day30ago.toISOString().split('.')[0]+'Z';
  var endAt = now.toISOString().split('.')[0]+'Z';

  try {
    var url = 'https://api.anthropic.com/v1/organizations/cost_report?starting_at=' + startAt + '&ending_at=' + endAt + '&bucket_width=1d&limit=31';
    var res = UrlFetchApp.fetch(url, {headers:{'x-api-key':key, 'anthropic-version':'2023-06-01'}, muteHttpExceptions:true});
    var json = JSON.parse(res.getContentText());
    if (json.error) return {available:false, provider:'Anthropic', reason:json.error.message};

    var buckets = (json.data || []).sort(function(a,b){
      return new Date(a.starting_at).getTime() - new Date(b.starting_at).getTime();
    });
    var day1ts = now.getTime() - 86400000;
    var day7ts = now.getTime() - 7*86400000;
    var monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    var today_cost = 0, week_cost = 0, month_cost = 0, thismonth_cost = 0;
    var daily = [];

    buckets.forEach(function(b) {
      var cost = 0;
      (b.costs||[]).forEach(function(c) { cost += parseFloat(c.amount||0)/100; });
      var ts = new Date(b.starting_at||0).getTime();
      daily.push({
        date: Utilities.formatDate(new Date(ts), Session.getScriptTimeZone(), 'MM/dd'),
        cost: cost
      });
      month_cost += cost;
      if (ts >= day7ts) week_cost += cost;
      if (ts >= day1ts) today_cost += cost;
      if (ts >= monthStart) thismonth_cost += cost;
    });

    return {
      available: true, provider: 'Anthropic', icon: '&#x1F4A1;', color: '#d4785a',
      today: today_cost, week: week_cost, month: month_cost, thismonth: thismonth_cost,
      daily: daily.slice(-7)
    };
  } catch(e) {
    return {available:false, provider:'Anthropic', reason:e.message};
  }
}

// ============================================================
// Google Gemini Costs (BigQuery Billing Export)
// 사전 조건:
//   1. GCP 콘솔 → 결제 → 결제 내보내기 → BigQuery로 표준 사용 내보내기 활성화
//   2. GCP_PROJECT_ID, GCP_BILLING_DATASET 스크립트 속성 설정
//   3. appsscript.json에 bigquery.readonly 스코프 추가 (아래 참조)
// ============================================================
function fetchGeminiCosts() {
  var projectId = PropertiesService.getScriptProperties().getProperty('GCP_PROJECT_ID');
  var dataset   = PropertiesService.getScriptProperties().getProperty('GCP_BILLING_DATASET');
  if (!projectId) return {available:false, provider:'Google Gemini', reason:'GCP_PROJECT_ID not set'};
  if (!dataset)   return {available:false, provider:'Google Gemini', reason:'GCP_BILLING_DATASET not set'};

  try {
    var token = ScriptApp.getOAuthToken();
    var now = new Date();
    var tz = Session.getScriptTimeZone();

    // 서비스 필터: Vertex AI (Gemini API) + Generative Language API (Google AI Studio)
    var query =
      'SELECT FORMAT_DATE("%Y-%m-%d", DATE(usage_start_time, "' + tz + '")) AS dt, ' +
      'SUM(cost) AS cost ' +
      'FROM `' + projectId + '.' + dataset + '.gcp_billing_export_v1_*` ' +
      'WHERE (LOWER(service.description) LIKE "%vertex ai%" ' +
      '    OR LOWER(service.description) LIKE "%generative language%") ' +
      '  AND DATE(usage_start_time, "' + tz + '") >= ' +
      '      DATE_SUB(CURRENT_DATE("' + tz + '"), INTERVAL 30 DAY) ' +
      'GROUP BY 1 ORDER BY 1';

    var url = 'https://bigquery.googleapis.com/bigquery/v2/projects/' + projectId + '/queries';
    var res = UrlFetchApp.fetch(url, {
      method: 'POST',
      headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'},
      payload: JSON.stringify({query: query, useLegacySql: false, timeoutMs: 30000}),
      muteHttpExceptions: true
    });

    var json = JSON.parse(res.getContentText());
    if (json.error)      return {available:false, provider:'Google Gemini', reason:json.error.message};
    if (!json.jobComplete) return {available:false, provider:'Google Gemini', reason:'BigQuery query timeout — retry later'};

    var rows = json.rows || [];
    var day1agoStr    = Utilities.formatDate(new Date(now.getTime() - 86400000), tz, 'yyyy-MM-dd');
    var day7agoStr    = Utilities.formatDate(new Date(now.getTime() - 7*86400000), tz, 'yyyy-MM-dd');
    var monthStartStr = Utilities.formatDate(new Date(now.getFullYear(), now.getMonth(), 1), tz, 'yyyy-MM-dd');

    var today_cost = 0, week_cost = 0, month_cost = 0, thismonth_cost = 0;
    var daily = [];

    rows.forEach(function(r) {
      var dateStr = r.f[0].v;                              // "2024-01-15"
      var cost    = parseFloat(r.f[1].v || 0);
      daily.push({
        date: dateStr.substring(5).replace('-', '/'),      // "01/15"
        cost: cost
      });
      month_cost += cost;
      if (dateStr >= day7agoStr)    week_cost     += cost;
      if (dateStr >= day1agoStr)    today_cost    += cost;
      if (dateStr >= monthStartStr) thismonth_cost += cost;
    });

    return {
      available: true, provider: 'Google Gemini', icon: '&#x1F300;', color: '#4285f4',
      today: today_cost, week: week_cost, month: month_cost, thismonth: thismonth_cost,
      daily: daily.slice(-7)
    };
  } catch(e) {
    return {available:false, provider:'Google Gemini', reason:e.message};
  }
}

// ============================================================
// HTML 이메일 빌더 - Espresso Cloud Billing Bot 포맷
// ============================================================
function buildCostHTML(openai, anthropic, gemini) {
  var tz = Session.getScriptTimeZone();
  var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var timeStr = Utilities.formatDate(new Date(), tz, 'HH:mm');

  var all = [openai, anthropic, gemini];
  var providers   = all.filter(function(p){return p.available;});
  var unavailable = all.filter(function(p){return !p.available;});

  // ---- 합산 ----
  var totalToday=0, totalWeek=0, totalMonth=0, totalThisMonth=0;
  providers.forEach(function(p){
    totalToday    += p.today;
    totalWeek     += p.week;
    totalMonth    += p.month;
    totalThisMonth += p.thismonth;
  });

  // ---- 일 평균, 주 평균, 월 예상 ----
  var dayAvg  = totalMonth / 30;
  var weekAvg = totalMonth / 4.3;
  var nowDate = new Date();
  var daysInMonth = new Date(nowDate.getFullYear(), nowDate.getMonth()+1, 0).getDate();
  var dayOfMonth  = nowDate.getDate();
  var projected   = dayOfMonth > 0 ? (totalThisMonth / dayOfMonth) * daysInMonth : 0;

  // ============================================================
  // 섹션 1: 헤더
  // ============================================================
  var header =
    '<div style="padding:14px 16px 10px 16px;border-bottom:3px solid #1a1a2e;">' +
    '<div style="font-size:11px;color:#888;margin:0;padding:0;line-height:1.4;">' + today + ' ' + timeStr + '</div>' +
    '<div style="font-size:22px;font-weight:800;color:#1a1a2e;margin:2px 0 0 0;line-height:1.2;">Blend Cost Report</div>' +
    '</div>';

  // ============================================================
  // 섹션 2: 기간별 누적 비용 (2x2 그리드)
  // ============================================================
  var periodCards =
    sectionTitle('&#x1F4C8;', '기간별 누적 비용') +
    '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">' +
    '<tr>' +
    periodCard('최근 24시간', '$'+totalToday.toFixed(2), '#3b82f6', '#eff6ff') +
    periodCard('최근 7일',    '$'+totalWeek.toFixed(2),  '#10b981', '#f0fdf4') +
    '</tr><tr>' +
    periodCard('최근 30일',   '$'+totalMonth.toFixed(2), '#ef4444', '#fef2f2') +
    periodCard('이번 달',     '$'+totalThisMonth.toFixed(2), '#8b5cf6', '#faf5ff') +
    '</tr></table>';

  // ============================================================
  // 섹션 3: 서비스별 비용 (가로 바차트)
  // ============================================================
  var serviceRows = '';
  var maxService = 0;
  providers.forEach(function(p){ if(p.month > maxService) maxService = p.month; });
  if (maxService === 0) maxService = 0.01;

  providers.forEach(function(p) {
    var pct  = totalMonth > 0 ? ((p.month/totalMonth)*100).toFixed(1) : '0.0';
    var barW = Math.round((p.month/maxService)*100);
    serviceRows +=
      '<tr style="border-bottom:1px solid #f0f0f0;">' +
      '<td style="padding:10px 12px;width:90px;font-size:13px;color:#333;white-space:nowrap;">' +
        p.icon + ' ' + p.provider +
      '</td>' +
      '<td style="padding:10px 4px;width:68px;text-align:right;font-size:13px;font-weight:700;color:'+p.color+';white-space:nowrap;">$'+p.month.toFixed(3)+'</td>' +
      '<td style="padding:10px 8px;">' +
        '<div style="background:#f0f0f0;border-radius:4px;height:10px;overflow:hidden;">' +
          '<div style="background:'+p.color+';height:10px;width:'+barW+'%;border-radius:4px;"></div>' +
        '</div>' +
      '</td>' +
      '<td style="padding:10px 8px;width:40px;text-align:right;font-size:12px;color:#888;white-space:nowrap;">'+pct+'%</td>' +
      '</tr>';
  });

  // 미설정/오류 서비스 행
  unavailable.forEach(function(p) {
    serviceRows +=
      '<tr style="border-bottom:1px solid #f0f0f0;">' +
      '<td style="padding:10px 12px;font-size:13px;color:#bbb;" colspan="4">&#x2610; ' + p.provider + ' — ' + p.reason + '</td>' +
      '</tr>';
  });

  var serviceSection =
    sectionTitle('&#x1F527;', '서비스별 비용 (최근 30일)') +
    '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">' +
    serviceRows + '</table>';

  // ============================================================
  // 섹션 4: 일별 추이 (최근 7일, 가로 바차트)
  // ============================================================
  var dayMap = {};
  providers.forEach(function(p) {
    (p.daily||[]).forEach(function(d) {
      if (!dayMap[d.date]) dayMap[d.date] = 0;
      dayMap[d.date] += d.cost;
    });
  });
  var sortedDays = Object.keys(dayMap).sort();
  var maxDay = 0;
  sortedDays.forEach(function(k){ if(dayMap[k]>maxDay) maxDay=dayMap[k]; });
  if (maxDay === 0) maxDay = 0.01;

  var dailyRows = '';
  sortedDays.slice(-7).forEach(function(date) {
    var cost = dayMap[date];
    var barW = Math.round((cost/maxDay)*100);
    dailyRows +=
      '<tr style="border-bottom:1px solid #f5f5f5;">' +
      '<td style="padding:8px 12px;width:42px;font-size:12px;color:#666;white-space:nowrap;">'+date+'</td>' +
      '<td style="padding:8px 8px;">' +
        '<div style="background:#e8f4fd;border-radius:4px;height:14px;overflow:hidden;">' +
          '<div style="background:#3b82f6;height:14px;width:'+barW+'%;border-radius:4px;"></div>' +
        '</div>' +
      '</td>' +
      '<td style="padding:8px 12px;width:62px;text-align:right;font-size:12px;font-weight:600;color:#1e3a5f;white-space:nowrap;">$'+cost.toFixed(4)+'</td>' +
      '</tr>';
  });

  var dailySection =
    sectionTitle('&#x1F4C5;', '일별 추이 (최근 7일)') +
    '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">' +
    dailyRows + '</table>';

  // ============================================================
  // 섹션 5: 통계 및 예측
  // ============================================================
  var statsSection =
    sectionTitle('&#x1F4C8;', '통계 및 예측') +
    '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">' +
    statRow('일 평균', '$'+dayAvg.toFixed(4)) +
    statRow('주 평균', '$'+weekAvg.toFixed(4)) +
    statRow('월 누적 (30일)', '$'+totalMonth.toFixed(4)) +
    statRow('이번달 누적', '$'+totalThisMonth.toFixed(4)) +
    statRow('이번달 예상', '<span style="color:#ef4444;font-weight:700;">$'+projected.toFixed(4)+'</span>') +
    statRow('최대 비중', providers.length > 0 ? (function(){
      var maxP = providers.reduce(function(a,b){return a.month>b.month?a:b;}, providers[0]);
      var pct  = totalMonth>0 ? ((maxP.month/totalMonth)*100).toFixed(1) : '0.0';
      return '<span style="color:'+maxP.color+';">'+maxP.provider+'</span> '+pct+'%';
    })() : 'N/A') +
    '</table>';

  // ============================================================
  // 푸터
  // ============================================================
  var footer =
    '<div style="padding:10px 16px;text-align:center;font-size:10px;color:#bbb;border-top:1px solid #eee;">' +
    'AI Cost Bot &nbsp;|&nbsp; GAS &nbsp;|&nbsp; <a href="https://ai4min.atlassian.net/wiki/spaces/Blend" style="color:#bbb;text-decoration:none;">Confluence</a>' +
    '</div>';

  return '<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>' +
    '<body style="margin:0;padding:12px;background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">' +
    '<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.1);">' +
    header + periodCards + serviceSection + dailySection + statsSection + footer +
    '</div></body></html>';
}

// ---- 헬퍼 함수 ----

function sectionTitle(icon, text) {
  return '<div style="padding:14px 16px 6px;background:#fafafa;border-top:1px solid #eee;">' +
    '<span style="font-size:14px;font-weight:700;color:#333;">' + icon + '&nbsp;' + text + '</span>' +
    '</div>';
}

function periodCard(label, value, color, bg) {
  return '<td style="width:50%;padding:4px;">' +
    '<div style="background:'+bg+';border-radius:10px;padding:12px 14px;text-align:center;">' +
    '<div style="font-size:22px;font-weight:800;color:'+color+';">'+value+'</div>' +
    '<div style="font-size:11px;color:#777;margin-top:2px;">'+label+'</div>' +
    '</div></td>';
}

function statRow(label, value) {
  return '<tr style="border-bottom:1px solid #f5f5f5;">' +
    '<td style="padding:9px 16px;font-size:13px;color:#555;">'+label+'</td>' +
    '<td style="padding:9px 16px;font-size:13px;font-weight:700;color:#222;text-align:right;">'+value+'</td>' +
    '</tr>';
}

// ============================================================
// 유틸리티 함수
// ============================================================
function testCostReport() { sendCostReport(); }

function createCostTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'sendCostReport') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendCostReport').timeBased().everyDays(1).atHour(8).nearMinute(35).create();
  Logger.log('Cost report trigger created: 8:35 AM daily');
}

function setupKeys() {
  // 아래 줄의 주석을 제거하고 실제 키를 입력한 후 실행하세요. 이후 이 함수를 삭제하세요.
  // PropertiesService.getScriptProperties().setProperty('OPENAI_ADMIN_KEY', 'sk-admin-xxxxx');
  // PropertiesService.getScriptProperties().setProperty('ANTHROPIC_ADMIN_KEY', 'sk-ant-admin-xxxxx');
  // PropertiesService.getScriptProperties().setProperty('GCP_PROJECT_ID', 'my-project-123');
  // PropertiesService.getScriptProperties().setProperty('GCP_BILLING_DATASET', 'billing_export');
  Logger.log('Uncomment the lines above, add your keys, and run again');
}
