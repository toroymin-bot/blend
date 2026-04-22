'use client';

/**
 * AppContentDesign1 — Phase 3
 *
 * Layout: narrow icon sidebar (hover-expands) + main content area.
 * All chat logic delegated to D1ChatView.
 * Phase 3 adds: New Chat wiring, in-memory conversation history, Settings link.
 */

import { useState } from 'react';
import D1ChatView from '@/modules/chat/chat-view-design1';

const tokens = {
  bg: '#fafaf9',
  text: '#0a0a0a',
  textFaint: '#a8a49b',
  border: 'rgba(10, 10, 10, 0.06)',
} as const;

type ConvSummary = { id: number; title: string };

export default function AppContentDesign1({ urlLang }: { urlLang: 'ko' | 'en' }) {
  const lang = urlLang;
  const [convKey, setConvKey] = useState(0);
  const [history, setHistory] = useState<ConvSummary[]>([]);

  function handleNewChat() {
    setConvKey((k) => k + 1);
  }

  function handleConversationStart(title: string) {
    setHistory((prev) => [{ id: convKey, title }, ...prev].slice(0, 8));
  }

  return (
    <div
      className="grid h-screen overflow-hidden"
      style={{ gridTemplateColumns: 'auto 1fr', background: tokens.bg, color: tokens.text }}
    >
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside
        className="group relative flex w-16 flex-col overflow-hidden border-r py-5 transition-[width] duration-[450ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:w-[260px] hover:bg-white/60 hover:backdrop-blur-xl hover:backdrop-saturate-150"
        style={{ borderColor: tokens.border }}
      >
        {/* Logo */}
        <div
          className="mb-7 flex h-10 w-full items-center pl-[15px] leading-none tracking-tight"
          style={{ fontFamily: '"Instrument Serif", Georgia, serif', fontSize: 28 }}
        >
          B
        </div>

        <D1SidebarBtn title={lang === 'ko' ? '새 채팅' : 'New chat'} onClick={handleNewChat}>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </D1SidebarBtn>

        <D1SidebarBtn title={lang === 'ko' ? '검색' : 'Search'}>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
          </svg>
        </D1SidebarBtn>

        {/* Expanded sidebar content — recent conversations */}
        <div className="pointer-events-none mt-6 min-w-0 flex-1 overflow-y-auto px-3 opacity-0 transition-opacity duration-200 delay-100 group-hover:pointer-events-auto group-hover:opacity-100">
          <div className="mb-1 px-2 text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: tokens.textFaint }}>
            {lang === 'ko' ? '최근' : 'Recent'}
          </div>
          {history.length === 0 ? (
            <div className="px-2 py-2 text-[13px]" style={{ color: tokens.textFaint }}>
              {lang === 'ko' ? '아직 대화가 없습니다' : 'No conversations yet'}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {history.map((conv) => (
                <button
                  key={conv.id}
                  onClick={handleNewChat}
                  title={conv.title}
                  className="w-full truncate rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-black/5"
                  style={{ color: tokens.text }}
                >
                  {conv.title}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Settings button at bottom */}
        <div className="mt-auto flex w-full flex-col gap-1.5">
          <D1SidebarBtn
            title={lang === 'ko' ? '설정' : 'Settings'}
            onClick={() => { window.location.href = `/${lang}/settings`; }}
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </D1SidebarBtn>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────── */}
      <main className="relative flex flex-col overflow-hidden">
        <D1ChatView key={convKey} lang={lang} onConversationStart={handleConversationStart} />
      </main>
    </div>
  );
}

function D1SidebarBtn({
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
      className="flex h-10 w-full items-center gap-3 rounded-[10px] border-none bg-transparent pl-[15px] pr-3 transition-colors duration-150 hover:bg-black/5"
      style={{ color: tokens.text }}
    >
      {/* Icon — fixed width so it stays aligned in both collapsed + expanded states */}
      <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
        {children}
      </span>
      {/* Text label — fades in when sidebar expands on hover */}
      {title && (
        <span
          className="truncate text-[13.5px] font-normal opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          style={{ color: tokens.text, transitionDelay: '80ms' }}
        >
          {title}
        </span>
      )}
    </button>
  );
}
