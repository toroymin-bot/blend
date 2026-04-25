#!/usr/bin/env node
// Blend Daily Telegram Report v2 (Tori 명세 2026-04-25)
// KST 08:40 = UTC 23:40 (전날) cron으로 실행.

const KV_API_BASE = `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/storage/kv/namespaces/${process.env.CF_KV_NAMESPACE_ID}`;

const HEADERS = {
  Authorization: `Bearer ${process.env.CF_API_TOKEN}`,
  'Content-Type': 'application/json',
};

// ── 날짜 유틸 ─────────────────────────────────────────────────
function yesterdayKST() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCDate(kst.getUTCDate() - 1);
  return kst.toISOString().slice(0, 10);
}

function dateOffset(baseDate, days) {
  const d = new Date(baseDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── KV 헬퍼 ──────────────────────────────────────────────────
async function listKVKeys(prefix) {
  const url = `${KV_API_BASE}/keys?prefix=${encodeURIComponent(prefix)}&limit=1000`;
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error(`KV list failed: ${r.status}`);
  const json = await r.json();
  return (json.result || []).map((k) => k.name);
}

async function getKV(key) {
  const url = `${KV_API_BASE}/values/${encodeURIComponent(key)}`;
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) return null;
  return r.text();
}

async function getKVJSON(key) {
  const v = await getKV(key);
  if (!v) return null;
  try { return JSON.parse(v); } catch { return null; }
}

// ── 리텐션 ───────────────────────────────────────────────────
async function calculateRetention(targetDate) {
  async function retentionRate(daysAgo) {
    const cohortDate = dateOffset(targetDate, -daysAgo);
    const cohort = (await getKVJSON(`cohort:${cohortDate}:users`)) || [];
    if (cohort.length === 0) return { cohortSize: 0, retained: 0, rate: null };
    const active = (await getKVJSON(`active:${cohortDate}:${targetDate}`)) || [];
    const retained = active.length;
    const rate = (retained / cohort.length) * 100;
    return { cohortSize: cohort.length, retained, rate: rate.toFixed(1) };
  }
  return {
    day1:  await retentionRate(1),
    day7:  await retentionRate(7),
    day30: await retentionRate(30),
  };
}

// ── 누적 사용자 ──────────────────────────────────────────────
async function getTotalUsers() {
  const cohortKeys = await listKVKeys('cohort:');
  let total = 0;
  for (const k of cohortKeys) {
    if (k.endsWith(':users')) {
      const cohort = (await getKVJSON(k)) || [];
      total += cohort.length;
    }
  }
  return total;
}

// ── 메뉴 정의 (큐레이션 기준) ────────────────────────────────
const ALL_MENUS = [
  'chat', 'compare', 'documents', 'models', 'dashboard',
  'agents', 'meeting', 'datasources', 'savings', 'billing',
  'security', 'about', 'settings',
];

// ── 리포트 생성 ──────────────────────────────────────────────
async function buildReport() {
  const date = yesterdayKST();
  const prefix = `daily:${date}:`;

  const keys = await listKVKeys(prefix);
  const data = {};
  await Promise.all(keys.map(async (k) => { data[k] = await getKV(k); }));

  const newVisitors    = parseInt(data[`${prefix}visit:new`]    || '0', 10);
  const returnVisitors = parseInt(data[`${prefix}visit:return`] || '0', 10);
  const totalVisitors  = newVisitors + returnVisitors;
  const firstMessages  = parseInt(data[`${prefix}first_message_sent`] || '0', 10);
  const trialUsed      = parseInt(data[`${prefix}trial_used`]    || '0', 10);
  const compareUsed    = parseInt(data[`${prefix}compare_used`]  || '0', 10);

  // 모든 메뉴 카운트 (사용 안 된 메뉴는 0)
  const menuCounts = {};
  for (const menu of ALL_MENUS) {
    menuCounts[menu] = parseInt(data[`${prefix}menu_click:${menu}`] || '0', 10);
  }
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith(`${prefix}menu_click:`)) {
      const menu = k.split(':').pop();
      if (!Object.prototype.hasOwnProperty.call(menuCounts, menu)) {
        menuCounts[menu] = parseInt(v, 10);
      }
    }
  }

  const modelCounts = {};
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith(`${prefix}model_select:`)) {
      const model = k.split(':').pop();
      modelCounts[model] = parseInt(v, 10);
    }
  }

  const keysByProvider = {};
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith(`${prefix}key_registered:`)) {
      const provider = k.split(':').pop();
      keysByProvider[provider] = parseInt(v, 10);
    }
  }
  const keyRegistered = Object.values(keysByProvider).reduce((a, b) => a + b, 0);

  const conversionRate = firstMessages > 0
    ? ((keyRegistered / firstMessages) * 100).toFixed(1)
    : '—';

  const retention = await calculateRetention(date);
  const totalUsers = await getTotalUsers();

  const totalEvents = Object.values(data).reduce(
    (sum, v) => sum + (parseInt(v || '0', 10) || 0),
    0,
  );
  if (totalEvents === 0 && newVisitors === 0 && returnVisitors === 0) {
    return `📊 *Blend 일일 리포트*\n${date}\n\n어제는 활동이 없었어요.`;
  }

  // ── 리포트 작성 ─────────────────────────────────────────
  const lines = [];
  lines.push(`📊 *Blend 일일 리포트*`);
  lines.push(date);
  lines.push('');

  lines.push('*방문자*');
  lines.push(`총 ${totalVisitors}명 (신규 ${newVisitors} · 재방문 ${returnVisitors})`);
  lines.push(`누적 총 사용자  ${totalUsers.toLocaleString()}`);
  lines.push('');

  lines.push('*리텐션*');
  function fmtR(r) {
    if (r.rate === null) return '데이터 부족';
    return `${r.retained}/${r.cohortSize} (${r.rate}%)`;
  }
  lines.push(`Day 1   ${fmtR(retention.day1)}`);
  lines.push(`Day 7   ${fmtR(retention.day7)}`);
  lines.push(`Day 30  ${fmtR(retention.day30)}`);
  lines.push('');

  lines.push('*전환*');
  lines.push(`첫 메시지  ${firstMessages}`);
  lines.push(`키 등록    ${keyRegistered}`);
  lines.push(`전환율    ${conversionRate}%`);
  lines.push('');

  lines.push('*메뉴 사용 (전체)*');
  Object.entries(menuCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([menu, count]) => {
      const indicator = count === 0 ? '⚠️' : '  ';
      lines.push(`${indicator} ${menu}  ${count}`);
    });
  lines.push('');

  if (Object.keys(modelCounts).length > 0) {
    lines.push('*모델 사용 (전체)*');
    Object.entries(modelCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([model, count]) => lines.push(`${model}  ${count}`));
    lines.push('');
  }

  if (Object.keys(keysByProvider).length > 0) {
    lines.push('*프로바이더별 키 등록*');
    Object.entries(keysByProvider)
      .sort((a, b) => b[1] - a[1])
      .forEach(([p, c]) => lines.push(`${p}  ${c}`));
    lines.push('');
  }

  lines.push('*기타*');
  lines.push(`트라이얼  ${trialUsed}회`);
  lines.push(`Compare  ${compareUsed}회`);
  lines.push('');

  lines.push('—');
  lines.push('⚠️ 표시 = 사용 0건 (제거 검토)');
  lines.push('대시보드: https://vercel.com/toroymin-bots-projects/blend/analytics');

  return lines.join('\n');
}

// ── 텔레그램 발송 ────────────────────────────────────────────
async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    }),
  });
  if (!r.ok) throw new Error(`Telegram failed: ${r.status} ${await r.text()}`);
}

// ── 실행 ─────────────────────────────────────────────────────
(async () => {
  try {
    const report = await buildReport();
    console.log('=== Generated Report ===');
    console.log(report);
    console.log('========================');
    await sendTelegram(report);
    console.log('✓ Telegram message sent');
  } catch (e) {
    console.error('Report failed:', e);
    try {
      await sendTelegram(`⚠️ *Blend 리포트 발송 실패*\n\n${e.message || e}`);
    } catch {}
    process.exit(1);
  }
})();
