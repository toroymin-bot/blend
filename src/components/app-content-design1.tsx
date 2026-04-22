'use client';

/**
 * AppContentDesign1 — Phase 3 (경로 C 하이브리드)
 *
 * 사이드바: Chat / Compare / Documents / Meeting / Billing (5개 노출)
 * ··· 팝오버: DataSources / Models / Agents / CostSavings / Dashboard / Security / Settings / About (8개 숨김)
 * 뷰 컴포넌트: 원본 재사용으로 즉시 feature parity 달성
 */

import { useState, useRef, useEffect } from 'react';
import {
  MessageSquare, GitCompare, FileText, Mic, CreditCard,
  HardDrive, Cpu, Bot, Sparkles, BarChart3, Shield, Settings2, Info,
  MoreHorizontal, Plus, Search, X,
} from 'lucide-react';

import D1ChatView from '@/modules/chat/chat-view-design1';
import { ModelCompareView }     from '@/modules/models/model-compare-view';
import { DocumentPluginView }   from '@/modules/plugins/document-plugin-view';
import { MeetingView }          from '@/modules/meeting/meeting-view';
import { BillingView }          from '@/modules/ui/billing-view';
import { DataSourceView }       from '@/modules/datasources/datasource-view';
import { ModelsView }           from '@/modules/models/models-view';
import { AgentsView }           from '@/modules/agents/agents-view';
import { CostSavingsDashboard } from '@/modules/ui/cost-savings-dashboard';
import { DashboardView }        from '@/modules/ui/dashboard-view';
import { SecurityView }         from '@/modules/ui/security-view';
import { SettingsView }         from '@/modules/settings/settings-view';
import { AboutView }            from '@/modules/ui/about-view';

// ── Design tokens ───────────────────────────────────────────────
const tokens = {
  bg:          '#fafaf9',
  text:        '#0a0a0a',
  textDim:     '#6b6862',
  textFaint:   '#a8a49b',
  border:      'rgba(10, 10, 10, 0.06)',
  borderStrong:'rgba(10, 10, 10, 0.12)',
  accent:      '#c65a3c',
  accentSoft:  'rgba(198, 90, 60, 0.08)',
} as const;

// ── Types ────────────────────────────────────────────────────────
type ViewId =
  | 'chat' | 'compare' | 'documents' | 'meeting' | 'billing'
  | 'datasources' | 'models' | 'agents' | 'savings' | 'dashboard'
  | 'security' | 'settings' | 'about';

type ConvSummary = { id: number; title: string };

// ── Nav items ────────────────────────────────────────────────────
const MAIN_NAV: { id: ViewId; icon: React.ReactNode; labelKo: string; labelEn: string }[] = [
  { id: 'chat',      icon: <MessageSquare size={18} />, labelKo: '채팅',      labelEn: 'Chat' },
  { id: 'compare',   icon: <GitCompare    size={18} />, labelKo: '모델 비교', labelEn: 'Compare' },
  { id: 'documents', icon: <FileText      size={18} />, labelKo: '문서',      labelEn: 'Documents' },
  { id: 'meeting',   icon: <Mic           size={18} />, labelKo: '회의',      labelEn: 'Meeting' },
  { id: 'billing',   icon: <CreditCard    size={18} />, labelKo: '요금제',    labelEn: 'Billing' },
];

const MORE_NAV: { id: ViewId; icon: React.ReactNode; labelKo: string; labelEn: string }[] = [
  { id: 'datasources', icon: <HardDrive  size={16} />, labelKo: '데이터 소스', labelEn: 'Data Sources' },
  { id: 'models',      icon: <Cpu        size={16} />, labelKo: '모델',        labelEn: 'Models' },
  { id: 'agents',      icon: <Bot        size={16} />, labelKo: '에이전트',    labelEn: 'Agents' },
  { id: 'savings',     icon: <Sparkles   size={16} />, labelKo: '절약 분석',   labelEn: 'Cost Savings' },
  { id: 'dashboard',   icon: <BarChart3  size={16} />, labelKo: '대시보드',    labelEn: 'Dashboard' },
  { id: 'security',    icon: <Shield     size={16} />, labelKo: '보안',        labelEn: 'Security' },
  { id: 'settings',    icon: <Settings2  size={16} />, labelKo: '설정',        labelEn: 'Settings' },
  { id: 'about',       icon: <Info       size={16} />, labelKo: '소개',        labelEn: 'About' },
];

// ── Main component ───────────────────────────────────────────────
export default function AppContentDesign1({ urlLang }: { urlLang: 'ko' | 'en' }) {
  const lang = urlLang;
  const [convKey,     setConvKey]     = useState(0);
  const [history,     setHistory]     = useState<ConvSummary[]>([]);
  const [activeView,  setActiveView]  = useState<ViewId>('chat');
  const [showMore,    setShowMore]    = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  function handleNewChat() { setConvKey((k) => k + 1); setActiveView('chat'); }
  function handleConversationStart(title: string) {
    setHistory((prev) => [{ id: convKey, title }, ...prev].slice(0, 8));
  }
  function handleNav(id: ViewId) {
    setActiveView(id);
    setShowMore(false);
  }

  // Close ··· popover on outside click
  useEffect(() => {
    if (!showMore) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setShowMore(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [showMore]);

  const label = (item: { labelKo: string; labelEn: string }) =>
    lang === 'ko' ? item.labelKo : item.labelEn;

  // ── View renderer ──────────────────────────────────────────────
  function renderView() {
    switch (activeView) {
      case 'chat':        return <D1ChatView key={convKey} lang={lang} onConversationStart={handleConversationStart} />;
      case 'compare':     return <div className="h-full overflow-auto bg-surface"><ModelCompareView /></div>;
      case 'documents':   return <div className="h-full overflow-auto bg-surface"><DocumentPluginView /></div>;
      case 'meeting':     return <div className="h-full overflow-auto bg-surface"><MeetingView /></div>;
      case 'billing':     return <div className="h-full overflow-auto bg-surface"><BillingView /></div>;
      case 'datasources': return <div className="h-full overflow-auto bg-surface"><DataSourceView /></div>;
      case 'models':      return <div className="h-full overflow-auto bg-surface"><ModelsView /></div>;
      case 'agents':      return <div className="h-full overflow-auto bg-surface"><AgentsView /></div>;
      case 'savings':     return <div className="h-full overflow-auto bg-surface p-6"><CostSavingsDashboard /></div>;
      case 'dashboard':   return <div className="h-full overflow-auto bg-surface"><DashboardView /></div>;
      case 'security':    return <div className="h-full overflow-auto bg-surface"><SecurityView /></div>;
      case 'settings':    return <div className="h-full overflow-auto bg-surface"><SettingsView /></div>;
      case 'about':       return <div className="h-full overflow-auto bg-surface"><AboutView onNavigate={(tab) => handleNav(tab as ViewId)} /></div>;
      default:            return null;
    }
  }

  return (
    <div
      className="grid h-screen overflow-hidden"
      style={{ gridTemplateColumns: 'auto 1fr', background: tokens.bg, color: tokens.text }}
    >
      {/* ── Sidebar ───────────────────────────────────────────── */}
      <aside
        className="group relative flex w-16 flex-col overflow-hidden border-r py-4 transition-[width] duration-[450ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:w-[220px] hover:bg-white/70 hover:backdrop-blur-xl hover:backdrop-saturate-150"
        style={{ borderColor: tokens.border }}
      >
        {/* Logo + New Chat */}
        <div className="mb-5 flex h-10 w-full items-center justify-between pl-[15px] pr-2">
          <span
            className="leading-none tracking-tight"
            style={{ fontFamily: '"Instrument Serif", Georgia, serif', fontSize: 26 }}
          >
            B
          </span>
          <button
            onClick={handleNewChat}
            title={lang === 'ko' ? '새 채팅' : 'New chat'}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg opacity-0 transition-all duration-150 hover:bg-black/5 group-hover:opacity-100"
            style={{ color: tokens.textDim }}
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Search */}
        <D1SidebarBtn
          title={lang === 'ko' ? '검색' : 'Search'}
          active={false}
          onClick={() => {}}
        >
          <Search size={18} />
        </D1SidebarBtn>

        {/* ─ Main 5 nav items ─ */}
        <div className="mt-1 flex flex-col gap-0.5">
          {MAIN_NAV.map((item) => (
            <D1SidebarBtn
              key={item.id}
              title={label(item)}
              active={activeView === item.id}
              onClick={() => handleNav(item.id)}
            >
              {item.icon}
            </D1SidebarBtn>
          ))}
        </div>

        {/* Recent conversations (chat view만) */}
        {activeView === 'chat' && (
          <div className="pointer-events-none mt-4 min-w-0 flex-1 overflow-y-auto px-2 opacity-0 transition-opacity duration-200 delay-75 group-hover:pointer-events-auto group-hover:opacity-100">
            <div
              className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.1em]"
              style={{ color: tokens.textFaint }}
            >
              {lang === 'ko' ? '최근' : 'Recent'}
            </div>
            {history.length === 0 ? (
              <div className="px-2 py-1.5 text-[12px]" style={{ color: tokens.textFaint }}>
                {lang === 'ko' ? '대화 없음' : 'No conversations'}
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {history.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={handleNewChat}
                    title={conv.title}
                    className="w-full truncate rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors hover:bg-black/5"
                    style={{ color: tokens.textDim }}
                  >
                    {conv.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─ Bottom: ··· more menu ─ */}
        <div ref={moreRef} className="relative mt-auto flex w-full flex-col gap-0.5">
          {/* More popover */}
          {showMore && (
            <div
              className="absolute bottom-full left-2 right-2 mb-1 overflow-hidden rounded-[14px] border py-1 shadow-[0_20px_60px_rgba(0,0,0,0.15)]"
              style={{
                background: 'rgba(255,255,255,0.92)',
                backdropFilter: 'saturate(180%) blur(20px)',
                borderColor: tokens.borderStrong,
                animation: 'd1-rise 200ms cubic-bezier(0.16,1,0.3,1) both',
              }}
            >
              {MORE_NAV.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleNav(item.id)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-[13px] transition-colors hover:bg-black/5"
                  style={{
                    color: activeView === item.id ? tokens.accent : tokens.text,
                    fontWeight: activeView === item.id ? 500 : 400,
                  }}
                >
                  <span style={{ color: activeView === item.id ? tokens.accent : tokens.textDim }}>
                    {item.icon}
                  </span>
                  {label(item)}
                </button>
              ))}
            </div>
          )}

          <D1SidebarBtn
            title={lang === 'ko' ? '더보기' : 'More'}
            active={MORE_NAV.some((m) => m.id === activeView)}
            onClick={() => setShowMore((s) => !s)}
          >
            {showMore ? <X size={18} /> : <MoreHorizontal size={18} />}
          </D1SidebarBtn>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────── */}
      <main className="relative flex flex-col overflow-hidden">
        {renderView()}
      </main>

      {/* Global keyframes */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes d1-rise {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}} />
    </div>
  );
}

// ── Sidebar button ───────────────────────────────────────────────
function D1SidebarBtn({
  children,
  title,
  active,
  onClick,
}: {
  children: React.ReactNode;
  title?: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-9 w-full items-center gap-3 rounded-[10px] border-none pl-[13px] pr-3 text-left transition-colors duration-150"
      style={{
        background: active ? tokens.accentSoft : 'transparent',
        color: active ? tokens.accent : tokens.text,
      }}
      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.04)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = active ? tokens.accentSoft : 'transparent'; }}
    >
      <span
        className="flex h-[18px] w-[18px] shrink-0 items-center justify-center"
        style={{ color: active ? tokens.accent : tokens.textDim }}
      >
        {children}
      </span>
      {title && (
        <span
          className="truncate text-[13px] font-normal opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          style={{ transitionDelay: '60ms', fontWeight: active ? 500 : 400 }}
        >
          {title}
        </span>
      )}
    </button>
  );
}
