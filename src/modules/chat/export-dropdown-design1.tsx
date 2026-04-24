'use client';

import { useEffect, useRef } from 'react';
import type { D1ExportFormat } from './export-utils-design1';

const tokens = {
  surface:   '#ffffff',
  text:      '#0a0a0a',
  textDim:   '#6b6862',
  textFaint: '#a8a49b',
  border:    'rgba(10, 10, 10, 0.06)',
} as const;

interface D1ExportDropdownProps {
  open: boolean;
  onClose: () => void;
  onExport: (format: D1ExportFormat) => void;
  lang: 'ko' | 'en';
}

export function D1ExportDropdown({ open, onClose, onExport, lang }: D1ExportDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const mdHandler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // delay binding to avoid the click that opened us from closing us
    const id = setTimeout(() => {
      window.addEventListener('mousedown', mdHandler);
      window.addEventListener('keydown', keyHandler);
    }, 0);
    return () => {
      clearTimeout(id);
      window.removeEventListener('mousedown', mdHandler);
      window.removeEventListener('keydown', keyHandler);
    };
  }, [open, onClose]);

  if (!open) return null;

  const items: Array<{ format: D1ExportFormat; label: string; sub: string }> = [
    { format: 'md',   label: 'Markdown',                                  sub: '.md' },
    { format: 'txt',  label: lang === 'ko' ? '텍스트' : 'Text',           sub: '.txt' },
    { format: 'json', label: 'JSON',                                       sub: lang === 'ko' ? '백업용' : 'backup' },
    { format: 'pdf',  label: 'PDF',                                        sub: lang === 'ko' ? '인쇄 창' : 'print' },
  ];

  const fontFamily = lang === 'ko'
    ? '"Pretendard Variable", Pretendard, -apple-system, system-ui, sans-serif'
    : '"Geist", -apple-system, system-ui, sans-serif';

  return (
    <div
      ref={ref}
      className="absolute right-0 top-[44px] z-40 overflow-hidden rounded-[10px] border"
      style={{
        background:   tokens.surface,
        borderColor:  tokens.border,
        boxShadow:   '0 8px 24px rgba(0,0,0,0.12)',
        minWidth:     200,
        fontFamily,
        animation:   'd1-drop 160ms cubic-bezier(0.16,1,0.3,1) both',
      }}
    >
      <div
        className="px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.06em]"
        style={{ color: tokens.textFaint }}
      >
        {lang === 'ko' ? '대화 내보내기' : 'Export conversation'}
      </div>
      {items.map(({ format, label, sub }) => (
        <button
          key={format}
          onClick={() => { onExport(format); onClose(); }}
          className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-black/[0.04]"
        >
          <ExportIcon format={format} />
          <span className="flex-1 text-[13.5px]" style={{ color: tokens.text }}>{label}</span>
          <span className="text-[11px]" style={{ color: tokens.textFaint }}>{sub}</span>
        </button>
      ))}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes d1-drop {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
      `}} />
    </div>
  );
}

function ExportIcon({ format }: { format: D1ExportFormat }) {
  const common = {
    width: 14, height: 14, viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    style: { color: tokens.textDim },
  };
  if (format === 'json') {
    return (
      <svg {...common}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <path d="M10 13a1.5 1.5 0 0 1-3 0M14 13a1.5 1.5 0 0 0 3 0" />
      </svg>
    );
  }
  if (format === 'pdf') {
    return (
      <svg {...common}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <path d="M12 18v-6M9 15h6" />
      </svg>
    );
  }
  // md / txt
  return (
    <svg {...common}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8"  y2="13" />
      <line x1="16" y1="17" x2="8"  y2="17" />
      <line x1="10" y1="9"  x2="8"  y2="9"  />
    </svg>
  );
}
