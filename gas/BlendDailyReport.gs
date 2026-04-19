// [2026-04-10 12:15] GAS 에디터 드롭다운 기본 선택이 getAvailableModel이라 직접 선택 불가
// 파일 최상단에 runAll 추가 → 첫 번째 함수로 자동 선택됨
// [2026-04-10 13:52] 각 비용 API 응답 확인
// function runAll() { debugCosts(); }

// [2026-04-10 14:40] Anthropic 버그 수정 확인 후 실제 발송 복원
// [2026-04-11 10:30] Web App 배포 후 curl 방식으로 전환 — runAll은 dev report만 담당
// function runAll() { setTodayData(); sendBlendDailyReport(); sendCostReport(); } // 구버전 (both)
function runAll() { setTodayData(); sendBlendDailyReport(); }  // dev report only (blend-morning-report용)
function runDevReport() { setTodayData(); sendBlendDailyReport(); }
// [2026-04-10 13:50] Script Properties에 어떤 키가 설정됐는지 확인 (값은 노출 안 함)
function checkKeys() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var keys = Object.keys(props);
  Logger.log('설정된 키 목록: ' + JSON.stringify(keys));
  Logger.log('OPENAI_ADMIN_KEY: ' + (props['OPENAI_ADMIN_KEY'] ? '설정됨 (길이:' + props['OPENAI_ADMIN_KEY'].length + ')' : '❌ 없음'));
  Logger.log('ANTHROPIC_ADMIN_KEY: ' + (props['ANTHROPIC_ADMIN_KEY'] ? '설정됨 (길이:' + props['ANTHROPIC_ADMIN_KEY'].length + ')' : '❌ 없음'));
  Logger.log('GCP_PROJECT_ID: ' + (props['GCP_PROJECT_ID'] ? '설정됨: ' + props['GCP_PROJECT_ID'] : '❌ 없음'));
  Logger.log('GEMINI_API_KEY: ' + (props['GEMINI_API_KEY'] ? '설정됨 (길이:' + props['GEMINI_API_KEY'].length + ')' : '❌ 없음'));
}

// [2026-04-10 13:00] 오늘 실제 개발 내용을 BLEND_REPORT_DATA에 저장
// blend-daily-dev가 GAS에 POST하지 않아 항상 기본값(Day7, 파일25개)이 표시되던 문제 해결
// 매일 blend-daily-dev 완료 후 이 데이터를 업데이트해야 함
// [2026-04-12 01:07] blend-daily-dev 자동 업데이트
// [2026-04-15 02:00] Day 12 업데이트 — 소스C 자체 테스트 5건 수정
// [2026-04-19] blend-daily-dev가 매일 이 함수 내용을 업데이트해서 최신 데이터 유지
// 수동 업데이트: GAS 에디터에서 setTodayData() 실행 후 sendBlendDailyReport() 실행
function setTodayData() {
  var data = {
    dayNumber: 16,
    files: 20,
    lines: 3766,
    features: 19,
    cost: '$0',
    newFeatures: [
      '💳 billing-view: Lifetime 플랜($29) + Toss/Xendit 결제 연동 + 이중통화(KRW/USD) + BYOK notice',
      '📊 dashboard-view: API Usage Breakdown 패널 신규 + 토큰 차트 재디자인 + formatDual() 이중통화',
      '🎙️ meeting-view: YouTube Whisper fallback + ASR 수동 붙여넣기 + 서버사이드 트랜스크립트',
      '🤖 agents-view: __auto__ → i18n 라벨 (AI 자동 선택 / Auto AI matching)',
      '🌐 locales ko/en: billing, agents, dashboard, savings, compare, plugins 26개 키 추가',
      '🔌 api/yt-transcript.js: Vercel serverless YouTube 트랜스크립트 + rate limit 10req/min',
      '📍 use-country.ts: 국가 감지 훅 (ipapi.co, KR/PH/other, 24h 캐시)'
    ],
    issues: [
      {issue: 'TEST-038 FAIL: toFixed(1) 소수점 표시 누락', solution: 'nighttask 24번 — Math.round() → toFixed(1) 복구 예정'},
      {issue: 'TEST-041 FAIL: BYOK 골드 스타일링 미적용', solution: 'nighttask 28번 빌링 i18n 작업 시 함께 처리'},
      {issue: 'TEST-045 FAIL: CTA 버튼 결제 섹션 스크롤 미작동', solution: 'onClick → scrollIntoView() 추가 예정'},
      {issue: 'TEST-046 FAIL: 모바일 툴바 ··· 접기 미구현', solution: 'chat-view.tsx MoreHorizontal 드롭다운 구현 예정'}
    ],
    tomorrowPlan: [
      'nighttask 24: toFixed(1) 소수점 복구 (TEST-038 fix)',
      'nighttask 25: 중복 모델별 비용 바 차트 제거',
      'nighttask 26: 대시보드 영문 헤더 i18n 적용',
      'nighttask 27: 토큰 차트 재디자인',
      'nighttask 28: 빌링 페이지 전체 i18n',
      'nighttask 29: 전체 페이지 i18n 감사',
      'nighttask 30: About Blend 메뉴 + 페이지 신규 (TEST-043 fix)'
    ],
    confluenceLinks: [
      {title: 'Blend 개발 일지 — 2026-04-18~19', url: 'https://ai4min.atlassian.net/wiki/spaces/Blend/pages/13664257'},
      {title: 'Blend 앱 개발 허브', url: 'https://ai4min.atlassian.net/wiki/spaces/Blend/pages/9371649'}
    ],
    githubLinks: [
      {title: '07db84e: billing/dashboard/meeting/agents/i18n', url: 'https://github.com/toroymin-bot/blend/commit/07db84e'}
    ],
    runStart: '11:00',
    runEnd: '12:00',
    totalCommits: 1,
    qaFailCount: 7,
    qaFixedCount: 0,
    qaNewTests: 19,
    bugFixedCount: 0,
    selfTestCount: 0,
    selfTestIssues: 0,
    devLogRows: 1
  };
  PropertiesService.getScriptProperties().setProperty('BLEND_REPORT_DATA', JSON.stringify(data));
  Logger.log('BLEND_REPORT_DATA updated: Day ' + data.dayNumber + ', ' + data.files + ' files, ' + data.totalCommits + ' commits');
}

var GEMINI_API_KEY = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') || '';
// [2026-04-10 12:10] roy@ai4min.com으로만 보내면 toroymin@gmail.com 받은편지함에 미도착 (임시 변경)
// [2026-04-10 13:00] 사용자 요청으로 roy@ai4min.com으로 복원
// var RECIPIENT_EMAIL = 'toroymin@gmail.com';
var RECIPIENT_EMAIL = 'roy@ai4min.com';
var BLEND_SPACE = 'https://ai4min.atlassian.net/wiki/spaces/Blend';
var MODEL_PRIORITY = ['gemini-2.5-flash','gemini-2.5-pro','gemini-2.0-flash','gemini-1.5-flash'];

function getAvailableModel() {
  try {
    var res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + GEMINI_API_KEY, {muteHttpExceptions:true});
    var raw = res.getContentText();
    Logger.log('Gemini API response: ' + raw.slice(0,200));
    var models = (JSON.parse(raw).models || []).filter(function(m){return (m.supportedGenerationMethods||[]).indexOf('generateContent')>=0}).map(function(m){return m.name.replace('models/','')});
    for (var i=0;i<MODEL_PRIORITY.length;i++){var match=models.filter(function(a){return a.indexOf(MODEL_PRIORITY[i])>=0})[0];if(match)return match;}
    return models[0]||null;
  } catch(e){Logger.log('getAvailableModel error: '+e.message);return null;}
}

function sendBlendDailyReport() {
  try {
    Logger.log('=== Blend Daily Report Start ===');
    var data = getReportData();
    var enriched = enrichWithGemini(data);
    var html = buildReportHTML(enriched);
    var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    // 생성된 HTML을 저장해두어 아침 재발송 시 동일한 이메일 사용
    PropertiesService.getScriptProperties().setProperty('LAST_REPORT_HTML', html);
    PropertiesService.getScriptProperties().setProperty('LAST_REPORT_SUBJECT', '[Blend Daily Report] Day ' + data.dayNumber + ' - ' + today);
    GmailApp.sendEmail(RECIPIENT_EMAIL, '[Blend Daily Report] Day ' + data.dayNumber + ' - ' + today, '', {htmlBody:html, name:'Blend Dev Bot', charset:'UTF-8'});
    Logger.log('Email sent!');
  } catch(e) {
    Logger.log('Error: ' + e.message);
    GmailApp.sendEmail(RECIPIENT_EMAIL, '[Blend] Error', 'Error: ' + e.message);
  }
}

function sendMorningReport() {
  try {
    var html = PropertiesService.getScriptProperties().getProperty('LAST_REPORT_HTML');
    var subject = PropertiesService.getScriptProperties().getProperty('LAST_REPORT_SUBJECT');
    if (!html || !subject) {
      Logger.log('No saved report found, generating new one...');
      sendBlendDailyReport();
      return;
    }
    GmailApp.sendEmail(RECIPIENT_EMAIL, subject, '', {htmlBody:html, name:'Blend Dev Bot', charset:'UTF-8'});
    Logger.log('Morning report re-sent!');
  } catch(e) {
    Logger.log('Error: ' + e.message);
    GmailApp.sendEmail(RECIPIENT_EMAIL, '[Blend] Morning Report Error', 'Error: ' + e.message);
  }
}

function getReportData() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('BLEND_REPORT_DATA');
  if(s){try{return JSON.parse(s)}catch(e){}}
  return {
    dayNumber:getDayNumber(), files:25, lines:3154, features:22, cost:'$0',
    newFeatures:['Multi-model chat (OpenAI/Anthropic/Google streaming)','BYOK API key management','Prompt library (search/tags/variables)','AI agent system (4 default + CRUD)','Plugin system UI','API cost analytics BI dashboard (differentiator)','Model comparison (differentiator)','Auto cost tracking (differentiator)','Code/message copy, chat search, export/import','Keyboard shortcuts, collapsible sidebar, theme toggle','Response regeneration, inline title editing'],
    issues:[{issue:'npm uppercase rejected',solution:'Use lowercase'},{issue:'Preview nvm PATH',solution:'serve.js wrapper'},{issue:'Turbopack failure',solution:'webpack mode'}],
    tomorrowPlan:['GitHub repo + commits','Plugin implementation','Mobile responsive'],
    confluenceLinks:[{title:'Blend Project Overview',url:BLEND_SPACE+'/pages/5112096/Blend'},{title:'Day 1 Work Log',url:BLEND_SPACE+'/pages/5112116/2026-04-04+Day+1'}],
    githubLinks:[]
  };
}

function getDayNumber(){return Math.max(1,Math.floor((new Date()-new Date('2026-04-04'))/86400000)+1)}

function enrichWithGemini(data) {
  var mdl = getAvailableModel();
  var fallback = {summaryKo:'Blend Day '+data.dayNumber+': '+data.files+'개 파일, '+data.lines+'줄, '+data.features+'개 기능 구현 완료. 비용 '+data.cost+'.',summaryEn:'Blend Day '+data.dayNumber+': '+data.files+' files, '+data.lines+' lines, '+data.features+' features built. Cost '+data.cost+'.',highlightKo:data.files+'개 파일, '+data.features+'개 기능 구현 (비용 '+data.cost+')',highlightEn:data.files+' files, '+data.features+' features (Cost '+data.cost+')'};
  if(!mdl){for(var k in fallback)data[k]=fallback[k];return data;}
  var prompt='You are a dev report assistant for Blend, an AI chat app (TypingMind clone).\nDay:'+data.dayNumber+' Files:'+data.files+' Lines:'+data.lines+' Features:'+data.features+' Cost:'+data.cost+'\nNewFeatures:'+JSON.stringify(data.newFeatures)+'\nIssues:'+JSON.stringify(data.issues)+'\nTomorrowPlan:'+JSON.stringify(data.tomorrowPlan)+'\nReturn JSON ONLY:\n{"summaryKo":"2-3문장 한국어 요약","summaryEn":"2-3 sentence English summary","highlightKo":"1줄 한국어 하이라이트","highlightEn":"1 line English highlight","featureDescs":[{"name":"기능명","desc":"어떤 기능인지, 어디에 영향을 주는지 한 줄 설명"}],"issueEnriched":[{"issue":"이슈명","cause":"원인","solution":"해결방법","effect":"결과/영향"}],"planDescs":[{"name":"항목명","desc":"어떤 작업인지, 어디에 영향을 주는지 한 줄 설명"}]}';
  try {
    var res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/'+mdl+':generateContent?key='+GEMINI_API_KEY,{method:'post',contentType:'application/json',payload:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0.5,maxOutputTokens:8192}}),muteHttpExceptions:true});
    var j=JSON.parse(res.getContentText());if(j.error)throw new Error(j.error.message);
    var t=j.candidates[0].content.parts[0].text.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
    var e=JSON.parse(t);for(var k in e)data[k]=e[k];return data;
  }catch(e){Logger.log('Gemini err:'+e.message);for(var k in fallback)data[k]=fallback[k];return data;}
}

function buildReportHTML(d) {
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var feat='';
  if(d.featureDescs&&d.featureDescs.length>0){
    d.featureDescs.forEach(function(f){var df=(f.name||'').toLowerCase().indexOf('differentiator')>=0;feat+='<li style="line-height:1.8;font-size:13px;color:#374151;margin-bottom:3px;">'+(df?'<strong style="color:#d97706;">* '+f.name+'</strong>':'<strong>'+f.name+'</strong>')+(f.desc?' <span style="color:#6b7280;font-weight:400;">— '+f.desc+'</span>':'')+'</li>';});
  } else {
    (d.newFeatures||[]).forEach(function(f){var df=f.toLowerCase().indexOf('differentiator')>=0;feat+='<li style="line-height:1.6;font-size:13px;color:#374151;">'+(df?'<strong style="color:#d97706;">* '+f+'</strong>':f)+'</li>';});
  }
  var issEnriched=d.issueEnriched&&d.issueEnriched.length>0;
  var iss='';
  if(issEnriched){
    d.issueEnriched.forEach(function(i){iss+='<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:12px;">'+i.issue+'</td><td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:12px;color:#6b7280;">'+i.cause+'</td><td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:12px;">'+i.solution+'</td><td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:12px;color:#059669;">'+i.effect+'</td></tr>';});
  } else {
    (d.issues||[]).forEach(function(i){iss+='<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:12px;">'+i.issue+'</td><td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:12px;">'+i.solution+'</td></tr>';});
  }
  var lnk='';(d.confluenceLinks||[]).forEach(function(l){lnk+='<li style="line-height:1.8;"><a href="'+l.url+'" style="color:#2563eb;font-size:13px;text-decoration:none;">'+l.title+'</a></li>';});
  if(!d.githubLinks||d.githubLinks.length===0)lnk+='<li style="line-height:1.8;font-size:13px;color:#aaa;">GitHub: Pending</li>';
  var tmr='';
  if(d.planDescs&&d.planDescs.length>0){
    d.planDescs.forEach(function(p){tmr+='<li style="line-height:1.8;font-size:13px;color:#374151;margin-bottom:3px;"><strong>'+p.name+'</strong>'+(p.desc?' <span style="color:#6b7280;font-weight:400;">— '+p.desc+'</span>':'')+'</li>';});
  } else {
    (d.tomorrowPlan||[]).forEach(function(p){tmr+='<li style="line-height:1.6;font-size:13px;color:#374151;">'+p+'</li>';});
  }

  return '<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>'+
  '<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">'+
  '<div style="max-width:600px;margin:0 auto;background:#fff;">'+

  // 하이라이트 (최상단, 로켓 없음)
  '<div style="background:#FFF8E1;padding:12px 16px;font-size:14px;color:#92400e;font-weight:600;">'+(d.highlightKo||d.files+' files, '+d.features+' features')+'</div>'+

  // 숫자 카드 - table 균등 분배, 숫자와 바 사이 여백
  '<table style="width:100%;border-collapse:collapse;border-bottom:1px solid #e5e7eb;" cellpadding="0" cellspacing="0"><tr>'+
  '<td style="width:25%;text-align:center;padding:14px 0;"><div style="display:inline-block;border-left:3px solid #3b82f6;padding-left:8px;text-align:left;"><div style="font-size:22px;font-weight:700;color:#1e3a5f;">'+(d.files||0)+'</div><div style="font-size:10px;color:#9ca3af;">Files</div></div></td>'+
  '<td style="width:25%;text-align:center;padding:14px 0;"><div style="display:inline-block;border-left:3px solid #10b981;padding-left:8px;text-align:left;"><div style="font-size:22px;font-weight:700;color:#065f46;">'+(d.lines||0)+'</div><div style="font-size:10px;color:#9ca3af;">Lines</div></div></td>'+
  '<td style="width:25%;text-align:center;padding:14px 0;"><div style="display:inline-block;border-left:3px solid #f59e0b;padding-left:8px;text-align:left;"><div style="font-size:22px;font-weight:700;color:#92400e;">'+(d.features||0)+'</div><div style="font-size:10px;color:#9ca3af;">Features</div></div></td>'+
  '<td style="width:25%;text-align:center;padding:14px 0;"><div style="display:inline-block;border-left:3px solid #8b5cf6;padding-left:8px;text-align:left;"><div style="font-size:22px;font-weight:700;color:#5b21b6;">'+(d.cost||'$0')+'</div><div style="font-size:10px;color:#9ca3af;">Cost</div></div></td>'+
  '</tr></table>'+

  // 타이틀 바
  '<div style="background:linear-gradient(135deg,#1e3a5f,#3b82f6);padding:10px 16px;text-align:center;">'+
  '<span style="font-size:15px;color:#fff;font-weight:600;">Blend Daily Report - Day '+(d.dayNumber||1)+'</span>'+
  '<span style="font-size:11px;color:rgba(255,255,255,0.7);margin-left:8px;">'+today+'</span></div>'+

  // 한국어 요약
  '<div style="padding:14px 16px;border-bottom:1px solid #e5e7eb;">'+
  '<h2 style="font-size:14px;color:#1e3a5f;margin:0 0 6px;">&#x1F1F0;&#x1F1F7; &#xC624;&#xB298; &#xC791;&#xC5C5; &#xC694;&#xC57D;</h2>'+
  '<p style="font-size:13px;color:#4b5563;line-height:1.6;margin:0 0 6px;">'+(d.summaryKo||'')+'</p>'+
  '<ul style="padding-left:18px;margin:0;">'+feat+'</ul></div>'+

  // 영어 요약
  '<div style="padding:14px 16px;border-bottom:1px solid #e5e7eb;">'+
  '<h2 style="font-size:14px;color:#1e3a5f;margin:0 0 6px;">&#x1F1FA;&#x1F1F8; Summary</h2>'+
  '<p style="font-size:13px;color:#4b5563;line-height:1.6;margin:0;">'+(d.summaryEn||'')+'</p></div>'+

  // 이슈
  (iss?'<div style="padding:14px 16px;border-bottom:1px solid #e5e7eb;"><h2 style="font-size:14px;color:#dc2626;margin:0 0 6px;">Issues</h2><table style="width:100%;border-collapse:collapse;"><tr style="background:#f9fafb;"><th style="padding:6px 10px;text-align:left;font-size:11px;color:#6b7280;">Issue</th>'+(issEnriched?'<th style="padding:6px 10px;text-align:left;font-size:11px;color:#6b7280;">Cause</th>':'')+' <th style="padding:6px 10px;text-align:left;font-size:11px;color:#6b7280;">Solution</th>'+(issEnriched?'<th style="padding:6px 10px;text-align:left;font-size:11px;color:#6b7280;">Effect</th>':'')+'</tr>'+iss+'</table></div>':'')+

  // 링크
  '<div style="padding:14px 16px;background:#eff6ff;border-bottom:1px solid #e5e7eb;">'+
  '<h2 style="font-size:14px;color:#1e40af;margin:0 0 4px;">Links</h2>'+
  '<ul style="padding-left:18px;margin:0;">'+lnk+'</ul></div>'+

  // 내일
  '<div style="padding:14px 16px;">'+
  '<h2 style="font-size:14px;color:#059669;margin:0 0 4px;">Tomorrow</h2>'+
  '<ul style="padding-left:18px;margin:0;">'+tmr+'</ul></div>'+

  '<div style="padding:8px;text-align:center;font-size:10px;color:#bbb;">GAS + Gemini | <a href="'+BLEND_SPACE+'" style="color:#bbb;">Confluence</a></div>'+
  '</div></body></html>';
}

function doPost(e){try{PropertiesService.getScriptProperties().setProperty('BLEND_REPORT_DATA',e.postData.contents);return ContentService.createTextOutput('ok')}catch(err){return ContentService.createTextOutput('error')}}

// [2026-04-11] Web App GET handler — curl로 action 파라미터 전달해 함수 실행
// action=sendDevReport  → sendBlendDailyReport()
// action=sendCostReport → sendCostReport()
// action=setData&data={json} → BLEND_REPORT_DATA 업데이트
function doGet(e) {
  var action = (e.parameter || {}).action || '';
  try {
    if (action === 'sendDevReport') {
      sendBlendDailyReport();
      return ContentService.createTextOutput('dev report sent');
    } else if (action === 'sendCostReport') {
      sendCostReport();
      return ContentService.createTextOutput('cost report sent');
    } else if (action === 'setData') {
      var data = (e.parameter || {}).data || '{}';
      PropertiesService.getScriptProperties().setProperty('BLEND_REPORT_DATA', data);
      return ContentService.createTextOutput('data set');
    }
    return ContentService.createTextOutput('unknown action: ' + action);
  } catch(err) {
    return ContentService.createTextOutput('error: ' + err.message);
  }
}
function testSendReport(){sendBlendDailyReport()}
// [2026-04-10] 임시 래퍼 — CostReport.gs가 GAS 에디터에서 로드 안 될 때 사용. 완료 후 삭제 가능.
function runCostReportNow(){sendCostReport()}
function createDailyTrigger(){ScriptApp.getProjectTriggers().forEach(function(t){if(t.getHandlerFunction()==='sendBlendDailyReport'||t.getHandlerFunction()==='sendMorningReport')ScriptApp.deleteTrigger(t)});ScriptApp.newTrigger('sendMorningReport').timeBased().everyDays(1).atHour(8).nearMinute(35).create();Logger.log('Trigger created: sendMorningReport 8:35 AM daily')}