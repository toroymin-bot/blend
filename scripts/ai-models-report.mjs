#!/usr/bin/env node
// [2026-05-03 PM-24 Roy] AI 모델 변화 별도 텔레그램 리포트.
// daily-telegram-report(KST 08:40)에 append 안 하고, KST 08:25에 신모델만
// 따로 발송. update-models cron(KST 00:30)이 generated.json에 첨부한
// lastSyncDiff 읽어서 정리. 변화 0이면 발송 skip (노이즈 차단).

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function buildAIReport() {
  const filePath = join(process.cwd(), 'src/data/available-models.generated.json');
  if (!existsSync(filePath)) {
    return '🤖 *Blend AI 모델 변화 (어제 sync)*\n\n⚠️ registry 파일 없음 — update-models cron 확인 필요';
  }
  let data;
  try {
    data = JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return '🤖 *Blend AI 모델 변화 (어제 sync)*\n\n⚠️ registry JSON 파싱 실패 — 파일 손상 의심';
  }
  const totalModels = data.lastSyncDiff?.totalModels ?? data.models?.length ?? 0;
  const diff = data.lastSyncDiff;
  // [2026-05-04 Roy] 변화 0이라도 "변화 없음" 메시지 발송 — 매일 아침 도착 보장.
  if (!diff || ((diff.added?.length ?? 0) + (diff.removed?.length ?? 0) + (diff.newlyDeprecated?.length ?? 0) + (diff.addedFamilies?.length ?? 0)) === 0) {
    const lines = ['🤖 *Blend AI 모델 변화 (어제 sync)*'];
    lines.push(`_총 ${totalModels}개 모델 (registry)_`);
    lines.push('');
    lines.push('✅ 어제 신모델 변화 없음 — registry 안정');
    if (!diff) {
      lines.push('');
      lines.push('_(lastSyncDiff 미생성 — update-models cron 다음 실행 후 채워짐)_');
    }
    return lines.join('\n');
  }
  const lines = [];
  lines.push('🤖 *Blend AI 모델 변화 (어제 sync)*');
  lines.push(`_총 ${diff.totalModels}개 모델 (registry)_`);
  lines.push('');
  if (diff.addedFamilies?.length > 0) {
    lines.push(`🆕 *새 모델 가족 (capability) — Blend 코드 검토 필요*`);
    diff.addedFamilies.forEach((f) => lines.push(`  • \`${f}\` 가족 신규 등장`));
    lines.push('');
  }
  if (diff.added?.length > 0) {
    lines.push(`✨ *신규 모델 ${diff.added.length}개*`);
    diff.added.slice(0, 20).forEach((m) => lines.push(`  • ${m}`));
    if (diff.added.length > 20) lines.push(`  ... +${diff.added.length - 20}`);
    lines.push('');
  }
  if (diff.newlyDeprecated?.length > 0) {
    lines.push(`⚠️ *Deprecated ${diff.newlyDeprecated.length}개*`);
    diff.newlyDeprecated.slice(0, 15).forEach((m) => lines.push(`  • ${m}`));
    lines.push('');
  }
  if (diff.removed?.length > 0) {
    lines.push(`🗑️ *제거 ${diff.removed.length}개*`);
    diff.removed.slice(0, 15).forEach((m) => lines.push(`  • ${m}`));
    lines.push('');
  }
  if (diff.removedFamilies?.length > 0) {
    lines.push(`🗑️ *폐기된 가족: ${diff.removedFamilies.join(', ')}*`);
    lines.push('');
  }
  lines.push('Blend 라우팅·메뉴·카피는 자동 반영 ✓');
  lines.push('신 가족은 별도 코드 작업 필요할 수 있어요.');
  return lines.join('\n');
}

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

(async () => {
  try {
    const report = buildAIReport();
    console.log('=== AI Models Report ===');
    console.log(report);
    console.log('========================');
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
      console.log('TELEGRAM_BOT_TOKEN/CHAT_ID 미설정 — 발송 skip');
      process.exit(0);
    }
    await sendTelegram(report);
    console.log('Telegram sent.');
  } catch (e) {
    console.error('AI models report failed:', e);
    process.exit(1);
  }
})();
