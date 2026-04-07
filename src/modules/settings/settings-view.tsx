'use client';

import { useAPIKeyStore } from '@/stores/api-key-store';
import { useChatStore } from '@/stores/chat-store';
import { usePromptStore } from '@/stores/prompt-store';
import { useAgentStore } from '@/stores/agent-store';
import { useUsageStore } from '@/stores/usage-store';
import { useSettingsStore } from '@/stores/settings-store';
import { AIProvider } from '@/types';
import { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, Check, X, Key, Download, Upload, Sun, Moon, BookMarked, Plus, Cpu, Trash2, ExternalLink, Loader, AlertCircle } from 'lucide-react';
import { exportAllChatsAsJSON } from '@/modules/chat/export-chat';

const PROVIDERS: {
  id: AIProvider;
  name: string;
  color: string;
  placeholder: string;
  models: string;
  keyUrl: string;
  note?: string;
}[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    color: '#10a37f',
    placeholder: 'sk-...',
    models: 'GPT-4o, GPT-4.1, o3, o4-mini',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    color: '#d4a574',
    placeholder: 'sk-ant-...',
    models: 'Claude Opus 4, Sonnet 4, Haiku 3.5',
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'google',
    name: 'Google Gemini',
    color: '#4285f4',
    placeholder: 'AIza...',
    models: 'Gemini 2.0 Flash, Gemini 2.5 Pro',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    note: '무료 티어 제공',
  },
];

export function SettingsView() {
  const { keys, setKey, loadFromStorage } = useAPIKeyStore();
  const chatStore = useChatStore();
  const promptStore = usePromptStore();
  const agentStore = useAgentStore();
  const usageStore = useUsageStore();
  const { systemPrompt, setSystemPrompt, settings, updateSettings, systemPromptPresets, addSystemPromptPreset, removeSystemPromptPreset, customModels, addCustomModel, removeCustomModel } = useSettingsStore();
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [testingKey, setTestingKey] = useState<Record<string, boolean>>({});
  const [testResult, setTestResult] = useState<Record<string, 'ok' | 'fail' | null>>({});
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [showAddModel, setShowAddModel] = useState(false);
  const [newModelName, setNewModelName] = useState('');
  const [newModelId, setNewModelId] = useState('');
  const [newModelBaseUrl, setNewModelBaseUrl] = useState('');
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

  const handleTestKey = async (providerId: AIProvider) => {
    const key = keys[providerId];
    if (!key) return;
    setTestingKey((s) => ({ ...s, [providerId]: true }));
    setTestResult((s) => ({ ...s, [providerId]: null }));
    try {
      let ok = false;
      if (providerId === 'openai') {
        const res = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } });
        ok = res.ok;
      } else if (providerId === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/models', {
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        });
        ok = res.ok;
      } else if (providerId === 'google') {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        ok = res.ok;
      }
      setTestResult((s) => ({ ...s, [providerId]: ok ? 'ok' : 'fail' }));
    } catch {
      setTestResult((s) => ({ ...s, [providerId]: 'fail' }));
    } finally {
      setTestingKey((s) => ({ ...s, [providerId]: false }));
      setTimeout(() => setTestResult((s) => ({ ...s, [providerId]: null })), 4000);
    }
  };

  const handleClearAll = () => {
    if (confirm('모든 데이터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-surface p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-on-surface mb-6">설정</h1>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-on-surface mb-1 flex items-center gap-2">
            <Key size={20} /> API 키 관리
          </h2>
          <p className="text-sm text-on-surface-muted mb-4">
            사용할 AI 서비스의 API 키를 입력하세요. 키는 내 브라우저에만 저장되며 외부로 전송되지 않습니다.
          </p>

          <div className="space-y-3">
            {PROVIDERS.map((provider) => (
              <div key={provider.id} className="bg-surface-2 rounded-xl p-4">
                {/* Header row */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: provider.color }} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-on-surface">{provider.name}</span>
                        {provider.note && (
                          <span className="text-xs text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded">{provider.note}</span>
                        )}
                      </div>
                      <p className="text-xs text-on-surface-muted mt-0.5">{provider.models}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {keys[provider.id] ? (
                      <span className="flex items-center gap-1 text-xs text-green-400">
                        <Check size={12} /> 설정됨
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-on-surface-muted">
                        <X size={12} /> 미설정
                      </span>
                    )}
                  </div>
                </div>
                {/* Key input */}
                <div className="flex items-center gap-2">
                  <input
                    type={showKeys[provider.id] ? 'text' : 'password'}
                    value={keys[provider.id] || ''}
                    onChange={(e) => { setKey(provider.id, e.target.value); setTestResult((s) => ({ ...s, [provider.id]: null })); }}
                    placeholder={provider.placeholder}
                    className="flex-1 bg-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => setShowKeys((s) => ({ ...s, [provider.id]: !s[provider.id] }))}
                    className="p-2 text-on-surface-muted hover:text-on-surface"
                    aria-label={showKeys[provider.id] ? '키 숨기기' : '키 보기'}
                  >
                    {showKeys[provider.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                  {keys[provider.id] && (
                    <button
                      onClick={() => handleTestKey(provider.id)}
                      disabled={testingKey[provider.id]}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                        testResult[provider.id] === 'ok' ? 'bg-green-700 text-green-100' :
                        testResult[provider.id] === 'fail' ? 'bg-red-700 text-red-100' :
                        'bg-gray-600 text-gray-300 hover:bg-gray-500'
                      }`}
                      title="API 키 유효성 검사"
                    >
                      {testingKey[provider.id] ? <Loader size={12} className="animate-spin" /> :
                       testResult[provider.id] === 'ok' ? <Check size={12} /> :
                       testResult[provider.id] === 'fail' ? <AlertCircle size={12} /> :
                       '테스트'}
                    </button>
                  )}
                </div>
                {/* Get key link */}
                {!keys[provider.id] && (
                  <a
                    href={provider.keyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-2"
                  >
                    API 키 발급받기 <ExternalLink size={11} />
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── Custom Model Endpoints ── */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-on-surface mb-1 flex items-center gap-2">
            <Cpu size={20} /> 커스텀 모델 엔드포인트
          </h2>
          <p className="text-sm text-on-surface-muted mb-4">
            Ollama, OpenRouter, LM Studio 등 OpenAI 호환 API를 연결합니다.
          </p>

          {/* Existing custom models */}
          {customModels.length > 0 && (
            <div className="space-y-2 mb-4">
              {customModels.map((m) => (
                <div key={m.id} className="bg-surface-2 rounded-xl px-4 py-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-on-surface truncate">{m.name}</p>
                    <p className="text-xs text-on-surface-muted truncate">{m.baseUrl} · <code className="font-mono">{m.id.replace('custom-', '')}</code></p>
                  </div>
                  <button
                    onClick={() => removeCustomModel(m.id)}
                    className="text-on-surface-muted hover:text-red-400 p-1.5 shrink-0"
                    aria-label={`${m.name} 삭제`}
                  ><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}

          {/* Add model form */}
          {showAddModel ? (
            <div className="bg-surface-2 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-on-surface-muted mb-1 block">표시 이름</label>
                  <input
                    type="text"
                    value={newModelName}
                    onChange={(e) => setNewModelName(e.target.value)}
                    placeholder="Llama 3.2"
                    className="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-on-surface-muted mb-1 block">모델 ID</label>
                  <input
                    type="text"
                    value={newModelId}
                    onChange={(e) => setNewModelId(e.target.value)}
                    placeholder="llama3.2"
                    className="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-on-surface-muted mb-1 block">Base URL</label>
                <input
                  type="text"
                  value={newModelBaseUrl}
                  onChange={(e) => setNewModelBaseUrl(e.target.value)}
                  placeholder="http://localhost:11434/v1"
                  className="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 outline-none focus:ring-1 focus:ring-blue-500"
                />
                <p className="text-xs text-on-surface-muted mt-1">
                  Ollama: <code className="font-mono">http://localhost:11434/v1</code> · OpenRouter: <code className="font-mono">https://openrouter.ai/api/v1</code>
                </p>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => {
                    if (!newModelName.trim() || !newModelId.trim() || !newModelBaseUrl.trim()) return;
                    addCustomModel({
                      id: newModelId.trim(),
                      name: newModelName.trim(),
                      baseUrl: newModelBaseUrl.trim(),
                      provider: 'custom',
                      contextLength: 32000,
                      inputPrice: 0,
                      outputPrice: 0,
                      features: ['streaming'],
                    });
                    setNewModelName(''); setNewModelId(''); setNewModelBaseUrl('');
                    setShowAddModel(false);
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm text-white"
                >추가</button>
                <button
                  onClick={() => { setShowAddModel(false); setNewModelName(''); setNewModelId(''); setNewModelBaseUrl(''); }}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300"
                >취소</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddModel(true)}
              className="flex items-center gap-2 px-4 py-2 bg-surface-2 hover:bg-gray-700 rounded-xl text-sm text-on-surface-muted border border-dashed border-border-token transition-colors"
            >
              <Plus size={16} /> 모델 추가
            </button>
          )}
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-on-surface mb-4">테마</h2>
          <div className="bg-surface-2 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-on-surface">색상 테마</span>
              <div className="flex gap-1">
                {(['light', 'dark', 'system'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => updateSettings({ theme: t })}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      settings.theme === t
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'
                    }`}
                  >
                    {t === 'light' && <Sun size={12} />}
                    {t === 'dark' && <Moon size={12} />}
                    {t === 'light' ? '라이트' : t === 'dark' ? '다크' : '시스템'}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-on-surface-muted">
              {settings.theme === 'system' ? '시스템 설정을 따릅니다' : settings.theme === 'light' ? '라이트 모드가 적용됩니다' : '다크 모드가 적용됩니다'}
            </p>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-on-surface mb-4">비용 알림</h2>
          <div className="bg-surface-2 rounded-xl p-4">
            <p className="text-sm text-on-surface-muted mb-3">
              일일 API 비용이 설정한 한도를 초과하면 경고 알림이 표시됩니다. 0으로 설정하면 비활성화됩니다.
            </p>
            <div className="flex items-center gap-3">
              <label className="text-sm text-on-surface whitespace-nowrap">일일 한도 (USD)</label>
              <div className="flex items-center gap-1">
                <span className="text-on-surface-muted text-sm">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={settings.dailyCostLimit ?? 1.0}
                  onChange={(e) => updateSettings({ dailyCostLimit: parseFloat(e.target.value) || 0 })}
                  className="w-24 bg-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <span className="text-xs text-on-surface-muted">
                {(settings.dailyCostLimit ?? 0) <= 0 ? '비활성화됨' : `$${(settings.dailyCostLimit ?? 1).toFixed(2)} 초과 시 경고`}
              </span>
            </div>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-on-surface mb-4">글로벌 시스템 프롬프트</h2>
          <div className="bg-surface-2 rounded-xl p-4">
            <p className="text-sm text-on-surface-muted mb-2">
              모든 대화에 자동으로 적용되는 시스템 프롬프트입니다. 에이전트 사용 시 에이전트 프롬프트가 우선합니다.
            </p>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="예: 당신은 한국어로 답변하는 AI 어시스턴트입니다..."
              rows={4}
              className="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 outline-none resize-none focus:ring-1 focus:ring-blue-500"
            />

            {/* System Prompt Presets Library */}
            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-on-surface-muted flex items-center gap-1">
                  <BookMarked size={11} /> 프리셋 라이브러리
                </span>
                <button
                  onClick={() => { setShowSavePreset(true); setPresetName(''); }}
                  disabled={!systemPrompt.trim()}
                  className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-40 flex items-center gap-0.5"
                  aria-label="현재 시스템 프롬프트를 라이브러리에 저장"
                >
                  <Plus size={11} /> 현재 내용 저장
                </button>
              </div>

              {/* Inline save form */}
              {showSavePreset && (
                <div className="flex items-center gap-2 mb-2">
                  <input
                    autoFocus
                    type="text"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && presetName.trim()) {
                        addSystemPromptPreset(presetName.trim(), systemPrompt);
                        setShowSavePreset(false);
                      }
                      if (e.key === 'Escape') setShowSavePreset(false);
                    }}
                    placeholder="프리셋 이름..."
                    className="flex-1 px-2.5 py-1.5 bg-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 outline-none focus:ring-1 focus:ring-blue-500"
                    aria-label="프리셋 이름 입력"
                  />
                  <button
                    onClick={() => { if (presetName.trim()) { addSystemPromptPreset(presetName.trim(), systemPrompt); setShowSavePreset(false); } }}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs text-white"
                  >저장</button>
                  <button onClick={() => setShowSavePreset(false)} className="text-on-surface-muted hover:text-on-surface" aria-label="취소">
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* Preset chips */}
              {systemPromptPresets.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {systemPromptPresets.map((p) => (
                    <div key={p.id} className="group flex items-center gap-1 px-2.5 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs transition-colors">
                      <button
                        onClick={() => setSystemPrompt(p.content)}
                        className="text-gray-200 hover:text-white max-w-[120px] truncate"
                        title={p.content}
                        aria-label={`프리셋 '${p.name}' 적용`}
                      >{p.name}</button>
                      <button
                        onClick={() => removeSystemPromptPreset(p.id)}
                        className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label={`프리셋 '${p.name}' 삭제`}
                      ><X size={10} /></button>
                    </div>
                  ))}
                </div>
              )}
              {systemPromptPresets.length === 0 && !showSavePreset && (
                <p className="text-xs text-on-surface-muted">저장된 프리셋이 없습니다</p>
              )}
            </div>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-on-surface mb-4">데이터 저장소</h2>
          <div className="bg-surface-2 rounded-xl p-4">
            <p className="text-sm text-on-surface-muted mb-2">
              모든 데이터는 브라우저 로컬 저장소에 저장됩니다. 서버로 전송되지 않습니다.
            </p>
            <div className="flex flex-wrap gap-2">
              <button onClick={handleExport} className="flex items-center gap-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm text-white">
                <Download size={14} /> 전체 백업
              </button>
              <button
                onClick={() => exportAllChatsAsJSON(chatStore.chats)}
                className="flex items-center gap-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-white"
                title="모든 채팅을 JSON 파일 하나로 내보냅니다"
              >
                <Download size={14} /> 채팅 JSON 내보내기
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
          <h2 className="text-lg font-semibold text-on-surface mb-4">정보</h2>
          <div className="bg-surface-2 rounded-xl p-4 text-sm text-on-surface-muted">
            <p>Blend v0.1.0</p>
            <p className="mt-1">AI 채팅 인터페이스 - BYOK (Bring Your Own Key)</p>
          </div>
        </section>
      </div>
    </div>
  );
}
