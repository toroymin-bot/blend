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

import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { trackEvent, trackVisit } from '@/lib/analytics';
// IMP-020: Chat은 default landing이라 eager. 나머지 D1 뷰는 lazy chunk.
import D1ChatView from '@/modules/chat/chat-view-design1';
// [2026-04-26] BUG-FIX (16417011) — 사이드바 '최근'을 d1-chat-store에서 직접 가져옴
import { useD1ChatStore } from '@/stores/d1-chat-store';
import { useD1MemoryStore } from '@/stores/d1-memory-store';

const D1CompareView      = lazy(() => import('@/modules/compare/compare-view-design1'));
const D1BillingView      = lazy(() => import('@/modules/billing/billing-view-design1'));
const D1DocumentsView    = lazy(() => import('@/modules/documents/documents-view-design1'));
const D1ModelsView       = lazy(() => import('@/modules/models/models-view-design1'));
const D1DashboardView    = lazy(() => import('@/modules/dashboard/dashboard-view-design1'));
const D1AgentsView       = lazy(() => import('@/modules/agents/agents-view-design1'));
const D1MeetingView      = lazy(() => import('@/modules/meeting/meeting-view-design1'));
const D1DataSourcesView  = lazy(() => import('@/modules/datasources/datasources-view-design1'));
// [2026-04-26] F-3 — cost-savings 메뉴는 D1BillingView mode='savings'를 사용 (사용량/한도/SVG/모델별)
const D1CostSavingsView  = lazy(() =>
  import('@/modules/billing/billing-view-design1').then((m) => ({
    default: (props: { lang: 'ko' | 'en' | 'ph' }) => <m.default {...props} mode="savings" />,
  }))
);

// [2026-04-26] Sprint 1 (16384367) — Welcome Demo
import { WelcomeDemo, hasSeenWelcome } from '@/components/welcome-demo';
// [2026-04-27 BUG-005] localStorage quota exceeded surface
import { StorageQuotaToast } from '@/components/storage-quota-toast';
// [2026-04-26 Tori 16384118 §3.8~§3.10] 비용 한도 알림
import { CostAlertModal } from '@/modules/datasources/cost-alert-modal';
import { useCostStore } from '@/stores/d1-cost-store';
import { setupDailyReset, cancelDailyReset } from '@/lib/cost/daily-reset';
// [2026-04-26 Tori 16384118 §3.7] 큐 폴링 hook (Worker → 변경분 → 임베딩)
import { useDataSourceQueuePolling } from '@/hooks/use-datasource-queue-polling';
const D1SecurityView     = lazy(() => import('@/modules/security/security-view-design1'));
const D1AboutView        = lazy(() => import('@/modules/about/about-view-design1'));
// Roy 결정 2026-04-25: Prompts 메뉴 제거 (PromptsView 컴포넌트 자체는 보존 — '/' 슬래시 명령에 사용 가능)
const PluginsView        = lazy(() => import('@/modules/plugins/plugins-view').then(m => ({ default: m.PluginsView })));

// ── 원본 뷰 컴포넌트 재사용 (feature parity)
import { ModelCompareView }     from '@/modules/models/model-compare-view';
import { D1SettingsView }       from '@/modules/settings/settings-view-design1';

// ── Design1 온보딩
import { D1OnboardingView }     from '@/modules/onboarding/onboarding-view-design1';
import { useAPIKeyStore }       from '@/stores/api-key-store';

// ── Design tokens
const tokens = {
  bg:         'var(--d1-bg)',
  text:       'var(--d1-text)',
  textDim:    'var(--d1-text-dim)',
  textFaint:  'var(--d1-text-faint)',
  border:     'var(--d1-border)',
  borderMid:  'var(--d1-border-mid)',
  accent:     'var(--d1-accent)',
  accentSoft: 'var(--d1-accent-soft)',
} as const;

type ViewId =
  | 'chat' | 'compare' | 'documents' | 'meeting' | 'billing'
  | 'datasources' | 'models' | 'agents' | 'savings' | 'dashboard'
  | 'settings' | 'security' | 'about'
  | 'plugins'; // Roy 결정 2026-04-25: prompts 메뉴 제거

type ConvSummary = { id: number; title: string };

const labels = {
  ko: { logo: 'Blend', newChat: '새 채팅', search: '검색', chat: '채팅', compare: '모델 비교', documents: '문서', meeting: '회의', billing: '요금제', more: '더보기', settings: '설정', datasources: '데이터 소스', models: '모델', agents: '에이전트', savings: '비용 절감', dashboard: '대시보드', security: '보안', about: '소개', prompts: '프롬프트', plugins: '플러그인', recent: '최근', noConvs: '아직 대화가 없습니다' },
  en: { logo: 'Blend', newChat: 'New chat', search: 'Search', chat: 'Chat', compare: 'Compare', documents: 'Documents', meeting: 'Meeting', billing: 'Billing', more: 'More', settings: 'Settings', datasources: 'Data Sources', models: 'Models', agents: 'Agents', savings: 'Cost Savings', dashboard: 'Dashboard', security: 'Security', about: 'About', prompts: 'Prompts', plugins: 'Plugins', recent: 'Recent', noConvs: 'No conversations yet' },
  // [2026-05-04 Roy #17 후속] Filipino/Tagalog — sidebar 메뉴 라벨 따갈로그.
  // Tech terms (Models, Agents, Plugins) ay manatiling English — natural Taglish.
  ph: { logo: 'Blend', newChat: 'Bagong chat', search: 'Hanapin', chat: 'Chat', compare: 'Ihambing', documents: 'Mga Dokumento', meeting: 'Meeting', billing: 'Bayad', more: 'Higit pa', settings: 'Mga Setting', datasources: 'Data Sources', models: 'Models', agents: 'Agents', savings: 'Tipid', dashboard: 'Dashboard', security: 'Seguridad', about: 'Tungkol', prompts: 'Prompts', plugins: 'Plugins', recent: 'Kamakailan', noConvs: 'Wala pang usapan' },
} as const;

// [2026-04-26] BUG-FIX (16417011) — Roy 결정: 검색 메뉴 UI에서 숨김 (코드 유지)
// 향후 재활성화 시 한 줄 변경: SHOW_SEARCH_MENU = true
const SHOW_SEARCH_MENU = false;

// [2026-05-05 Roy PM-30] '60초 둘러보기' 메뉴 일시 비활성. 콘텐츠 정비 후 true로 복원.
// 데스크탑 ··· 팝오버 + 모바일 drawer 두 곳 모두 자동 적용됨.
const ENABLE_WELCOME_TOUR = false;

export default function AppContentDesign1({ urlLang }: { urlLang: 'ko' | 'en' | 'ph' }) {
  const lang = urlLang;
  // [2026-05-04 #17 후속] 'ph'에 sidebar 라벨 따갈로그 적용 — labels.ph 추가됨.
  const t = labels[lang];
  // [2026-05-05 ph 전면 적용] 자식 design1 컴포넌트들 모두 'ko' | 'en' | 'ph' 받게
  // 확장됨. childLang은 그대로 lang을 전달 — inline ternary `lang === 'ko' ? K : E`
  // 분기에 ph일 때 따갈로그 또는 en fallback이 컴포넌트별로 적용됨.
  const childLang: 'ko' | 'en' | 'ph' = lang;

  // ── 온보딩: 이벤트 기반 (d1:open-onboarding) ───────────────────
  const { loadFromStorage } = useAPIKeyStore();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    loadFromStorage();
    // Phase 6 — 방문 추적 (옵트아웃 + 일별 dedupe 처리됨)
    trackVisit();
    // TASK 4 Sprint 1 — IndexedDB 마이그레이션 (사용자 0명이라 즉시 종료)
    import('@/lib/db/migration').then(({ runMigrations }) => {
      runMigrations().catch((e) => console.error('[app] migration failed', e));
    });
    // [2026-04-26 Tori 16384118 §3.10] 비용 store 로드 + 자정 자동 리셋 스케줄링
    useCostStore.getState().loadFromStorage();
    setupDailyReset();
    return () => cancelDailyReset();
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

  // [2026-04-26] BUG-FIX (16417011) — d1-chat-store에서 실제 채팅 가져옴
  const d1Chats        = useD1ChatStore((s) => s.chats);
  const d1LoadFromDB   = useD1ChatStore((s) => s.loadFromStorage);
  useEffect(() => { d1LoadFromDB(); }, [d1LoadFromDB]);
  // [2026-05-02 Roy] 채팅 기억하기 — 사이드바와 chat-view가 같은 store 참조
  const memoryIds = useD1MemoryStore((s) => s.selectedIds);
  const recentChats = useMemo(
    () => [...d1Chats]
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt)
      .slice(0, 8),
    [d1Chats],
  );
  const [activeChatIdInSidebar, setActiveChatIdInSidebar] = useState<string | null>(null);

  // chat-view에 d1:load-chat 이벤트 전송 + chat 메뉴 활성
  // [2026-04-26 QA-BUG #3] 다른 view에 있을 때는 D1ChatView가 unmount 상태라
  // 즉시 dispatch는 listener가 없어 lost. 이를 위해 두 번 발화:
  //   ① 즉시 (이미 mount된 경우)
  //   ② 50ms 후 (chat-view mount + useEffect listener 등록될 시간 확보)
  function loadRecentChat(chatId: string) {
    setActiveView('chat');
    setActiveChatIdInSidebar(chatId);
    if (typeof window !== 'undefined') {
      const fire = () => window.dispatchEvent(new CustomEvent('d1:load-chat', { detail: { id: chatId } }));
      fire();
      setTimeout(fire, 50);
    }
  }

  function handleNewChat() {
    setActiveView('chat');
    setConvKey((k) => k + 1);
    setChatInitialModel(undefined);
    // [2026-04-26] BUG-FIX (16417011) — 사이드바 active 상태 해제
    setActiveChatIdInSidebar(null);
  }

  function handleContinueInChat(modelId: string) {
    setActiveView('chat');
    setConvKey((k) => k + 1);
    setChatInitialModel(modelId);
  }

  function handleConversationStart(title: string) {
    setHistory((prev) => [{ id: convKey, title }, ...prev].slice(0, 8));
  }

  // P3.2 — 자동 제목 이벤트 수신: 가장 최근 conversation 항목 제목 갱신
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === 'string' && detail.length >= 2) {
        setHistory((prev) => {
          if (prev.length === 0) return prev;
          const [first, ...rest] = prev;
          return [{ ...first, title: detail }, ...rest];
        });
      }
    };
    window.addEventListener('d1:chat-retitle', handler as EventListener);
    return () => window.removeEventListener('d1:chat-retitle', handler as EventListener);
  }, []);

  // Tori 평면화 핫픽스 (2026-04-25): 이전 PR #6, #12의 "더보기" expand state 제거.
  // 사용자 환경에 남은 localStorage 키 정리 (1회).
  useEffect(() => {
    try { localStorage.removeItem('d1:sidebar-sub-expanded'); } catch {}
  }, []);

  // Tori 통합 RAG — 활성 소스 칩 본체 클릭 시 Documents로 이동
  useEffect(() => {
    const handler = () => setActiveView('documents');
    window.addEventListener('d1:nav-documents', handler);
    return () => window.removeEventListener('d1:nav-documents', handler);
  }, []);

  // [2026-04-26] Sprint 2 (16384367) — 카드 routeOverride: d1:nav-to 이벤트
  // [2026-04-26 QA-BUG-A] chip onNavigate에서 documents/meeting/datasources 모두 dispatch 가능하게 확장
  useEffect(() => {
    const ALLOWED: ViewId[] = ['meeting', 'documents', 'datasources', 'chat', 'compare', 'billing', 'settings', 'savings'];
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ view?: string }>).detail;
      if (detail?.view && (ALLOWED as string[]).includes(detail.view)) {
        setActiveView(detail.view as ViewId);
      }
    };
    window.addEventListener('d1:nav-to', handler as EventListener);
    return () => window.removeEventListener('d1:nav-to', handler as EventListener);
  }, []);

  // [2026-04-26] D-3 — 임베딩 키 안내 배너 → Settings 이동
  useEffect(() => {
    const handler = () => setActiveView('settings');
    window.addEventListener('blend:open-settings', handler as EventListener);
    return () => window.removeEventListener('blend:open-settings', handler as EventListener);
  }, []);

  // [2026-04-26 Tori 16384118 §3.7] Worker 큐 폴링 활성화 (5분 + focus)
  useDataSourceQueuePolling();

  // [2026-04-26 Tori 16384118 §3.9] $1 도달 / 한도 초과 시 알림 모달
  const [costAlertOpen, setCostAlertOpen] = useState(false);
  const [costAlertData, setCostAlertData] = useState<{ used: number; limit: number }>({ used: 0, limit: 0 });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ used: number; limit: number; paused?: boolean }>).detail;
      if (!detail) return;
      setCostAlertData({ used: detail.used, limit: detail.limit });
      setCostAlertOpen(true);
    };
    window.addEventListener('blend:cost-alert', handler as EventListener);
    return () => window.removeEventListener('blend:cost-alert', handler as EventListener);
  }, []);

  // [2026-04-26] Sprint 1 (16384367) — Welcome Demo
  // 신규 사용자 첫 진입 시 자동 노출 + 사이드바 도움말에서 재진입.
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!hasSeenWelcome()) {
      // showOnboarding이 다른 흐름과 충돌하지 않도록 약간 지연
      const t = setTimeout(() => setWelcomeOpen(true), 600);
      return () => clearTimeout(t);
    }
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => setWelcomeOpen(true);
    window.addEventListener('blend:replay-welcome', handler as EventListener);
    return () => window.removeEventListener('blend:replay-welcome', handler as EventListener);
  }, []);

  function nav(id: ViewId) {
    trackEvent('menu_click', { menu: id });
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
      compare:     <D1CompareView lang={childLang} onContinueInChat={handleContinueInChat} />,
      documents:   <D1DocumentsView lang={childLang} onAskAboutDocs={() => { setActiveView('chat'); setConvKey((k) => k + 1); }} />,
      meeting:     <D1MeetingView lang={childLang} />,
      billing:     <D1BillingView lang={lang} />,
      datasources: <D1DataSourcesView lang={childLang} />,
      models:      <D1ModelsView lang={childLang} onSelectModel={handleContinueInChat} onOpenOnboarding={() => window.dispatchEvent(new CustomEvent('d1:open-onboarding'))} />,
      agents:      <D1AgentsView lang={childLang} onStartChat={handleContinueInChat} />,
      savings:     <D1CostSavingsView lang={childLang} />,
      dashboard:   <D1DashboardView lang={childLang} />,
      settings:    <D1SettingsView />,
      security:    <D1SecurityView lang={childLang} />,
      about:       <D1AboutView lang={childLang} onNavigate={(tab) => nav(tab as ViewId)} />,
      // Roy 결정 2026-04-25: prompts 라우트 제거 (메뉴도 없음). plugins 유지.
      plugins:     <PluginsView />,
    };
    return (
      <div className="h-full overflow-y-auto bg-surface">
        <Suspense fallback={<div className="flex h-full items-center justify-center text-[13px]" style={{ color: tokens.textFaint }}>···</div>}>
          {map[activeView]}
        </Suspense>
      </div>
    );
  }

  // ── Popover items (hidden + About)
  // Roy 결정 2026-04-25:
  // - Prompts 메뉴 제거 (PromptsView 컴포넌트는 보존)
  // - Data Sources를 메인 사이드바(Documents 아래)로 승격 — popover에서 제거
  // [2026-04-30 Tori 18841602 v3] 에이전트/플러그인 비활성 — 코드 보존(주석 처리),
  //   라우트는 vercel.json 302 redirect로 home 처리. 향후 복원 시 주석 해제 + redirects 제거.
  const moreItems: [ViewId, string, React.ReactNode][] = [
    ['models',      t.models,      <ModelsIcon      key="mo" />],
    // ['agents',      t.agents,      <AgentsIcon      key="ag" />],     // 비활성 — 18841602 v3
    // ['plugins',     t.plugins,     <PluginsIcon     key="pl" />],     // 비활성 — 18841602 v3
    ['savings',     t.savings,     <SavingsIcon     key="sa" />],
    ['dashboard',   t.dashboard,   <DashboardIcon   key="da" />],
    ['security',    t.security,    <SecurityIcon    key="se" />],
    ['settings',    t.settings,    <SettingsIcon    key="st" />],
  ];

  // 온보딩 화면
  if (showOnboarding) {
    return <D1OnboardingView onDone={handleOnboardingDone} lang={childLang} />;
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
        {/* [2026-04-26] BUG-FIX (16417011) — 검색 메뉴 코드 유지, UI에서만 숨김 */}
        {SHOW_SEARCH_MENU && <SbBtn title={t.search}><SearchIcon /></SbBtn>}

        {/* Divider */}
        <div className="mx-4 my-2.5 shrink-0" style={{ height: 1, background: tokens.borderMid }} />

        {/* Main nav 5개 */}
        <SbNavBtn active={activeView==='chat'}        title={t.chat}        onClick={() => nav('chat')}>        <ChatIcon />        </SbNavBtn>
        <SbNavBtn active={activeView==='compare'}     title={t.compare}     onClick={() => nav('compare')}>     <CompareIcon />     </SbNavBtn>
        <SbNavBtn active={activeView==='documents'}   title={t.documents}   onClick={() => nav('documents')}>   <DocumentsIcon />   </SbNavBtn>
        {/* Roy 결정 2026-04-25: Data Sources를 Documents 아래에 평면 승격 (popover에서 제거) */}
        <SbNavBtn active={activeView==='datasources'} title={t.datasources} onClick={() => nav('datasources')}> <DataSourcesIcon /> </SbNavBtn>
        <SbNavBtn active={activeView==='meeting'}     title={t.meeting}     onClick={() => nav('meeting')}>     <MeetingIcon />     </SbNavBtn>
        <SbNavBtn active={activeView==='billing'}     title={t.billing}     onClick={() => nav('billing')}>     <BillingIcon />     </SbNavBtn>

        {/* Recent conversations (expanded only) */}
        {/* [2026-04-26] BUG-FIX (16417011) — d1-chat-store 기반. 클릭 시 loadRecentChat → chat-view loadChat. */}
        <div className="pointer-events-none min-w-0 flex-1 overflow-y-auto px-3 pt-3 opacity-0 transition-opacity duration-150 delay-75 group-hover:pointer-events-auto group-hover:opacity-100">
          <p className="mb-1 px-2 text-[10.5px] font-medium uppercase tracking-[0.08em]" style={{ color: tokens.textFaint }}>{t.recent}</p>
          {recentChats.length === 0
            ? <p className="px-2 py-1.5 text-[12.5px]" style={{ color: tokens.textFaint }}>{t.noConvs}</p>
            : <div className="flex flex-col gap-px">
                {recentChats.map((c) => {
                  const isActive = c.id === activeChatIdInSidebar && activeView === 'chat';
                  const memorySelected = memoryIds.includes(c.id);
                  return (
                    <div key={c.id} className="group flex items-center gap-1">
                      <button onClick={() => loadRecentChat(c.id)} title={c.title}
                        className="min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors hover:bg-black/5"
                        style={{
                          color: isActive ? tokens.text : tokens.textDim,
                          background: isActive ? 'rgba(0,0,0,0.05)' : 'transparent',
                          fontWeight: isActive ? 500 : 400,
                        }}>
                        {c.pinned && <span aria-hidden style={{ marginRight: 4, color: tokens.accent }}>📌</span>}
                        {c.title || (lang === 'ko' ? '(제목 없음)' : '(Untitled)')}
                      </button>
                      {/* [2026-05-02 Roy] 채팅 기억하기 — 즉시 표시 커스텀 툴팁 +
                          모바일 탭 시 토스트로 액션 확인. 텍스트 추가 X, 아이콘만. */}
                      <div className="relative shrink-0 group/tip">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            useD1MemoryStore.getState().toggle(c.id);
                            // [2026-05-04 PM-26b] 까만 토스트 제거 — 모바일에서 위치 안정화
                            // 어려움. 시각 피드백은 북마크 아이콘 색상(노란 highlight + fill)
                            // 토글로 충분. 한도는 SessionLoadBar(채팅창 밑 %)가 강제.
                          }}
                          className="rounded-md p-1 transition-all hover:bg-black/5"
                          style={{
                            background: memorySelected ? '#FEF3C7' : 'transparent',
                            color: memorySelected ? '#854D0E' : tokens.textFaint,
                          }}
                          aria-label={memorySelected ? (lang === 'ko' ? '기억에서 제외' : 'Remove from memory') : (lang === 'ko' ? '채팅 기억하기' : 'Remember this chat')}
                        >
                          {/* [2026-05-03 Roy] opacity 0.45 → 0.75 + stroke 1.6 → 1.8 — 너무 흐려 잘 안 보인다는 신고. 살짝 진하게. */}
                          <svg width={12} height={12} viewBox="0 0 24 24" fill={memorySelected ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: memorySelected ? 1 : 0.75 }} className="transition-opacity group-hover:!opacity-100">
                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                          </svg>
                        </button>
                        <span
                          className="pointer-events-none absolute right-0 top-full z-50 mt-1 whitespace-nowrap rounded-md px-2 py-1 text-[11px] opacity-0 transition-none group-hover/tip:opacity-100"
                          style={{ background: 'rgba(20,20,20,0.92)', color: '#fff' }}
                          role="tooltip"
                        >
                          {memorySelected ? (lang === 'ko' ? '기억에서 제외' : 'Remove from memory') : (lang === 'ko' ? '채팅 기억하기' : 'Remember this chat')}
                        </span>
                      </div>
                    </div>
                  );
                })}
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
                {/* [2026-05-05 Roy PM-30] 60초 둘러보기 버튼 일시 비활성 — 콘텐츠 정비 후
                    재활성. {ENABLE_WELCOME_TOUR && (...)} 으로 wrap, 상수 false로 차단. */}
                {ENABLE_WELCOME_TOUR && (
                  <>
                    <div className="mx-3 my-1" style={{ height: 1, background: tokens.border }} />
                    <button onClick={() => { setShowMore(false); window.dispatchEvent(new CustomEvent('blend:replay-welcome')); }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] transition-colors hover:bg-black/5"
                      style={{ color: tokens.text }}
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center" style={{ color: tokens.textDim }}>🎬</span>
                      {lang === 'ko' ? '60초 둘러보기' : '60-second tour'}
                    </button>
                  </>
                )}
                {/* [2026-05-04 Roy #16] 사이드바 About 항목 제거 — Settings 안 About
                    섹션으로 통합. 두 곳에서 같은 정보를 노출하면 사용자가 선택 부담을
                    느낌. Settings 진입 후 About 섹션 클릭으로 일관 액세스. */}
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
            {/* [2026-04-30 Tori 18841602 v3] datasources 추가 (메인 그룹) */}
            {([
              ['chat',        t.chat,        <ChatIcon        key="ch" />],
              ['compare',     t.compare,     <CompareIcon     key="cp" />],
              ['documents',   t.documents,   <DocumentsIcon   key="dc" />],
              ['datasources', t.datasources, <DataSourcesIcon key="ds" />],
              ['meeting',     t.meeting,     <MeetingIcon     key="me" />],
              ['billing',     t.billing,     <BillingIcon     key="bi" />],
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
            {/* [2026-04-30 Tori 18841602 v3] 60초 둘러보기 — Welcome demo 재진입.
                [2026-05-05 Roy PM-30] 일시 비활성 — ENABLE_WELCOME_TOUR=true로 복원. */}
            {ENABLE_WELCOME_TOUR && (
              <button
                onClick={() => {
                  setDrawerOpen(false);
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('blend:replay-welcome'));
                  }
                }}
                className="flex h-10 w-full items-center gap-3 rounded-[10px] border-none pl-4 pr-3 text-[13px] transition-colors hover:bg-black/5"
                style={{ color: tokens.text }}
              >
                <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center" aria-hidden style={{ color: tokens.textDim }}>🎬</span>
                {lang === 'ko' ? '60초 둘러보기' : '60-second tour'}
              </button>
            )}
            {/* [2026-05-04 Roy #16] 모바일 drawer About 항목 제거 — Settings 안
                About 섹션으로 통합. 데스크탑 ··· 팝오버와 동일 처리. */}
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

      {/* Phase 5.0 — Vercel Analytics (옵트아웃은 trackEvent 내부) */}
      <Analytics />

      {/* [2026-04-26] Sprint 1 (16384367) — Welcome Demo 60s */}
      {/* WelcomeDemo은 'ko'|'en'만 받음 — ph는 en으로 coerce (Filipino UX는 영어 fallback OK). */}
      <WelcomeDemo
        lang={childLang === 'ph' ? 'en' : childLang}
        open={welcomeOpen}
        onClose={() => setWelcomeOpen(false)}
        onStart={() => { setWelcomeOpen(false); setActiveView('chat'); }}
        onGuide={() => { setWelcomeOpen(false); setActiveView('settings'); }}
      />

      {/* [2026-04-27 BUG-005] localStorage quota exceeded toast */}
      <StorageQuotaToast onOpenSecurity={() => setActiveView('security')} />

      {/* [2026-04-26 Tori 16384118 §3.9] 비용 한도 알림 모달 */}
      {/* CostAlertModal은 'ko'|'en'만 받음 — ph는 en으로 coerce. */}
      <CostAlertModal
        lang={childLang === 'ph' ? 'en' : childLang}
        open={costAlertOpen}
        used={costAlertData.used}
        limit={costAlertData.limit}
        onContinue={() => setCostAlertOpen(false)}
        onPause={() => {
          useCostStore.getState().pauseSync('user_paused');
          setCostAlertOpen(false);
        }}
        onIncrease={() => {
          setCostAlertOpen(false);
          setActiveView('savings');
        }}
      />
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
// Roy 결정 2026-04-25: PromptsIcon 제거 (Prompts 메뉴 폐기). Plugins만 유지.
function PluginsIcon()     { return <svg {...ic2}><path d="M9 2v6M15 2v6"/><rect x="6" y="8" width="12" height="8" rx="2"/><path d="M9 16v6M15 16v6"/></svg>; }

void ic2;
