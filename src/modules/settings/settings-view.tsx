'use client';

import { useAPIKeyStore } from '@/stores/api-key-store';
import { useChatStore } from '@/stores/chat-store';
import { usePromptStore } from '@/stores/prompt-store';
import { useAgentStore } from '@/stores/agent-store';
import { useUsageStore } from '@/stores/usage-store';
import { useSettingsStore } from '@/stores/settings-store';
import { AIProvider } from '@/types';
import { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, Check, X, Key, Download, Upload } from 'lucide-react';

const PROVIDERS: { id: AIProvider; name: string; color: string; placeholder: string }[] = [
  { id: 'openai', name: 'OpenAI', color: '#10a37f', placeholder: 'sk-...' },
  { id: 'anthropic', name: 'Anthropic', color: '#d4a574', placeholder: 'sk-ant-...' },
  { id: 'google', name: 'Google Gemini', color: '#4285f4', placeholder: 'AIza...' },
];

export function SettingsView() {
  const { keys, setKey, loadFromStorage } = useAPIKeyStore();
  const chatStore = useChatStore();
  const promptStore = usePromptStore();
  const agentStore = useAgentStore();
  const usageStore = useUsageStore();
  const { systemPrompt, setSystemPrompt } = useSettingsStore();
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadFromStorage();
  }, []);

  const handleExport = () => {
    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      chats: chatStore.chats,
      prompts: promptStore.prompts,
      agents: agentStore.agents,
      usage: usageStore.records,
      settings: { selectedModel: chatStore.selectedModel },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blend-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.chats) useChatStore.setState({ chats: data.chats });
        if (data.prompts) usePromptStore.setState({ prompts: data.prompts });
        if (data.agents) useAgentStore.setState({ agents: data.agents });
        if (data.usage) useUsageStore.setState({ records: data.usage });
        alert('가져오기 완료!');
      } catch {
        alert('잘못된 파일 형식입니다.');
      }
    };
    reader.readAsText(file);
  };

  const handleClearAll = () => {
    if (confirm('모든 데이터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-900 p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">설정</h1>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Key size={20} /> API 키 관리
          </h2>
          <p className="text-sm text-gray-400 mb-4">
            각 AI 제공자의 API 키를 입력하세요. 키는 브라우저 로컬 저장소에만 저장됩니다.
          </p>

          <div className="space-y-4">
            {PROVIDERS.map((provider) => (
              <div key={provider.id} className="bg-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: provider.color }} />
                    <span className="font-medium text-white">{provider.name}</span>
                  </div>
                  {keys[provider.id] ? (
                    <span className="flex items-center gap-1 text-xs text-green-400">
                      <Check size={12} /> 설정됨
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <X size={12} /> 미설정
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type={showKeys[provider.id] ? 'text' : 'password'}
                    value={keys[provider.id] || ''}
                    onChange={(e) => setKey(provider.id, e.target.value)}
                    placeholder={provider.placeholder}
                    className="flex-1 bg-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => setShowKeys((s) => ({ ...s, [provider.id]: !s[provider.id] }))}
                    className="p-2 text-gray-400 hover:text-white"
                  >
                    {showKeys[provider.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">테마</h2>
          <div className="bg-gray-800 rounded-xl p-4 flex items-center justify-between">
            <span className="text-sm text-gray-300">다크 모드</span>
            <button
              onClick={() => {
                document.documentElement.classList.toggle('theme-light');
              }}
              className="w-12 h-6 bg-gray-600 rounded-full relative cursor-pointer"
            >
              <div className="w-5 h-5 bg-white rounded-full absolute top-0.5 left-0.5 transition-transform" />
            </button>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">글로벌 시스템 프롬프트</h2>
          <div className="bg-gray-800 rounded-xl p-4">
            <p className="text-sm text-gray-400 mb-2">
              모든 대화에 자동으로 적용되는 시스템 프롬프트입니다. 에이전트 사용 시 에이전트 프롬프트가 우선합니다.
            </p>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="예: 당신은 한국어로 답변하는 AI 어시스턴트입니다..."
              rows={4}
              className="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 outline-none resize-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">데이터 저장소</h2>
          <div className="bg-gray-800 rounded-xl p-4">
            <p className="text-sm text-gray-400 mb-2">
              모든 데이터는 브라우저 로컬 저장소에 저장됩니다. 서버로 전송되지 않습니다.
            </p>
            <div className="flex gap-2">
              <button onClick={handleExport} className="flex items-center gap-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm text-white">
                <Download size={14} /> 내보내기
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-white">
                <Upload size={14} /> 가져오기
              </button>
              <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
              <button onClick={handleClearAll} className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 rounded-lg text-sm text-red-400">
                전체 삭제
              </button>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-4">정보</h2>
          <div className="bg-gray-800 rounded-xl p-4 text-sm text-gray-400">
            <p>Blend v0.1.0</p>
            <p className="mt-1">AI 채팅 인터페이스 - BYOK (Bring Your Own Key)</p>
          </div>
        </section>
      </div>
    </div>
  );
}
