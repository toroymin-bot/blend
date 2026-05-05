// [2026-05-05 PM-46 Phase 6 Roy] Daily Pulse — CEO 관점 일일 리포트.
// 단순 숫자 나열 X. 인사이트 엔진(insights.ts)으로 의미 도출 → 액션까지.

import type { UsageDetailed, MonthSummary, SummaryPayload } from '../types';
import {
  insightGrowth, insightCostPerMsg, insightConcentration, insightModelEfficiency,
  insightTimePattern, insightSubscriptionValue, insightMonthProjection, insightAnomaly,
  insightCountry, insightOs, insightRetention, insightTopAction,
  fmtKrw, fmtUsd, providerLabel,
  type CohortRetention,
} from './insights';
import { escapeMd, formatHeaderDate } from './markdown-v2';

interface PulseData {
  date: string;
  today: UsageDetailed;
  yesterday: UsageDetailed | null;
  weekAvgRequests: number | null;
  weekAvgCost: number | null;
  monthSoFar: MonthSummary | null;
  countries: Array<{ code: string; requests: number; cost: number }>;
  oses: Array<{ os: string; requests: number; cost: number }>;
  cohorts: CohortRetention[];
  devLog?: SummaryPayload | null;
}

// 텍스트 막대 그래프 (10 칸 풀스케일)
function bar(value: number, max: number, width = 10): string {
  if (max <= 0) return '░'.repeat(width);
  const filled = Math.round((value / max) * width);
  return '▮'.repeat(Math.max(0, Math.min(width, filled))) + '░'.repeat(width - Math.min(width, filled));
}

// 시간대 4 bucket 막대 (00-05, 06-11, 12-17, 18-23)
function hourBuckets(hourly: Array<{ hour: string; requests: number }>): Array<{ label: string; total: number }> {
  const buckets = [
    { label: '🌙 00-05', total: 0 },
    { label: '☀️ 06-11', total: 0 },
    { label: '🏙 12-17', total: 0 },
    { label: '🌆 18-23', total: 0 },
  ];
  for (const h of hourly) {
    const hr = parseInt(h.hour, 10);
    if (Number.isNaN(hr) || hr < 0 || hr > 23) continue;
    const idx = Math.floor(hr / 6);
    buckets[idx].total += h.requests;
  }
  return buckets;
}

export function formatDailyPulse(data: PulseData): string {
  const lines: string[] = [];

  // ━━━ 헤더 ━━━
  lines.push(`📊 *Blend Daily Pulse*`);
  lines.push(escapeMd(formatHeaderDate(data.date)));
  lines.push('');

  const today = data.today;
  const empty = today.totalRequests === 0;

  if (empty) {
    lines.push(escapeMd('오늘 활동 없음 — 마케팅 채널 점검 권장.'));
    return lines.join('\n');
  }

  // ━━━ 핵심 지표 ━━━
  lines.push('━━━ *핵심 지표* ━━━');
  lines.push(escapeMd(`💬 메시지 ${today.totalRequests.toLocaleString('ko-KR')}건`));
  lines.push(escapeMd(`💰 비용 ${fmtKrw(today.totalCost)} (${fmtUsd(today.totalCost)})`));
  const cpm = today.totalCost / Math.max(1, today.totalRequests);
  lines.push(escapeMd(`📊 메시지당 ${fmtKrw(cpm)}`));
  lines.push('');

  // ━━━ 시간대 분포 ━━━
  const buckets = hourBuckets(today.hourly ?? []);
  const maxBucket = Math.max(...buckets.map((b) => b.total), 1);
  if (today.hourly && today.hourly.length > 0) {
    lines.push('━━━ *시간대 분포* ━━━');
    for (const b of buckets) {
      lines.push(escapeMd(`${b.label}  ${bar(b.total, maxBucket, 8)} ${b.total}건`));
    }
    lines.push('');
  }

  // ━━━ AI 회사별 ━━━
  const sortedProviders = Object.entries(today.providers)
    .sort((a, b) => b[1].requests - a[1].requests);
  if (sortedProviders.length > 0) {
    lines.push('━━━ *AI 회사 분포* ━━━');
    const maxP = sortedProviders[0][1].requests;
    for (const [p, v] of sortedProviders.slice(0, 5)) {
      const pctNum = (v.requests / today.totalRequests) * 100;
      const label = providerLabel(p);
      lines.push(escapeMd(
        `${label}  ${bar(v.requests, maxP, 6)} ${pctNum.toFixed(0)}% (${v.requests}건, ${fmtKrw(v.cost)})`
      ));
    }
    lines.push('');
  }

  // ━━━ 국가/OS 분포 (런칭 후 의미 있을 때만) ━━━
  const totalCountries = data.countries.length;
  const totalOses = data.oses.length;
  if (totalCountries > 1 || totalOses > 1) {
    lines.push('━━━ *사용자 분포* ━━━');
    const cInsight = insightCountry(data.countries, today.totalRequests);
    if (cInsight) lines.push(escapeMd(cInsight));
    const oInsight = insightOs(data.oses, today.totalRequests);
    if (oInsight) lines.push(escapeMd(oInsight));
    lines.push('');
  }

  // ━━━ 비즈니스 인사이트 ━━━
  const insights: string[] = [];
  const i1 = insightGrowth(today, data.yesterday, data.weekAvgRequests);          if (i1) insights.push(i1);
  const i2 = insightCostPerMsg(today);                                            if (i2) insights.push(i2);
  const i3 = insightConcentration(today);                                         if (i3) insights.push(i3);
  const i4 = insightModelEfficiency(today);                                       if (i4) insights.push(i4);
  const i5 = insightTimePattern(today);                                           if (i5) insights.push(i5);
  const i6 = insightSubscriptionValue(today);                                     if (i6) insights.push(i6);
  const i7 = insightMonthProjection(today, data.monthSoFar);                      if (i7) insights.push(i7);
  const i8 = insightAnomaly(today, data.weekAvgRequests, data.weekAvgCost);       if (i8) insights.push(i8);
  const i9 = insightRetention(data.cohorts);                                      if (i9) insights.push(i9);

  if (insights.length > 0) {
    lines.push('━━━ *비즈니스 인사이트* ━━━');
    for (const ins of insights) {
      lines.push(escapeMd(`• ${ins}`));
    }
    lines.push('');
  }

  // ━━━ 핵심 액션 ━━━
  lines.push('━━━ *오늘의 핵심 액션* ━━━');
  lines.push(escapeMd(insightTopAction(today, data.yesterday, data.weekAvgRequests)));

  // ━━━ (옵션) 개발 일지 ━━━
  if (data.devLog && (
    (data.devLog.tasks?.length ?? 0) > 0 ||
    (data.devLog.bugs?.length ?? 0) > 0 ||
    (data.devLog.improvements?.length ?? 0) > 0 ||
    data.devLog.stats
  )) {
    lines.push('');
    lines.push('━━━ *개발 일지* ━━━');
    const dl = data.devLog;
    if (dl.stats) {
      lines.push(escapeMd(
        `📝 ${dl.stats.filesChanged}파일 · +${dl.stats.additions}/-${dl.stats.deletions} · 커밋 ${dl.stats.commitCount}건`
      ));
    }
    if (dl.tasks?.length) {
      lines.push(escapeMd(`🔧 작업 ${dl.tasks.length}건`));
    }
    if (dl.bugs?.length) {
      lines.push(escapeMd(`🐛 버그 ${dl.bugs.length}건`));
    }
    if (dl.improvements?.length) {
      lines.push(escapeMd(`✨ 개선 ${dl.improvements.length}건`));
    }
  }

  return lines.join('\n');
}
