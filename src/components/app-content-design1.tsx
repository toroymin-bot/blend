'use client';

/**
 * AppContentDesign1 — Phase 4 (Web Claude 디자인 스펙)
 *
 * 사이드바 구조 (잡스식):
 *   - 64px 아이콘 전용 → hover 시 280px 2열(아이콘+라벨+최근대화)
 *   - 보이는 5개: Chat / Compare / Documents / Meeting / Billing
 *   - ··· 팝오버 8개: DataSources / Models / Agents / CostSavings / Dashboard / Security / Settings / (divider) / About
 *   - Settings: ··· 안 + 하단 별도 아이콘 (1클릭 접근)
 *
 * 원본 뷰 컴포넌트 그대로 재사용 → 완전한 feature parity.
 * D1ChatView만 새 디자인 커스텀.
 */

import { useState, useEffect, useRef } from 'react';
import D1ChatView from '@/modules/chat/chat-view-design1';
import D1CompareView from '@/modules/compare/compare-view-design1';
import D1BillingView from '@/modules/billing/billing-view-design1';

// ── 원본 뷰 컴포넌트 재사용 (feature parity)
import { ModelCompareView }     from '@/modules/models/model-compare-view';
import { DocumentPluginView }   from '@/modules/plugins/document-plugin-view';
import { MeetingView }          from '@/modules/meeting/meeting-view';
import { DataSourceView }       from '@/modules/datasources/datasource-view';
import { ModelsView }           from '@/modules/models/models-view';
import { AgentsView }           from '@/modules/agents/agents-view';
import { CostSavingsDashboard } from '@/modules/ui/cost-savings-dashboard';
import { DashboardView }        from '@/modules/ui/dashboard-view';
import { D1SettingsView }       from '@/modules/settings/settings-view-design1';
import { SecurityView }         from '@/modules/ui/security-view';
import { AboutView }            from '@/modules/ui/about-view';

// ── Design1 온보딩
import { D1OnboardingView }     from '@/modules/onboarding/onboarding-view-design1';
import { useAPIKeyStore }       from '@/stores/api-key-store';

// ── Design tokens
const tokens = {
  bg:         '#fafaf9',
  text:       '#0a0a0a',
  textDim:    '#6b6862',
  textFaint:  '#a8a49b',
  border:     'rgba(10, 10, 10, 0.06)',
  borderMid:  'rgba(10, 10, 10, 0.10)',
  accent:     '#c65a3c',
  accentSoft: 'rgba(198, 90, 60, 0.10)',
} as const;

type ViewId =
  | 'chat' | 'compare' | 'documents' | 'meeting' | 'billing'
  | 'datasources' | 'models' | 'agents' | 'savings' | 'dashboard'
  | 'settings' | 'security' | 'about';

type ConvSummary = { id: number; title: string };

const labels = {
  ko: { logo: 'Blend', newChat: '새 채팅', search: '검색', chat: '채팅', compare: '모델 비교', documents: '문서', meeting: '회의', billing: '요금제', more: '더보기', settings: '설정', datasources: '데이터 소스', models: '모델', agents: '에이전트', savings: '비용 절감', dashboard: '대시보드', security: '보안', about: '소개', recent: '최근', noConvs: '아직 대화가 없습니다' },
  en: { logo: 'Blend', newChat: 'New chat', search: 'Search', chat: 'Chat', compare: 'Compare', documents: 'Documents', meeting: 'Meeting', billing: 'Billing', more: 'More', settings: 'Settings', datasources: 'Data Sources', models: 'Models', agents: 'Agents', savings: 'Cost Savings', dashboard: 'Dashboard', security: 'Security', about: 'About', recent: 'Recent', noConvs: 'No conversations yet' },
} as const;

export default function AppContentDesign1({ urlLang }: { urlLang: 'ko' | 'en' }) {
  const lang = urlLang;
  const t = labels[lang];

  // ── 온보딩: 이벤트 기반 (d1:open-onboarding) ───────────────────
  const { loadFromStorage } = useAPIKeyStore();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    loadFromStorage();
  }, []);

  // d1:open-onboarding 이벤트 → 온보딩 열기
  useEffect(() => {
    const handler = () => setShowOnboarding(true);
    window.addEventListener('d1:open-onboarding', handler);
    return () => window.removeEventListener('d1:open-onboarding', handler);
  }, []);

  // 온보딩 완료 시 메인 앱으로 전환
  const handleOnboardingDone = () => setShowOnboarding(false);

  const [activeView,       setActiveView]       = useState<ViewId>('chat');
  const [convKey,          setConvKey]          = useState(0);
  const [chatInitialModel, setChatInitialModel] = useState<string | undefined>();
  const [history,    setHistory]    = useState<ConvSummary[]>([]);
  const [showMore,   setShowMore]   = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);

  function handleNewChat() {
    setActiveView('chat');
    setConvKey((k) => k + 1);
    setChatInitialModel(undefined);
  }

  function handleContinueInChat(modelId: string) {
    setActiveView('chat');
    setConvKey((k) => k + 1);
    setChatInitialModel(modelId);
  }

  function handleConversationStart(title: string) {
    setHistory((prev) => [{ id: convKey, title }, ...prev].slice(0, 8));
  }

  function nav(id: ViewId) {
    setActiveView(id);
    setShowMore(false);
  }

  // Close popover on outside click
  useEffect(() => {
    if (!showMore) return;
    const handler = (e: MouseEvent) => {
      const popover = document.getElementById('d1-more-popover');
      if (
        moreRef.current && !moreRef.current.contains(e.target as Node) &&
        popover && !popover.contains(e.target as Node)
      ) setShowMore(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [showMore]);

  function renderView() {
    if (activeView === 'chat') {
      return <D1ChatView key={convKey} lang={lang} initialModel={chatInitialModel} onConversationStart={handleConversationStart} />;
    }
    const map: Partial<Record<ViewId, React.ReactNode>> = {
      compare:     <D1CompareView lang={lang} onContinueInChat={handleContinueInChat} />,
      documents:   <DocumentPluginView />,
      meeting:     <MeetingView />,
      billing:     <D1BillingView lang={lang} />,
      datasources: <DataSourceView />,
      models:      <ModelsView />,
      agents:      <AgentsView />,
      savings:     <CostSavingsDashboard />,
      dashboard:   <DashboardView />,
      settings:    <D1SettingsView />,
      security:    <SecurityView />,
      about:       <AboutView onNavigate={(tab) => nav(tab as ViewId)} />,
    };
    return <div className="h-full overflow-y-auto bg-surface">{map[activeView]}</div>;
  }

  // ── Popover items (hidden 8개 + About)
  const moreItems: [ViewId, string, React.ReactNode][] = [
    ['datasources', t.datasources, <DataSourcesIcon key="ds" />],
    ['models',      t.models,      <ModelsIcon      key="mo" />],
    ['agents',      t.agents,      <AgentsIcon      key="ag" />],
    ['savings',     t.savings,     <SavingsIcon     key="sa" />],
    ['dashboard',   t.dashboard,   <DashboardIcon   key="da" />],
    ['security',    t.security,    <SecurityIcon    key="se" />],
    ['settings',    t.settings,    <SettingsIcon    key="st" />],
  ];

  // 온보딩 화면
  if (showOnboarding) {
    return <D1OnboardingView onDone={handleOnboardingDone} lang={lang} />;
  }

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: tokens.bg }}
    >
      {/* ══ SIDEBAR (desktop only) ══ */}
      <aside
        className="group relative hidden md:flex w-16 shrink-0 flex-col border-r transition-[width] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:w-[280px]"
        style={{ borderColor: tokens.border, background: tokens.bg }}
      >
        {/* Logo — click = new chat */}
        <button
          onClick={handleNewChat}
          className="mb-4 flex h-12 w-full shrink-0 items-center pl-[17px]"
          title={t.newChat}
        >
          <span className="shrink-0 leading-none" style={{ fontFamily: '"Instrument Serif", Georgia, serif', fontSize: 28, color: tokens.text }}>B</span>
          <span className="ml-3 truncate text-[15px] font-semibold tracking-tight opacity-0 transition-opacity duration-150 delay-[60ms] group-hover:opacity-100" style={{ color: tokens.text }}>
            {t.logo}
          </span>
        </button>

        {/* New chat + Search */}
        <SbBtn title={t.newChat} onClick={handleNewChat}><PlusIcon /></SbBtn>
        <SbBtn title={t.search}><SearchIcon /></SbBtn>

        {/* Divider */}
        <div className="mx-4 my-2.5 shrink-0" style={{ height: 1, background: tokens.borderMid }} />

        {/* Main nav 5개 */}
        <SbNavBtn active={activeView==='chat'}      title={t.chat}      onClick={() => nav('chat')}>      <ChatIcon />      </SbNavBtn>
        <SbNavBtn active={activeView==='compare'}   title={t.compare}   onClick={() => nav('compare')}>   <CompareIcon />   </SbNavBtn>
        <SbNavBtn active={activeView==='documents'} title={t.documents} onClick={() => nav('documents')}> <DocumentsIcon /> </SbNavBtn>
        <SbNavBtn active={activeView==='meeting'}   title={t.meeting}   onClick={() => nav('meeting')}>   <MeetingIcon />   </SbNavBtn>
        <SbNavBtn active={activeView==='billing'}   title={t.billing}   onClick={() => nav('billing')}>   <BillingIcon />   </SbNavBtn>

        {/* Recent conversations (expanded only) */}
        <div className="pointer-events-none min-w-0 flex-1 overflow-y-auto px-3 pt-3 opacity-0 transition-opacity duration-150 delay-75 group-hover:pointer-events-auto group-hover:opacity-100">
          <p className="mb-1 px-2 text-[10.5px] font-medium uppercase tracking-[0.08em]" style={{ color: tokens.textFaint }}>{t.recent}</p>
          {history.length === 0
            ? <p className="px-2 py-1.5 text-[12.5px]" style={{ color: tokens.textFaint }}>{t.noConvs}</p>
            : <div className="flex flex-col gap-px">
                {history.map((c) => (
                  <button key={c.id} onClick={() => { nav('chat'); setConvKey((k) => k + 1); }} title={c.title}
                    className="w-full truncate rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors hover:bg-black/5" style={{ color: tokens.textDim }}>
                    {c.title}
                  </button>
                ))}
              </div>
          }
        </div>

        {/* Bottom: ··· + Settings */}
        <div className="mt-auto flex shrink-0 flex-col pb-3">
          {/* ··· More button + popover */}
          <div className="relative">
            <button
              ref={moreRef}
              onClick={() => setShowMore((s) => !s)}
              title={t.more}
              className="flex h-10 w-full shrink-0 items-center gap-3 rounded-[10px] border-none bg-transparent pl-[17px] pr-3 transition-colors duration-150 hover:bg-black/5"
              style={{ color: showMore ? tokens.accent : tokens.text }}
            >
              <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center"><MoreIcon /></span>
              <span className="truncate text-[13px] opacity-0 transition-opacity duration-150 delay-[60ms] group-hover:opacity-100" style={{ color: tokens.text }}>{t.more}</span>
            </button>

            {showMore && (
              <div
                id="d1-more-popover"
                className="absolute bottom-full left-2 z-50 mb-2 w-52 overflow-hidden rounded-[14px] border py-1.5"
                style={{
                  background: 'rgba(255,255,255,0.94)',
                  backdropFilter: 'saturate(180%) blur(20px)',
                  WebkitBackdropFilter: 'saturate(180%) blur(20px)',
                  borderColor: tokens.borderMid,
                  boxShadow: '0 12px 40px rgba(0,0,0,0.12)',
                  animation: 'popoverRise 180ms cubic-bezier(0.16,1,0.3,1) both',
                }}
              >
                {moreItems.map(([id, label, icon]) => (
                  <button key={id} onClick={() => nav(id)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] transition-colors hover:bg-black/5"
                    style={{ color: activeView === id ? tokens.accent : tokens.text }}
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center" style={{ color: activeView === id ? tokens.accent : tokens.textDim }}>{icon}</span>
                    {label}
                  </button>
                ))}
                <div className="mx-3 my-1" style={{ height: 1, background: tokens.border }} />
                <button onClick={() => nav('about')}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] transition-colors hover:bg-black/5"
                  style={{ color: activeView === 'about' ? tokens.accent : tokens.text }}
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center" style={{ color: activeView === 'about' ? tokens.accent : tokens.textDim }}><AboutIcon /></span>
                  {t.about}
                </button>
              </div>
            )}
          </div>

          {/* Settings — quick access */}
          <SbNavBtn active={activeView==='settings'} title={t.settings} onClick={() => nav('settings')}>
            <SettingsIcon />
          </SbNavBtn>
        </div>
      </aside>

      {/* ══ MAIN ══ */}
      <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div
          className="flex h-12 shrink-0 items-center gap-3 border-b px-4 md:hidden"
          style={{ borderColor: tokens.border, background: tokens.bg }}
        >
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-black/5"
            style={{ color: tokens.text }}
            aria-label="Menu"
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
              <path d="M3 6h18M3 12h18M3 18h18"/>
            </svg>
          </button>
          <span style={{ fontFamily: '"Instrument Serif", Georgia, serif', fontSize: 22, color: tokens.text, lineHeight: 1 }}>B</span>
          <span className="text-[15px] font-semibold tracking-tight" style={{ color: tokens.text }}>{t.logo}</span>
        </div>
        {renderView()}
      </main>

      {/* ══ MOBILE DRAWER ══ */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <aside
            className="absolute left-0 top-0 flex h-full w-[280px] flex-col border-r"
            style={{
              background: tokens.bg,
              borderColor: tokens.border,
              animation: 'drawerSlide 280ms cubic-bezier(0.16,1,0.3,1) both',
            }}
          >
            <button onClick={handleNewChat} className="mb-4 flex h-12 w-full shrink-0 items-center pl-4" title={t.newChat}>
              <span style={{ fontFamily: '"Instrument Serif", Georgia, serif', fontSize: 28, color: tokens.text, lineHeight: 1 }}>B</span>
              <span className="ml-3 text-[15px] font-semibold tracking-tight" style={{ color: tokens.text }}>{t.logo}</span>
            </button>
            {([
              ['chat',      t.chat,      <ChatIcon      key="ch" />],
              ['compare',   t.compare,   <CompareIcon   key="cp" />],
              ['documents', t.documents, <DocumentsIcon key="dc" />],
              ['meeting',   t.meeting,   <MeetingIcon   key="me" />],
              ['billing',   t.billing,   <BillingIcon   key="bi" />],
            ] as [ViewId, string, React.ReactNode][]).map(([id, label, icon]) => (
              <button
                key={id}
                onClick={() => { nav(id); setDrawerOpen(false); }}
                className="flex h-10 w-full items-center gap-3 rounded-[10px] border-none pl-4 pr-3 text-[13px] transition-colors"
                style={{ color: activeView === id ? tokens.accent : tokens.text, background: activeView === id ? tokens.accentSoft : 'transparent' }}
              >
                <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center" style={{ color: activeView === id ? tokens.accent : tokens.textDim }}>{icon}</span>
                {label}
              </button>
            ))}
            <div className="mx-4 my-2.5 shrink-0" style={{ height: 1, background: tokens.borderMid }} />
            {moreItems.map(([id, label, icon]) => (
              <button
                key={id}
                onClick={() => { nav(id); setDrawerOpen(false); }}
                className="flex h-10 w-full items-center gap-3 rounded-[10px] border-none pl-4 pr-3 text-[13px] transition-colors hover:bg-black/5"
                style={{ color: activeView === id ? tokens.accent : tokens.text }}
              >
                <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center" style={{ color: activeView === id ? tokens.accent : tokens.textDim }}>{icon}</span>
                {label}
              </button>
            ))}
          </aside>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes popoverRise {
          from { opacity:0; transform:translateY(6px) scale(0.97); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        @keyframes drawerSlide {
          from { opacity:0; transform:translateX(-100%); }
          to   { opacity:1; transform:translateX(0); }
        }
      ` }} />
    </div>
  );
}

// ── Sidebar button primitives ─────────────────────────────────────

function SbBtn({ children, title, onClick }: { children: React.ReactNode; title?: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} title={title}
      className="flex h-10 w-full shrink-0 items-center gap-3 rounded-[10px] border-none bg-transparent pl-[17px] pr-3 transition-colors duration-150 hover:bg-black/5"
      style={{ color: tokens.text }}
    >
      <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">{children}</span>
      <span className="truncate text-[13px] opacity-0 transition-opacity duration-150 delay-[60ms] group-hover:opacity-100" style={{ color: tokens.text }}>{title}</span>
    </button>
  );
}

function SbNavBtn({ children, title, onClick, active }: { children: React.ReactNode; title?: string; onClick?: () => void; active: boolean }) {
  return (
    <button onClick={onClick} title={title}
      className="flex h-10 w-full shrink-0 items-center gap-3 rounded-[10px] border-none pl-[17px] pr-3 transition-colors duration-150"
      style={{ color: active ? tokens.accent : tokens.text, background: active ? tokens.accentSoft : 'transparent' }}
      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.05)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = active ? tokens.accentSoft : 'transparent'; }}
    >
      <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center" style={{ color: active ? tokens.accent : tokens.textDim }}>{children}</span>
      <span className="truncate text-[13px] opacity-0 transition-opacity duration-150 delay-[60ms] group-hover:opacity-100" style={{ color: active ? tokens.accent : tokens.text }}>{title}</span>
    </button>
  );
}

// ── SVG Icons (line-based) ────────────────────────────────────────
const ic  = { width:18, height:18, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:1.75, strokeLinecap:'round' as const, strokeLinejoin:'round' as const };
const ic2 = { ...ic, width:16, height:16 };

function PlusIcon()        { return <svg {...ic}><path d="M12 5v14M5 12h14"/></svg>; }
function SearchIcon()      { return <svg {...ic}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>; }
function ChatIcon()        { return <svg {...ic}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>; }
function CompareIcon()     { return <svg {...ic}><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>; }
function DocumentsIcon()   { return <svg {...ic}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8M16 17H8M10 9H8"/></svg>; }
function MeetingIcon()     { return <svg {...ic}><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>; }
function BillingIcon()     { return <svg {...ic}><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/></svg>; }
function MoreIcon()        { return <svg {...ic}><circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none"/></svg>; }
function SettingsIcon()    { return <svg {...ic}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>; }
function DataSourcesIcon() { return <svg {...ic2}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>; }
function ModelsIcon()      { return <svg {...ic2}><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>; }
function AgentsIcon()      { return <svg {...ic2}><path d="M12 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"/><path d="M2 20c0-4 4.5-7 10-7s10 3 10 7"/></svg>; }
function SavingsIcon()     { return <svg {...ic2}><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>; }
function DashboardIcon()   { return <svg {...ic2}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>; }
function SecurityIcon()    { return <svg {...ic2}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>; }
function AboutIcon()       { return <svg {...ic2}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>; }

void ic2;
