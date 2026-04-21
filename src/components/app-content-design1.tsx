'use client';

/**
 * AppContentDesign1 — Jobs/Apple-inspired redesign (Phase 1: empty chat)
 *
 * Web Claude 설계 기반 구현. 원본 app-content.tsx와 완전 독립.
 * /design1/ko/qatest, /design1/en/qatest 에서만 렌더링됨.
 *
 * Phase 2 이후: 채팅 진행 중 뷰, AboutView, 모델 선택, 설정 순차 교체 예정
 */

import { useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import { useAPIKeyStore } from '@/stores/api-key-store';
import { useChatStore } from '@/stores/chat-store';

// ============================================================
// Design tokens — #c65a3c accent, warm off-white bg
// ============================================================
const tokens = {
  bg: '#fafaf9',
  surface: '#ffffff',
  text: '#0a0a0a',
  textDim: '#6b6862',
  textFaint: '#a8a49b',
  accent: '#c65a3c',
  border: 'rgba(10, 10, 10, 0.06)',
  borderStrong: 'rgba(10, 10, 10, 0.12)',
} as const;

// ============================================================
// i18n — co-located, expand as views grow
// ============================================================
const copy = {
  ko: {
    title: '오늘',
    titleAccent: '무엇을',
    titleEnd: '도와드릴까요?',
    subtitle: '모든 AI, 하나의 대화 안에.',
    placeholder: '무엇이든 물어보세요',
    suggestions: ['이메일 초안 작성', '이미지 분석', '코드 리뷰', '긴 텍스트 요약'],
    modelAuto: '자동',
    footer: 'Blend가 각 질문에 맞는 최적의 AI를 자동으로 선택합니다',
    sidebarRecent: '최근',
    sidebarEmpty: '대화가 없습니다',
    newChat: '새 채팅',
    search: '검색',
    settings: '설정',
    history: '기록',
    share: '공유',
    attach: '파일 첨부',
    voice: '음성 입력',
    send: '보내기',
    modelSelect: '자동 모델 선택',
  },
  en: {
    title: 'How can I',
    titleAccent: 'help',
    titleEnd: 'today?',
    subtitle: 'Every AI, inside one conversation.',
    placeholder: 'Ask anything',
    suggestions: ['Draft an email', 'Analyze this image', 'Review my code', 'Summarize a long text'],
    modelAuto: 'Auto',
    footer: 'Blend picks the best AI for each question automatically',
    sidebarRecent: 'Recent',
    sidebarEmpty: 'No conversations yet',
    newChat: 'New chat',
    search: 'Search',
    settings: 'Settings',
    history: 'History',
    share: 'Share',
    attach: 'Attach file',
    voice: 'Voice input',
    send: 'Send',
    modelSelect: 'Auto model selection',
  },
} as const;

type Lang = keyof typeof copy;

// ============================================================
// @keyframes rise — injected once via dangerouslySetInnerHTML
// ============================================================
const RISE_KEYFRAMES = `
@keyframes rise {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;

export default function AppContentDesign1() {
  // Source language from settings store (same pattern as original)
  const { settings, loadFromStorage: loadSettings } = useSettingsStore();
  const { loadFromStorage: loadAPIKeys } = useAPIKeyStore();
  const { loadFromStorage: loadChats } = useChatStore();

  const lang: Lang = (settings.language === 'ko' || settings.language === 'en')
    ? settings.language
    : 'en';
  const t = copy[lang];

  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load stores on mount
  useEffect(() => {
    loadSettings();
    loadAPIKeys();
    loadChats();
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }, [value]);

  // Focus on mount
  useEffect(() => {
    const id = setTimeout(() => textareaRef.current?.focus(), 400);
    return () => clearTimeout(id);
  }, []);

  const canSend = value.trim().length > 0;

  function handleSend() {
    if (!canSend) return;
    // TODO Phase 2: wire to chat store createChat + sendMessage
    console.log('[design1] send:', value);
    setValue('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  }

  const fontKo = '"Pretendard Variable", Pretendard, -apple-system, system-ui, sans-serif';
  const fontEn = '"Geist", -apple-system, system-ui, sans-serif';
  const fontBody = lang === 'ko' ? fontKo : fontEn;

  return (
    <>
      {/* Inject keyframes once */}
      <style dangerouslySetInnerHTML={{ __html: RISE_KEYFRAMES }} />

      <div
        className="grid h-dvh overflow-hidden"
        style={{ gridTemplateColumns: 'auto 1fr', background: tokens.bg, color: tokens.text, fontFamily: fontBody }}
      >
        {/* ==================== SIDEBAR ==================== */}
        <aside
          className="group relative flex w-16 flex-col items-center overflow-hidden border-r py-5 transition-[width] duration-300"
          style={{
            borderColor: tokens.border,
            transitionTimingFunction: 'cubic-bezier(0.32,0.72,0,1)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.width = '280px';
            (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.6)';
            (e.currentTarget as HTMLElement).style.backdropFilter = 'blur(20px) saturate(150%)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.width = '64px';
            (e.currentTarget as HTMLElement).style.background = '';
            (e.currentTarget as HTMLElement).style.backdropFilter = '';
          }}
        >
          {/* Logo */}
          <div
            className="mb-7 text-[28px] leading-none tracking-tight"
            style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}
          >
            B
          </div>

          <D1IconButton title={t.newChat}>
            <D1PlusIcon />
          </D1IconButton>
          <D1IconButton title={t.search}>
            <D1SearchIcon />
          </D1IconButton>

          {/* Expanded content — visible on sidebar hover */}
          <div
            className="mt-6 px-5 opacity-0 transition-opacity duration-200"
            style={{ width: '240px', pointerEvents: 'none' }}
            ref={(el) => {
              if (!el) return;
              const aside = el.closest('aside');
              if (!aside) return;
              const observer = new MutationObserver(() => {
                const w = (aside as HTMLElement).style.width;
                el.style.opacity = w === '280px' ? '1' : '0';
                el.style.pointerEvents = w === '280px' ? 'auto' : 'none';
              });
              observer.observe(aside as HTMLElement, { attributes: true, attributeFilter: ['style'] });
            }}
          >
            <div
              className="mb-2 px-2 text-[11px] font-medium uppercase"
              style={{ color: tokens.textFaint, letterSpacing: '0.08em' }}
            >
              {t.sidebarRecent}
            </div>
            <div className="px-2 py-2 text-[13px]" style={{ color: tokens.textFaint }}>
              {t.sidebarEmpty}
            </div>
          </div>

          <div className="mt-auto flex w-full flex-col items-center gap-1.5">
            <D1IconButton title={t.settings}>
              <D1SettingsIcon />
            </D1IconButton>
          </div>
        </aside>

        {/* ==================== MAIN ==================== */}
        <main className="relative flex flex-col overflow-hidden">
          {/* Top bar */}
          <header className="flex h-14 shrink-0 items-center justify-between px-8">
            <div className="flex items-center gap-2">
              <button
                className="inline-flex items-center gap-2 rounded-full border bg-transparent px-3 py-1.5 text-[13px] transition-colors duration-200 hover:bg-white"
                style={{ borderColor: tokens.borderStrong, color: tokens.text, paddingLeft: '10px' }}
                title={t.modelSelect}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: tokens.accent }} />
                {t.modelAuto}
                <D1ChevronIcon />
              </button>
            </div>
            <div className="flex items-center gap-1">
              <D1IconButton title={t.history}><D1HistoryIcon /></D1IconButton>
              <D1IconButton title={t.share}><D1ShareIcon /></D1IconButton>
            </div>
          </header>

          {/* Stage — centered content */}
          <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col items-center justify-center px-8 pb-[120px]">

            {/* Hero headline */}
            <div
              className="mb-12 text-center"
              style={{ animation: 'rise 700ms cubic-bezier(0.16,1,0.3,1) both' }}
            >
              <h1
                className="mb-3 font-medium leading-[1.15]"
                style={{
                  fontSize: 'clamp(32px, 4.5vw, 52px)',
                  letterSpacing: '-0.03em',
                  fontFamily: fontBody,
                }}
              >
                {t.title}{t.title ? ' ' : ''}
                <span
                  className="italic"
                  style={{
                    fontFamily: '"Instrument Serif", Georgia, serif',
                    color: tokens.accent,
                    fontWeight: 400,
                    letterSpacing: '-0.01em',
                  }}
                >
                  {t.titleAccent}
                </span>
                {t.titleEnd ? ' ' : ''}{t.titleEnd}
              </h1>
              <p className="text-base" style={{ color: tokens.textDim, letterSpacing: '-0.01em' }}>
                {t.subtitle}
              </p>
            </div>

            {/* Input box */}
            <div
              className="w-full max-w-[720px] rounded-[20px] border bg-white px-[18px] pt-4 pb-3 transition-shadow duration-200"
              style={{
                borderColor: tokens.borderStrong,
                boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
                animation: 'rise 700ms cubic-bezier(0.16,1,0.3,1) 120ms both',
              }}
              onFocus={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = '0 12px 40px rgba(0,0,0,0.08)';
              }}
              onBlur={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 32px rgba(0,0,0,0.06)';
              }}
            >
              <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t.placeholder}
                rows={1}
                className="w-full resize-none border-none bg-transparent text-base outline-none"
                style={{
                  fontFamily: fontBody,
                  color: tokens.text,
                  lineHeight: '1.5',
                  letterSpacing: '-0.01em',
                  minHeight: 28,
                  maxHeight: 200,
                }}
              />
              <div className="mt-2.5 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <D1IconButton title={t.attach}><D1AttachIcon /></D1IconButton>
                  <D1IconButton title={t.voice}><D1MicIcon /></D1IconButton>
                </div>
                <button
                  onClick={handleSend}
                  disabled={!canSend}
                  className="flex h-[34px] w-[34px] items-center justify-center rounded-full border-none transition-all duration-150"
                  style={{
                    background: canSend ? tokens.text : tokens.borderStrong,
                    color: canSend ? tokens.bg : tokens.textFaint,
                    transform: canSend ? 'none' : 'none',
                    cursor: canSend ? 'pointer' : 'not-allowed',
                  }}
                  onMouseEnter={(e) => { if (canSend) (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = ''; }}
                  title={t.send}
                >
                  <D1SendIcon />
                </button>
              </div>
            </div>

            {/* Suggestion chips */}
            <div
              className="mt-8 flex flex-wrap justify-center gap-2"
              style={{ animation: 'rise 700ms cubic-bezier(0.16,1,0.3,1) 240ms both' }}
            >
              {t.suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => { setValue(s); textareaRef.current?.focus(); }}
                  className="rounded-full border bg-transparent px-4 py-2 text-[13.5px] transition-all duration-200 hover:bg-white"
                  style={{
                    borderColor: tokens.borderStrong,
                    color: tokens.textDim,
                    fontFamily: fontBody,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.color = tokens.text;
                    (e.currentTarget as HTMLElement).style.borderColor = tokens.text;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.color = tokens.textDim;
                    (e.currentTarget as HTMLElement).style.borderColor = tokens.borderStrong;
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Footer hint */}
          <div
            className="absolute bottom-5 left-1/2 -translate-x-1/2 text-xs"
            style={{ color: tokens.textFaint, fontFamily: fontBody }}
          >
            {t.footer}
          </div>
        </main>
      </div>
    </>
  );
}

// ============================================================
// Shared small components (D1 prefix to avoid name collisions)
// ============================================================
function D1IconButton({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-9 w-9 items-center justify-center rounded-lg border-none bg-transparent transition-colors duration-150"
      style={{ color: tokens.textDim }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = tokens.text)}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = tokens.textDim)}
      onFocus={(e) => ((e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.04)')}
      onBlur={(e) => ((e.currentTarget as HTMLElement).style.background = '')}
    >
      {children}
    </button>
  );
}

// ============================================================
// Inline SVGs — no lucide/heroicons dependency for design1
// ============================================================
const d1Icon = {
  width: 18, height: 18, viewBox: '0 0 24 24',
  fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function D1PlusIcon() {
  return <svg {...d1Icon}><path d="M12 5v14M5 12h14" /></svg>;
}
function D1SearchIcon() {
  return <svg {...d1Icon}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>;
}
function D1SettingsIcon() {
  return (
    <svg {...d1Icon}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
function D1ChevronIcon() {
  return <svg {...d1Icon} width={14} height={14}><path d="m6 9 6 6 6-6" /></svg>;
}
function D1HistoryIcon() {
  return (
    <svg {...d1Icon}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" /><path d="M12 7v5l4 2" />
    </svg>
  );
}
function D1ShareIcon() {
  return (
    <svg {...d1Icon}>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <path d="m16 6-4-4-4 4" /><path d="M12 2v13" />
    </svg>
  );
}
function D1AttachIcon() {
  return (
    <svg {...d1Icon}>
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 17.93 8.8l-8.58 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
function D1MicIcon() {
  return (
    <svg {...d1Icon}>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}
function D1SendIcon() {
  return (
    <svg {...d1Icon}>
      <path d="m5 12 7-7 7 7" /><path d="M12 19V5" />
    </svg>
  );
}
