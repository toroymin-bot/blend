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

export default function Home() {
  const [activeTab, setActiveTab] = useState('chat');
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

  const shortcuts = useMemo(() => [
    { key: 'n', meta: true, action: () => { createChat(); setActiveTab('chat'); }, description: '새 채팅' },
    { key: ',', meta: true, action: () => setActiveTab('settings'), description: '설정' },
    { key: 'k', meta: true, action: () => setActiveTab('chat'), description: '채팅 검색' },
  ], [createChat]);

  useKeyboardShortcuts(shortcuts);

  const renderContent = () => {
    switch (activeTab) {
      case 'chat':
        return <ChatView />;
      case 'models':
        return <ModelsView />;
      case 'settings':
        return <SettingsView />;
      case 'agents':
        return <AgentsView onStartChat={() => setActiveTab('chat')} />;
      case 'prompts':
        return <PromptsView />;
      case 'plugins':
        return <PluginsView />;
      case 'compare':
        return <ModelCompareView />;
      case 'dashboard':
        return <DashboardView />;
      default:
        return <ChatView />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1">{renderContent()}</main>
    </div>
  );
}
