'use client';

// AppContentDesign2 — design2 전용 앱 셸 (/design2/[lang]/ 라우트 전용)
// app-content.tsx와 완전 독립. 이 파일을 자유롭게 수정해도 원본(/ko/qatest)에 영향 없음.
//
// 특정 뷰를 design2 전용으로 교체하려면:
//   1. 해당 뷰 파일을 복사 → e.g. src/modules/ui/about-view.design2.tsx
//   2. 아래 import를 새 파일로 교체
//   3. 원본은 그대로 유지됨

import { useState, useEffect, useMemo, useRef } from 'react';
import { Sidebar, MobileBottomBar } from '@/modules/ui/sidebar';
import { ChatView } from '@/modules/chat/chat-view';
import { SettingsView } from '@/modules/settings/settings-view';
import { ModelsView } from '@/modules/models/models-view';
import { PromptsView } from '@/modules/prompts/prompts-view';
import { AgentsView } from '@/modules/agents/agents-view';
import { DashboardView } from '@/modules/ui/dashboard-view';
import { CostSavingsDashboard } from '@/modules/ui/cost-savings-dashboard';
import { ModelCompareView } from '@/modules/models/model-compare-view';
import { PluginsView } from '@/modules/plugins/plugins-view';
import { DocumentPluginView } from '@/modules/plugins/document-plugin-view';
import { DataSourceView } from '@/modules/datasources/datasource-view';
import { MeetingView } from '@/modules/meeting/meeting-view';
import { SecurityView } from '@/modules/ui/security-view';
import { WelcomeView } from '@/modules/ui/welcome-view';
import { BillingView } from '@/modules/ui/billing-view';
import { AboutView } from '@/modules/ui/about-view';
import { useKeyboardShortcuts, ShortcutHelpModal } from '@/modules/ui/keyboard-shortcuts';
import { useAPIKeyStore } from '@/stores/api-key-store';
import { usePromptStore } from '@/stores/prompt-store';
import { useAgentStore } from '@/stores/agent-store';
import { useUsageStore } from '@/stores/usage-store';
import { useChatStore } from '@/stores/chat-store';
import { useSettingsStore } from '@/stores/settings-store';
import { usePluginStore } from '@/stores/plugin-store';
import { useDocumentStore } from '@/stores/document-store';
import { useDataSourceStore } from '@/stores/datasource-store';
import { Menu, ChevronRight } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

export default function AppContentDesign2() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('chat');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const apiKeyStore = useAPIKeyStore();
  const promptStore = usePromptStore();
  const agentStore = useAgentStore();
  const usageStore = useUsageStore();
  const { createChat, loadFromStorage: loadChatFromStorage, chats, currentChatId, setCurrentChat } = useChatStore();
  const settingsStore = useSettingsStore();
  const pluginStore = usePluginStore();
  const { loadFromDB: loadDocumentsFromDB } = useDocumentStore();
  const { loadFromStorage: loadDataSources } = useDataSourceStore();

  useEffect(() => {
    apiKeyStore.loadFromStorage();
    loadChatFromStorage();
    promptStore.loadFromStorage();
    agentStore.loadFromStorage();
    usageStore.loadFromStorage();
    settingsStore.loadFromStorage();
    pluginStore.loadFromStorage();
    loadDataSources();
    loadDocumentsFromDB();
    const welcomed = localStorage.getItem('blend:welcomed');
    if (!welcomed) setShowWelcome(true);
  }, []);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setMobileOpen(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (dx > 60 && e.changedTouches[0].clientX - dx < 40) setMobileOpen(true);
    if (dx < -60 && mobileOpen) setMobileOpen(false);
  };

  useEffect(() => {
    const handler = () => setActiveTab('settings');
    window.addEventListener('blend:open-settings', handler);
    return () => window.removeEventListener('blend:open-settings', handler);
  }, []);

  const shortcuts = useMemo(() => [
    { key: 'n', meta: true, action: () => { createChat(); setActiveTab('chat'); }, description: t('shortcuts.new_chat') },
    { key: ',', meta: true, action: () => setActiveTab('settings'), description: t('shortcuts.settings') },
    { key: 'k', meta: true, action: () => { setActiveTab('chat'); window.dispatchEvent(new Event('blend:focus-sidebar-search')); }, description: t('shortcuts.search_chats') },
    { key: 'f', meta: true, shift: true, action: () => { setActiveTab('chat'); }, description: t('shortcuts.search_in_chat') },
    { key: '[', meta: true, action: () => {
      const idx = chats.findIndex((c) => c.id === currentChatId);
      if (idx > 0) { setCurrentChat(chats[idx - 1].id); setActiveTab('chat'); }
    }, description: t('shortcuts.prev_chat') },
    { key: ']', meta: true, action: () => {
      const idx = chats.findIndex((c) => c.id === currentChatId);
      if (idx >= 0 && idx < chats.length - 1) { setCurrentChat(chats[idx + 1].id); setActiveTab('chat'); }
    }, description: t('shortcuts.next_chat') },
    { key: 't', meta: true, shift: true, action: () => {
      const cur = settingsStore.settings.theme;
      settingsStore.updateSettings({ theme: cur === 'dark' ? 'light' : 'dark' });
    }, description: t('shortcuts.toggle_theme') },
    { key: '?', action: () => setShowShortcutHelp(true), description: t('shortcuts.help') },
    { key: '/', meta: true, action: () => setShowShortcutHelp(true), description: t('shortcuts.help') },
  ], [createChat, chats, currentChatId, setCurrentChat, settingsStore, t]);

  useKeyboardShortcuts(shortcuts);

  const renderContent = () => {
    switch (activeTab) {
      case 'chat':       return <ChatView />;
      case 'meeting':    return <MeetingView />;
      case 'models':     return <ModelsView onApply={() => setActiveTab('chat')} />;
      case 'settings':   return <SettingsView />;
      case 'agents':     return <AgentsView onStartChat={() => handleTabChange('chat')} />;
      case 'prompts':    return <PromptsView onStartChat={(sysPrompt) => {
        settingsStore.setSystemPrompt(sysPrompt);
        createChat();
        setActiveTab('chat');
      }} />;
      case 'plugins':    return <PluginsView />;
      case 'documents':  return <DocumentPluginView />;
      case 'datasources': return <DataSourceView />;
      case 'compare':    return <ModelCompareView />;
      case 'dashboard':  return <DashboardView />;
      case 'savings':    return <CostSavingsDashboard />;
      case 'security':   return <SecurityView />;
      case 'billing':    return <BillingView />;
      case 'about':      return <AboutView onNavigate={setActiveTab} />;
      default:           return <ChatView />;
    }
  };

  if (showWelcome) {
    return (
      <div className="h-dvh bg-gray-900">
        <WelcomeView onComplete={() => {
          localStorage.setItem('blend:welcomed', '1');
          setShowWelcome(false);
        }} />
      </div>
    );
  }

  return (
    <div
      className="flex h-dvh bg-surface text-on-surface"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Mobile header */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-50 bg-surface border-b border-border-token px-3 flex items-center gap-3"
        style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))', paddingBottom: '0.5rem' }}
      >
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 text-on-surface-muted hover:text-on-surface"
        >
          <Menu size={20} />
        </button>
        <span className="text-xl font-bold text-on-surface">Blend</span>
      </div>

      {/* Mobile overlay */}
      <div
        className={`md:hidden fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setMobileOpen(false)}
      />

      {/* Sidebar */}
      <div className={`
        fixed md:relative z-50 h-full
        transition-transform duration-200
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        ${!mobileOpen ? 'pointer-events-none md:pointer-events-auto' : ''}
      `}>
        <Sidebar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          mobileOpen={mobileOpen}
          onMobileToggle={() => setMobileOpen(false)}
        />
      </div>

      {/* Main content */}
      <main
        className="flex-1 md:pt-0 md:pb-0 overflow-hidden"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 2.75rem)',
          paddingBottom: '4rem',
        }}
      >{renderContent()}</main>

      {/* Mobile bottom tab bar */}
      <MobileBottomBar activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Shortcut help modal */}
      {showShortcutHelp && <ShortcutHelpModal onClose={() => setShowShortcutHelp(false)} />}

      {/* Global left-edge ">" button */}
      {!mobileOpen && (
        <button
          onClick={() => {
            setMobileOpen(true);
            window.dispatchEvent(new Event('blend:open-nav'));
          }}
          className="fixed left-0 top-1/2 -translate-y-1/2 z-30 w-[18px] h-24 bg-gray-600 hover:bg-gray-400 text-white rounded-r-full flex items-center justify-center transition-colors md:hidden"
          title={t('shortcuts.open_menu')}
        >
          <ChevronRight size={10} />
        </button>
      )}
    </div>
  );
}
