'use client';

import { useState, useEffect, useMemo } from 'react';
import { Sidebar } from '@/modules/ui/sidebar';
import { ChatView } from '@/modules/chat/chat-view';
import { SettingsView } from '@/modules/settings/settings-view';
import { ModelsView } from '@/modules/models/models-view';
import { PromptsView } from '@/modules/prompts/prompts-view';
import { AgentsView } from '@/modules/agents/agents-view';
import { DashboardView } from '@/modules/ui/dashboard-view';
import { ModelCompareView } from '@/modules/models/model-compare-view';
import { PluginsView } from '@/modules/plugins/plugins-view';
import { useKeyboardShortcuts } from '@/modules/ui/keyboard-shortcuts';
import { useAPIKeyStore } from '@/stores/api-key-store';
import { usePromptStore } from '@/stores/prompt-store';
import { useAgentStore } from '@/stores/agent-store';
import { useUsageStore } from '@/stores/usage-store';
import { useChatStore } from '@/stores/chat-store';
import { useSettingsStore } from '@/stores/settings-store';
import { Menu } from 'lucide-react';

export default function Home() {
  const [activeTab, setActiveTab] = useState('chat');
  const [mobileOpen, setMobileOpen] = useState(false);
  const apiKeyStore = useAPIKeyStore();
  const promptStore = usePromptStore();
  const agentStore = useAgentStore();
  const usageStore = useUsageStore();
  const { createChat } = useChatStore();
  const settingsStore = useSettingsStore();

  useEffect(() => {
    apiKeyStore.loadFromStorage();
    promptStore.loadFromStorage();
    agentStore.loadFromStorage();
    usageStore.loadFromStorage();
    settingsStore.loadFromStorage();
  }, []);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setMobileOpen(false); // 모바일에서 탭 선택 시 사이드바 닫기
  };

  const shortcuts = useMemo(() => [
    { key: 'n', meta: true, action: () => { createChat(); setActiveTab('chat'); }, description: '새 채팅' },
    { key: ',', meta: true, action: () => setActiveTab('settings'), description: '설정' },
    { key: 'k', meta: true, action: () => setActiveTab('chat'), description: '채팅 검색' },
  ], [createChat]);

  useKeyboardShortcuts(shortcuts);

  const renderContent = () => {
    switch (activeTab) {
      case 'chat': return <ChatView />;
      case 'models': return <ModelsView />;
      case 'settings': return <SettingsView />;
      case 'agents': return <AgentsView onStartChat={() => handleTabChange('chat')} />;
      case 'prompts': return <PromptsView />;
      case 'plugins': return <PluginsView />;
      case 'compare': return <ModelCompareView />;
      case 'dashboard': return <DashboardView />;
      default: return <ChatView />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-gray-900 border-b border-gray-800 px-3 py-2 flex items-center gap-3">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 text-gray-400 hover:text-white"
        >
          <Menu size={20} />
        </button>
        <span className="text-sm font-medium text-gray-300">Blend</span>
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

      {/* Main content - mobile: add top padding for header */}
      <main className="flex-1 pt-11 md:pt-0">{renderContent()}</main>
    </div>
  );
}
