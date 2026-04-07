'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Sidebar, MobileBottomBar } from '@/modules/ui/sidebar';
import { ChatView } from '@/modules/chat/chat-view';
import { SettingsView } from '@/modules/settings/settings-view';
import { ModelsView } from '@/modules/models/models-view';
import { PromptsView } from '@/modules/prompts/prompts-view';
import { AgentsView } from '@/modules/agents/agents-view';
import { DashboardView } from '@/modules/ui/dashboard-view';
import { ModelCompareView } from '@/modules/models/model-compare-view';
import { PluginsView } from '@/modules/plugins/plugins-view';
import { DocumentPluginView } from '@/modules/plugins/document-plugin-view';
import { useKeyboardShortcuts, ShortcutHelpModal } from '@/modules/ui/keyboard-shortcuts';
import { useAPIKeyStore } from '@/stores/api-key-store';
import { usePromptStore } from '@/stores/prompt-store';
import { useAgentStore } from '@/stores/agent-store';
import { useUsageStore } from '@/stores/usage-store';
import { useChatStore } from '@/stores/chat-store';
import { useSettingsStore } from '@/stores/settings-store';
import { usePluginStore } from '@/stores/plugin-store';
import { Menu } from 'lucide-react';

export default function Home() {
  const [activeTab, setActiveTab] = useState('chat');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const apiKeyStore = useAPIKeyStore();
  const promptStore = usePromptStore();
  const agentStore = useAgentStore();
  const usageStore = useUsageStore();
  const { createChat, loadFromStorage: loadChatFromStorage, chats, currentChatId, setCurrentChat } = useChatStore();
  const settingsStore = useSettingsStore();
  const pluginStore = usePluginStore();

  useEffect(() => {
    apiKeyStore.loadFromStorage();
    loadChatFromStorage();
    promptStore.loadFromStorage();
    agentStore.loadFromStorage();
    usageStore.loadFromStorage();
    settingsStore.loadFromStorage();
    pluginStore.loadFromStorage();
  }, []);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setMobileOpen(false); // 모바일에서 탭 선택 시 사이드바 닫기
  };

  // Touch swipe handlers for mobile sidebar
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    // Swipe right from left edge → open sidebar
    if (dx > 60 && e.changedTouches[0].clientX - dx < 40) {
      setMobileOpen(true);
    }
    // Swipe left → close sidebar
    if (dx < -60 && mobileOpen) {
      setMobileOpen(false);
    }
  };

  const shortcuts = useMemo(() => [
    { key: 'n', meta: true, action: () => { createChat(); setActiveTab('chat'); }, description: '새 채팅' },
    { key: ',', meta: true, action: () => setActiveTab('settings'), description: '설정' },
    { key: 'k', meta: true, action: () => { setActiveTab('chat'); window.dispatchEvent(new Event('blend:focus-sidebar-search')); }, description: '채팅 목록 검색' },
    // Cmd+Shift+F: open in-chat search
    { key: 'f', meta: true, shift: true, action: () => { setActiveTab('chat'); }, description: '채팅 내 검색' },
    // Cmd+[ / Cmd+] — navigate between chats
    { key: '[', meta: true, action: () => {
      const idx = chats.findIndex((c) => c.id === currentChatId);
      if (idx > 0) { setCurrentChat(chats[idx - 1].id); setActiveTab('chat'); }
    }, description: '이전 채팅' },
    { key: ']', meta: true, action: () => {
      const idx = chats.findIndex((c) => c.id === currentChatId);
      if (idx >= 0 && idx < chats.length - 1) { setCurrentChat(chats[idx + 1].id); setActiveTab('chat'); }
    }, description: '다음 채팅' },
    // Cmd+Shift+T — toggle dark/light theme
    { key: 't', meta: true, shift: true, action: () => {
      const cur = settingsStore.settings.theme;
      settingsStore.updateSettings({ theme: cur === 'dark' ? 'light' : 'dark' });
    }, description: '테마 전환' },
    // ?: show shortcut help modal
    { key: '?', action: () => setShowShortcutHelp(true), description: '단축키 도움말' },
  ], [createChat, chats, currentChatId, setCurrentChat, settingsStore]);

  useKeyboardShortcuts(shortcuts);

  const renderContent = () => {
    switch (activeTab) {
      case 'chat': return <ChatView />;
      case 'models': return <ModelsView />;
      case 'settings': return <SettingsView />;
      case 'agents': return <AgentsView onStartChat={() => handleTabChange('chat')} />;
      case 'prompts': return <PromptsView />;
      case 'plugins': return <PluginsView />;
      case 'documents': return <DocumentPluginView />;
      case 'compare': return <ModelCompareView />;
      case 'dashboard': return <DashboardView />;
      default: return <ChatView />;
    }
  };

  return (
    <div
      className="flex h-screen bg-surface text-on-surface"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-surface border-b border-border-token px-3 py-2 flex items-center gap-3">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 text-on-surface-muted hover:text-on-surface"
        >
          <Menu size={20} />
        </button>
        <span className="text-sm font-medium text-on-surface">Blend</span>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar - desktop: always visible, mobile: overlay */}
      <div className={`
        fixed md:relative z-50 h-full
        transition-transform duration-200
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <Sidebar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          mobileOpen={mobileOpen}
          onMobileToggle={() => setMobileOpen(false)}
        />
      </div>

      {/* Main content - mobile: add top padding for header and bottom padding for tab bar */}
      <main className="flex-1 pt-11 pb-16 md:pt-0 md:pb-0 overflow-hidden">{renderContent()}</main>

      {/* Mobile bottom tab bar */}
      <MobileBottomBar activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Shortcut help modal */}
      {showShortcutHelp && <ShortcutHelpModal onClose={() => setShowShortcutHelp(false)} />}
    </div>
  );
}
