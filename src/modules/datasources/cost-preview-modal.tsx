'use client';

// [2026-04-26 Tori 16384118 §3.5] 폴더/파일 선택 확정 직전 비용 미리보기.
// 위험(월 $5 초과)이면 빨간 경고 + 3가지 옵션.

import { useEffect, useMemo, useRef } from 'react';
import { estimateCost, formatUsd, formatKrw, isCostRisky, MONTHLY_WARN_USD } from '@/lib/cost/estimate-embedding-cost';
import type { DataSourceSelection } from '@/types';
import { useFocusTrap } from '@/lib/use-focus-trap';

const tokens = {
  bg:           'var(--d1-bg, #fafaf9)',
  surface:      'var(--d1-surface, #ffffff)',
  surfaceAlt:   'var(--d1-surface-alt, #f5f4f0)',
  text:         'var(--d1-text, #0a0a0a)',
  textDim:      'var(--d1-text-dim, #6b6b6b)',
  textFaint:    'var(--d1-text-faint, #a0a0a0)',
  accent:       'var(--d1-accent, #c65a3c)',
  accentSoft:   'var(--d1-accent-soft, rgba(198,90,60,0.12))',
  border:       'var(--d1-border, #e5e5e5)',
  warningBg:    'rgba(255,193,7,0.10)',
  warningText:  '#92400e',
  dangerBg:     '#fee2e2',
  dangerText:   '#991b1b',
};

const COPY = {
  ko: {
    title: '선택한 항목 분석',
    totalLine: (n: number, k: number) => `총 ${n}개 파일 (${k}개 항목)`,
    costHead: '💰 예상 비용',
    initialLabel: '초기 임베딩',
    monthlyLabel: '월 자동 동기화',
    cancel: '취소',
    start: '동기화 시작',
    riskTitle: '⚠️ 이 폴더는 비용이 많이 발생할 수 있어요',
    riskCause: '원인: 1GB 이상의 텍스트, 또는 자주 변경되는 파일',
    riskOptCap: '상위 200개만 인덱싱',
    riskOptOther: '다른 폴더 선택',
    riskOptForce: '그래도 진행 (위험 인지 후 진행)',
    aboutCharge: '비용은 사용자의 OpenAI/Google API 키로 직접 청구됩니다.',
    sizeWarnHead: '⚠️ 큰 파일 안내',
    oversizedFile: (name: string, mb: string) => `${name} (${mb}MB) — 25MB 초과로 분석에서 제외됩니다.`,
    largeFolderHint: (avgMb: string) => `평균 파일 크기 ${avgMb}MB — 25MB 초과 파일은 자동으로 제외됩니다. 분석에 시간이 더 걸릴 수 있어요.`,
  },
  en: {
    title: 'Review selected items',
    totalLine: (n: number, k: number) => `${n} files total (${k} items)`,
    costHead: '💰 Estimated cost',
    initialLabel: 'Initial embedding',
    monthlyLabel: 'Monthly auto-sync',
    cancel: 'Cancel',
    start: 'Start sync',
    riskTitle: '⚠️ This folder may incur significant cost',
    riskCause: 'Cause: >1GB of text, or frequently-changed files',
    riskOptCap: 'Cap at top 200 only',
    riskOptOther: 'Choose a different folder',
    riskOptForce: 'Proceed anyway (acknowledged)',
    aboutCharge: 'Cost is charged to your OpenAI/Google API key directly.',
    sizeWarnHead: '⚠️ Large file notice',
    oversizedFile: (name: string, mb: string) => `${name} (${mb}MB) — exceeds 25MB, will be skipped.`,
    largeFolderHint: (avgMb: string) => `Avg file size ${avgMb}MB — files over 25MB are auto-skipped. Analysis may take longer.`,
  },
};

export interface CostPreviewModalProps {
  lang: 'ko' | 'en';
  open: boolean;
  selections: DataSourceSelection[];
  onClose: () => void;
  onConfirm: () => void;
  onCapTop200?: () => void;             // 위험 시 fileCountCap=200으로 진행
}

export function CostPreviewModal({ lang, open, selections, onClose, onConfirm, onCapTop200 }: CostPreviewModalProps) {
  const t = COPY[lang];
  const dialogRef = useRef<HTMLDivElement>(null);

  const { totalFiles, totalBytes, estimate, risky, sizeWarnings } = useMemo(() => {
    const totalFiles = selections.reduce((s, x) => s + (x.totalFileCount || 0), 0);
    const totalBytes = selections.reduce((s, x) => s + (x.approxBytes || x.totalFileCount * 50_000), 0);
    const estimate = estimateCost(totalBytes);
    // [2026-05-01 Roy] 큰 파일 사전 경고:
    //   - 단일 파일 selection 중 25MB 초과 → 해당 파일은 sync 단계에서 자동 skip
    //   - 폴더 selection 중 평균 파일 크기 > 5MB → 큰 파일 다수 있을 가능성
    const SINGLE_LIMIT = 25 * 1024 * 1024;
    const FOLDER_AVG_HINT = 5 * 1024 * 1024;
    const oversized: Array<{ name: string; mb: string }> = [];
    const largeFolders: Array<{ name: string; avgMb: string }> = [];
    for (const s of selections) {
      if (s.kind === 'file' && (s.approxBytes ?? 0) > SINGLE_LIMIT) {
        oversized.push({ name: s.name, mb: ((s.approxBytes ?? 0) / 1024 / 1024).toFixed(1) });
      }
      if (s.kind === 'folder' && s.totalFileCount > 0 && (s.approxBytes ?? 0) > 0) {
        const avg = (s.approxBytes ?? 0) / s.totalFileCount;
        if (avg > FOLDER_AVG_HINT) {
          largeFolders.push({ name: s.name, avgMb: (avg / 1024 / 1024).toFixed(1) });
        }
      }
    }
    return {
      totalFiles, totalBytes, estimate,
      risky: isCostRisky(estimate.monthlyUsd),
      sizeWarnings: { oversized, largeFolders },
    };
  }, [selections]);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => dialogRef.current?.focus(), 50);
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  useFocusTrap(dialogRef, open);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.title}
      className="fixed inset-0 z-[80] flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.32)' }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl outline-none"
        style={{ background: tokens.surface, color: tokens.text, boxShadow: '0 24px 60px rgba(0,0,0,0.18)' }}
      >
        <div className="px-6 py-5">
          <h3 className="mb-4 text-[16px] font-medium">{t.title}</h3>

          {/* 선택 리스트 */}
          <div className="mb-4 space-y-2 text-[13px]">
            {selections.map((s) => (
              <div key={s.id} className="flex items-baseline justify-between gap-3 border-b pb-2"
                   style={{ borderColor: tokens.border }}>
                <div className="min-w-0 flex-1">
                  <div className="truncate" style={{ color: tokens.text }}>
                    {s.kind === 'folder' ? '📁' : '📄'} {s.name}
                  </div>
                  {s.path && s.path !== s.name && (
                    <div className="truncate text-[11.5px]" style={{ color: tokens.textFaint }}>{s.path}</div>
                  )}
                </div>
                <div className="text-[11.5px]" style={{ color: tokens.textDim }}>
                  {s.kind === 'folder' ? `${s.totalFileCount} ${lang === 'ko' ? '개 파일' : 'files'}` : ''}
                </div>
              </div>
            ))}
          </div>

          <div className="mb-2 text-[13px]" style={{ color: tokens.textDim }}>
            {t.totalLine(totalFiles, selections.length)}
          </div>

          {/* 비용 */}
          <div className="rounded-xl border p-3 text-[12.5px]"
               style={{ background: risky ? tokens.dangerBg : tokens.surfaceAlt, borderColor: tokens.border, color: risky ? tokens.dangerText : tokens.text }}>
            <div className="mb-1 font-medium">{t.costHead}</div>
            <div className="flex justify-between">
              <span>{t.initialLabel}</span>
              <span>{formatUsd(estimate.initialUsd)} ({formatKrw(estimate.initialUsd)})</span>
            </div>
            <div className="flex justify-between">
              <span>{t.monthlyLabel}</span>
              <span>{formatUsd(estimate.monthlyUsd)} ({formatKrw(estimate.monthlyUsd)})</span>
            </div>
            {risky && (
              <div className="mt-2 border-t pt-2" style={{ borderColor: 'rgba(153,27,27,0.2)' }}>
                <div className="font-semibold">{t.riskTitle}</div>
                <div className="mt-0.5">{t.riskCause}</div>
              </div>
            )}
          </div>

          {/* [2026-05-01 Roy] 큰 파일 사전 경고 — 25MB 초과 단일 파일은 자동 skip,
              폴더 평균 5MB 초과면 'large file may be skipped' 안내. */}
          {(sizeWarnings.oversized.length > 0 || sizeWarnings.largeFolders.length > 0) && (
            <div
              className="mt-3 rounded-xl border p-3 text-[12.5px]"
              style={{ background: tokens.warningBg, borderColor: 'rgba(146,64,14,0.18)', color: tokens.warningText }}
            >
              <div className="mb-1 font-medium">{t.sizeWarnHead}</div>
              {sizeWarnings.oversized.map((f) => (
                <div key={f.name} className="break-all">{t.oversizedFile(f.name, f.mb)}</div>
              ))}
              {sizeWarnings.largeFolders.map((f) => (
                <div key={f.name} className="break-all">📁 {f.name} — {t.largeFolderHint(f.avgMb)}</div>
              ))}
            </div>
          )}

          <div className="mt-3 text-[11.5px]" style={{ color: tokens.textFaint }}>
            {t.aboutCharge}
          </div>

          {/* 버튼 */}
          <div className="mt-5 flex flex-col gap-2">
            {risky ? (
              <>
                {onCapTop200 && (
                  <button onClick={onCapTop200}
                    className="rounded-xl px-3 py-2.5 text-[13px] font-medium"
                    style={{ background: tokens.text, color: tokens.bg }}>
                    {t.riskOptCap}
                  </button>
                )}
                <button onClick={onClose}
                  className="rounded-xl px-3 py-2.5 text-[13px] font-medium"
                  style={{ background: tokens.surfaceAlt, color: tokens.text }}>
                  {t.riskOptOther}
                </button>
                <button onClick={onConfirm}
                  className="rounded-xl px-3 py-2.5 text-[12.5px]"
                  style={{ background: 'transparent', color: tokens.dangerText }}>
                  {t.riskOptForce}
                </button>
              </>
            ) : (
              <div className="flex gap-2">
                <button onClick={onClose}
                  className="flex-1 rounded-xl px-3 py-2.5 text-[13px] font-medium"
                  style={{ background: tokens.surfaceAlt, color: tokens.text }}>
                  {t.cancel}
                </button>
                <button onClick={onConfirm}
                  className="flex-1 rounded-xl px-3 py-2.5 text-[13px] font-medium"
                  style={{ background: tokens.accent, color: '#fff' }}>
                  {t.start}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
