// Telegram MarkdownV2 escape + dev log formatter (Tori 명세 v3 §6.7)

import type {
  SummaryPayload,
  TaskItem,
  BugItem,
  ImpItem,
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

export function formatDevLogMessage(payload: SummaryPayload): string {
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

  // 링크
  const linkParts: string[] = [];
  if (payload.links?.qaTask)     linkParts.push(`[QA Task](${payload.links.qaTask})`);
  if (payload.links?.devLogPage) linkParts.push(`[📓 일지](${payload.links.devLogPage})`);
  if (payload.links?.repo)       linkParts.push(`[💻 GitHub](${payload.links.repo})`);
  if (linkParts.length > 0) {
    lines.push(`🔗 ${linkParts.join(' \\| ')}`);
  }

  // 빈 메시지 방지 — 본문 항목이 0이면 "활동 없음"
  const bodyHasItems =
    (payload.tasks?.length ?? 0) +
      (payload.bugs?.length ?? 0) +
      (payload.improvements?.length ?? 0) +
      (payload.stats ? 1 : 0) >
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
