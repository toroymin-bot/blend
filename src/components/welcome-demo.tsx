'use client';

// Welcome Demo 60s — Tori 명세 16384367 Stage 1
// 5-slide interactive tour. localStorage 'blend:welcome-shown'으로 중복 방지.
// 키보드: ← → ESC Enter. 자동 진행 X (다음 → 클릭만).
// 모바일 < 768px → full-screen. desktop → 480x560 모달.

import { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '@/lib/use-focus-trap';

const STORAGE_KEY = 'blend:welcome-shown';

export type WelcomeLang = 'ko' | 'en';

interface SlideCopy {
  ko: string;
  en: string;
}

const SLIDES: { id: number; visual: string; title: SlideCopy }[] = [
  {
    id: 1,
    visual: '🤖🌐🧠⚡🔍',
    title: { ko: '5개의 AI를 하나의 키로.', en: 'Every AI, with one key.' },
  },
  {
    id: 2,
    visual: '₩83,000  →  ₩12,420',
    title: { ko: '월 ₩70,580 절약.', en: 'Save $51/month.' },
  },
  {
    id: 3,
    visual: '✉️ → GPT  ·  🖼️ → Gemini  ·  💻 → Claude',
    title: { ko: '최적 AI 자동 선택.', en: 'Auto-pick the best AI.' },
  },
  {
    id: 4,
    visual: '👤 ↔ 🔒 ↔ AI',
    title: { ko: '내 데이터, 내 디바이스에만.', en: 'Your data stays on your device.' },
  },
  {
    id: 5,
    visual: '💬',
    title: { ko: '지금 시작 — 30초면 첫 답변.', en: 'Start now — first reply in 30 seconds.' },
  },
];

const COPY = {
  ko: { next: '다음 →', skip: '건너뛰기', start: '🚀 지금 시작', guide: '📖 가이드 보기', explore: '둘러보기' },
  en: { next: 'Next →', skip: 'Skip',     start: '🚀 Start now', guide: '📖 View guide',  explore: 'Explore' },
};

const tokens = {
  bg:           'var(--d1-bg, #fafaf9)',
  surface:      'var(--d1-surface, #ffffff)',
  text:         'var(--d1-text, #0a0a0a)',
  textDim:      'var(--d1-text-dim, #6b6b6b)',
  textFaint:    'var(--d1-text-faint, #a0a0a0)',
  accent:       'var(--d1-accent, #c65a3c)',
  border:       'var(--d1-border, #e5e5e5)',
  overlay:      'rgba(0,0,0,0.4)',
  progressInactive: '#e5e5e5',
};

export function hasSeenWelcome(): boolean {
  if (typeof window === 'undefined') return true;
  try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return true; }
}

export function markWelcomeSeen(): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, 'true'); } catch {}
}

export function clearWelcomeSeen(): void {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

export interface WelcomeDemoProps {
  lang: WelcomeLang;
  open: boolean;
  onClose: () => void;
  onStart?: () => void;
  onGuide?: () => void;
}

export function WelcomeDemo({ lang, open, onClose, onStart, onGuide }: WelcomeDemoProps) {
  const [slide, setSlide] = useState(1);
  const [fading, setFading] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const t = COPY[lang];

  // 슬라이드 전환 (200ms fade)
  function goTo(next: number) {
    if (next < 1 || next > 5 || next === slide) return;
    setFading(true);
    setTimeout(() => {
      setSlide(next);
      setFading(false);
    }, 200);
  }
  function nextSlide() { if (slide < 5) goTo(slide + 1); }
  function prevSlide() { if (slide > 1) goTo(slide - 1); }
  function close(reason: 'completed' | 'skipped') {
    markWelcomeSeen();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('blend:welcome-' + reason, { detail: { slide } }));
    }
    onClose();
  }

  // 키보드 — open일 때만
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { close('skipped'); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { nextSlide(); }
      else if (e.key === 'ArrowLeft') { prevSlide(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, slide]);

  // open 시 슬라이드 1로 리셋 + 포커스
  useEffect(() => {
    if (open) {
      setSlide(1);
      setTimeout(() => dialogRef.current?.focus(), 100);
    }
  }, [open]);

  // [2026-04-26] Sprint 4 — focus trap (Tab 순환을 dialog 안으로 한정)
  useFocusTrap(dialogRef, open);

  if (!open) return null;

  const cur = SLIDES.find((s) => s.id === slide)!;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={lang === 'ko' ? '60초 둘러보기' : '60-second tour'}
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: tokens.overlay }}
      onClick={() => close('skipped')}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[480px] mx-4 rounded-2xl outline-none"
        style={{
          background: tokens.surface,
          color: tokens.text,
          height: 'min(560px, 90vh)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
        }}
      >
        {/* 진행률 5점 */}
        <div className="absolute top-5 left-1/2 -translate-x-1/2 flex gap-1.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className="h-1.5 w-6 rounded-full transition-colors"
              style={{ background: i === slide ? tokens.accent : tokens.progressInactive }}
            />
          ))}
        </div>

        {/* 스킵 버튼 (우상단) */}
        <button
          type="button"
          onClick={() => close('skipped')}
          aria-label={t.skip}
          className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-md transition-opacity hover:opacity-70"
          style={{ color: tokens.textDim }}
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {/* 본문 */}
        <div
          className="flex h-full flex-col items-center justify-center px-8 py-16 text-center transition-opacity"
          style={{ opacity: fading ? 0 : 1, transitionDuration: '200ms' }}
        >
          <div
            className="mb-10 text-[40px] tracking-[-0.02em] leading-none"
            aria-hidden
            style={{ letterSpacing: cur.id === 2 ? '-0.01em' : undefined }}
          >
            {cur.visual}
          </div>
          <h2
            className="text-[24px] md:text-[28px] font-medium leading-[1.25] tracking-[-0.02em]"
            style={{ fontFamily: lang === 'ko' ? 'Pretendard, sans-serif' : 'Geist, sans-serif' }}
          >
            {cur.title[lang]}
          </h2>
        </div>

        {/* 하단 버튼 */}
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between gap-3 border-t px-6 py-5"
             style={{ borderColor: tokens.border }}>
          <button
            type="button"
            onClick={() => close('skipped')}
            className="text-[13px] transition-opacity hover:opacity-70"
            style={{ color: tokens.textFaint }}
          >
            {t.skip}
          </button>
          {slide < 5 ? (
            <button
              type="button"
              onClick={nextSlide}
              className="rounded-xl px-5 py-2.5 text-[13.5px] font-medium transition-opacity hover:opacity-90"
              style={{ background: tokens.text, color: tokens.bg }}
            >
              {t.next}
            </button>
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => { close('completed'); onStart?.(); }}
                className="rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition-opacity hover:opacity-90"
                style={{ background: tokens.accent, color: '#fff' }}
              >
                {t.start}
              </button>
              <button
                type="button"
                onClick={() => { close('completed'); onGuide?.(); }}
                className="rounded-xl px-4 py-2.5 text-[13.5px] font-medium transition-colors"
                style={{ background: 'transparent', color: tokens.text, border: `1px solid ${tokens.border}` }}
              >
                {t.guide}
              </button>
              <button
                type="button"
                onClick={() => close('completed')}
                className="rounded-xl px-3 py-2.5 text-[13px]"
                style={{ background: 'transparent', color: tokens.textDim }}
              >
                {t.explore}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
