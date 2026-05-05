// Telegram MarkdownV2 escape + dev log formatter (Tori 명세 v3 §6.7)

import type {
  SummaryPayload,
  TaskItem,
  BugItem,
  ImpItem,
  UsageDetailed,
} from '../types';
import { TASK_STATUS, BUG_STATUS, IMP_STATUS } from './status-emoji';

// MarkdownV2가 escape를 요구하는 문자
// _ * [ ] ( ) ~ ` > # + - = | { } . !
const SPECIAL = /[_*[\]()~`>#+\-=|{}.!\\]/g;

export function escapeMd(text: string): string {
  return text.replace(SPECIAL, '\\$&');
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

export function formatHeaderDate(isoDate: string): string {
  // "2026-04-25" → "4/25 (금)"
  const [, m, d] = isoDate.split('-').map((p) => parseInt(p, 10));
  const dow = DOW[new Date(isoDate + 'T00:00:00').getDay()];
  return `${m}/${d} (${dow})`;
}

interface StatusInfo {
  emoji: string;
  label: string;
}

function commitLinks(shas: string[] | undefined, repoUrl: string | undefined): string {
  if (!shas || shas.length === 0) return '';
  if (!repoUrl) {
    // repo 없으면 sha만 표기
    const inner = shas.map((sha) => `\`${sha.slice(0, 7)}\``).join(', ');
    return ` \\(${inner}\\)`;
  }
  const inner = shas
    .map((sha) => {
      const short = sha.slice(0, 7);
      return `[\`${short}\`](${repoUrl}/commit/${sha})`;
    })
    .join(', ');
  return ` \\(${inner}\\)`;
}

function formatLine(
  title: string,
  status: StatusInfo,
  shas: string[] | undefined,
  repoUrl: string | undefined,
): string {
  const safeTitle = escapeMd(title);
  const statusPart = `${status.emoji} ${escapeMd(status.label)}`;
  const commitPart = commitLinks(shas, repoUrl);
  return `• ${safeTitle} / ${statusPart}${commitPart}`;
}

const MAX_PER_CATEGORY = 5;

function trimList<T>(items: T[]): { items: T[]; overflow: number } {
  if (items.length <= MAX_PER_CATEGORY) return { items, overflow: 0 };
  return {
    items: items.slice(0, MAX_PER_CATEGORY),
    overflow: items.length - MAX_PER_CATEGORY,
  };
}

// [2026-05-05 PM-46 Phase 4 Roy] WAE 기반 1일 사용 통계 → Telegram 섹션.
// USD 비용은 KRW으로 환산해서 같이 노출 (₩1,470/USD 환율은 monthly 갱신용 근사값).
// 섹션 항목: 메시지 합 + KRW/USD 비용 + provider top3 + 피크 시간대 + 모델 top3.
const KRW_PER_USD = 1469.74; // 2026-05-01 xe.com — 매월 갱신
const PROVIDER_LABEL: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  deepseek: 'DeepSeek',
  groq: 'Groq',
};

export function formatUsageSection(usage: UsageDetailed): string {
  if (!usage || usage.totalRequests === 0) {
    return ''; // 사용량 없으면 섹션 자체 생략
  }

  const lines: string[] = [];
  lines.push('💰 *사용 통계*');

  // 라인 1: 메시지 합 + 비용 (KRW + USD)
  const krw = Math.ceil(usage.totalCost * KRW_PER_USD);
  const usdStr = usage.totalCost < 0.01 ? '<$0.01' : `$${usage.totalCost.toFixed(2)}`;
  lines.push(escapeMd(`• 메시지 ${usage.totalRequests}건 · ₩${krw.toLocaleString('ko-KR')} (${usdStr})`));

  // 라인 2: Provider 분포 top 3 (요청 수 기준)
  const sortedProviders = Object.entries(usage.providers)
    .sort((a, b) => b[1].requests - a[1].requests)
    .slice(0, 3);
  if (sortedProviders.length > 0) {
    const top3 = sortedProviders.map(([p, v]) => {
      const pct = Math.round((v.requests / usage.totalRequests) * 100);
      const label = PROVIDER_LABEL[p] ?? p;
      return `${label} ${pct}%`;
    }).join(', ');
    lines.push(escapeMd(`• AI 회사: ${top3}`));
  }

  // 라인 3: 피크 시간대
  if (usage.hourly && usage.hourly.length > 0) {
    const peak = [...usage.hourly].sort((a, b) => b.requests - a.requests)[0];
    if (peak) {
      const hr = parseInt(peak.hour, 10);
      const ampm = hr < 12 ? '오전' : '오후';
      const h12 = hr === 0 ? 12 : (hr > 12 ? hr - 12 : hr);
      lines.push(escapeMd(`• 피크 시간대: ${ampm} ${h12}시 (${peak.requests}건)`));
    }
  }

  // 라인 4: 모델 top 3 (요청 수 기준)
  const sortedModels = Object.entries(usage.models)
    .sort((a, b) => b[1].requests - a[1].requests)
    .slice(0, 3);
  if (sortedModels.length > 0) {
    const top3 = sortedModels.map(([m, v]) => `${m}(${v.requests})`).join(', ');
    lines.push(escapeMd(`• 모델 Top3: ${top3}`));
  }

  return lines.join('\n');
}

export function formatDevLogMessage(payload: SummaryPayload, usage?: UsageDetailed): string {
  const lines: string[] = [];
  const repoUrl = payload.links?.repo;

  lines.push(`📓 *블렌드 개발 일지 — ${escapeMd(formatHeaderDate(payload.date))}*`);
  lines.push('');

  // 작업
  if (payload.tasks && payload.tasks.length > 0) {
    const { items, overflow } = trimList<TaskItem>(payload.tasks);
    lines.push('🔧 *작업*');
    items.forEach((t) => {
      lines.push(formatLine(t.title, TASK_STATUS[t.status], t.commitShas, repoUrl));
    });
    if (overflow > 0) lines.push(escapeMd(`외 ${overflow}건`));
    lines.push('');
  }

  // 버그
  if (payload.bugs && payload.bugs.length > 0) {
    const { items, overflow } = trimList<BugItem>(payload.bugs);
    lines.push('🐛 *버그*');
    items.forEach((b) => {
      const title = `${b.id} ${b.title}`;
      lines.push(formatLine(title, BUG_STATUS[b.status], b.commitShas, repoUrl));
    });
    if (overflow > 0) lines.push(escapeMd(`외 ${overflow}건`));
    lines.push('');
  }

  // 개선
  if (payload.improvements && payload.improvements.length > 0) {
    const { items, overflow } = trimList<ImpItem>(payload.improvements);
    lines.push('✨ *개선*');
    items.forEach((i) => {
      const title = `${i.id} ${i.title}`;
      lines.push(formatLine(title, IMP_STATUS[i.status], i.commitShas, repoUrl));
    });
    if (overflow > 0) lines.push(escapeMd(`외 ${overflow}건`));
    lines.push('');
  }

  // 통계
  if (payload.stats) {
    lines.push('📊 *변경*');
    const s = payload.stats;
    const summary = `${s.filesChanged}개 파일 · +${s.additions} / -${s.deletions} · 커밋 ${s.commitCount}건`;
    lines.push(escapeMd(summary));
    lines.push('');
  }

  // [2026-05-05 PM-46 Phase 4 Roy] WAE 기반 사용 통계 (있으면 추가)
  if (usage && usage.totalRequests > 0) {
    const usageSection = formatUsageSection(usage);
    if (usageSection) {
      lines.push(usageSection);
      lines.push('');
    }
  }

  // 링크
  const linkParts: string[] = [];
  if (payload.links?.qaTask)     linkParts.push(`[QA Task](${payload.links.qaTask})`);
  if (payload.links?.devLogPage) linkParts.push(`[📓 일지](${payload.links.devLogPage})`);
  if (payload.links?.repo)       linkParts.push(`[💻 GitHub](${payload.links.repo})`);
  if (linkParts.length > 0) {
    lines.push(`🔗 ${linkParts.join(' \\| ')}`);
  }

  // 빈 메시지 방지 — 본문 항목이 0이면 "활동 없음"
  // [2026-05-05 PM-46 Phase 4] usage 통계도 본문 카운트에 포함 — 개발 활동 없는 날에도
  // 사용자 활동(=메시지 통계) 있으면 의미 있는 리포트로 출력.
  const bodyHasItems =
    (payload.tasks?.length ?? 0) +
      (payload.bugs?.length ?? 0) +
      (payload.improvements?.length ?? 0) +
      (payload.stats ? 1 : 0) +
      (usage && usage.totalRequests > 0 ? 1 : 0) >
    0;
  if (!bodyHasItems) {
    return formatEmptyMessage(payload.date);
  }

  return lines.join('\n');
}

export function formatEmptyMessage(isoDate: string): string {
  return [
    `📓 *블렌드 개발 일지 — ${escapeMd(formatHeaderDate(isoDate))}*`,
    '',
    escapeMd('어제 개발 활동 없음.'),
  ].join('\n');
}
