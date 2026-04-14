'use client';

import { useAPIKeyStore } from '@/stores/api-key-store';
import { useChatStore } from '@/stores/chat-store';
import { usePromptStore } from '@/stores/prompt-store';
import { useAgentStore } from '@/stores/agent-store';
import { useUsageStore } from '@/stores/usage-store';
import { useSettingsStore } from '@/stores/settings-store';
import { AIProvider } from '@/types';
import { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, Check, X, Key, Download, Upload, Sun, Moon, BookMarked, Plus, Cpu, Trash2, ExternalLink, Loader, AlertCircle, HelpCircle, Globe } from 'lucide-react';
import { exportAllChatsAsJSON } from '@/modules/chat/export-chat';
import { useTranslation } from '@/lib/i18n';

const API_GUIDE_STEPS_KEYS: Record<string, { emoji: string; titleKey: string; descKey: string }[]> = {
  openai: [
    { emoji: '🌐', titleKey: 'settings.guide_visit_site', descKey: 'settings.guide_openai_visit' },
    { emoji: '👤', titleKey: 'settings.guide_signup', descKey: 'settings.guide_signup_email' },
    { emoji: '💳', titleKey: 'settings.guide_add_card', descKey: 'settings.guide_openai_card' },
    { emoji: '🗂️', titleKey: 'settings.guide_api_keys_menu', descKey: 'settings.guide_api_keys_menu_desc' },
    { emoji: '➕', titleKey: 'settings.guide_create_key', descKey: 'settings.guide_openai_create' },
    { emoji: '📋', titleKey: 'settings.guide_copy_key', descKey: 'settings.guide_openai_copy' },
  ],
  anthropic: [
    { emoji: '🌐', titleKey: 'settings.guide_visit_site', descKey: 'settings.guide_anthropic_visit' },
    { emoji: '👤', titleKey: 'settings.guide_signup', descKey: 'settings.guide_signup_email' },
    { emoji: '💳', titleKey: 'settings.guide_add_card', descKey: 'settings.guide_anthropic_card' },
    { emoji: '🗂️', titleKey: 'settings.guide_api_keys_menu', descKey: 'settings.guide_api_keys_menu_desc' },
    { emoji: '➕', titleKey: 'settings.guide_create_key', descKey: 'settings.guide_anthropic_create' },
    { emoji: '📋', titleKey: 'settings.guide_copy_key', descKey: 'settings.guide_anthropic_copy' },
  ],
  google: [
    { emoji: '🌐', titleKey: 'settings.guide_visit_site', descKey: 'settings.guide_google_visit' },
    { emoji: '👤', titleKey: 'settings.guide_google_login', descKey: 'settings.guide_google_login_desc' },
    { emoji: '🔑', titleKey: 'settings.guide_google_get_key', descKey: 'settings.guide_google_get_key_desc' },
    { emoji: '➕', titleKey: 'settings.guide_create_key', descKey: 'settings.guide_google_create' },
    { emoji: '📋', titleKey: 'settings.guide_copy_key', descKey: 'settings.guide_google_copy' },
    { emoji: '🎉', titleKey: 'settings.guide_free_tier', descKey: 'settings.guide_free_tier_desc' },
  ],
  deepseek: [
    { emoji: '🌐', titleKey: 'settings.guide_visit_site', descKey: 'settings.guide_deepseek_visit' },
    { emoji: '👤', titleKey: 'settings.guide_signup', descKey: 'settings.guide_signup_email' },
    { emoji: '💳', titleKey: 'settings.guide_topup', descKey: 'settings.guide_deepseek_topup' },
    { emoji: '🗂️', titleKey: 'settings.guide_api_keys_menu', descKey: 'settings.guide_api_keys_menu_desc' },
    { emoji: '➕', titleKey: 'settings.guide_create_key', descKey: 'settings.guide_deepseek_create' },
    { emoji: '📋', titleKey: 'settings.guide_copy_key', descKey: 'settings.guide_openai_copy' },
  ],
  groq: [
    { emoji: '🌐', titleKey: 'settings.guide_visit_site', descKey: 'settings.guide_groq_visit' },
    { emoji: '👤', titleKey: 'settings.guide_signup', descKey: 'settings.guide_groq_signup' },
    { emoji: '🗂️', titleKey: 'settings.guide_api_keys_menu', descKey: 'settings.guide_api_keys_menu_desc' },
    { emoji: '➕', titleKey: 'settings.guide_create_key', descKey: 'settings.guide_groq_create' },
    { emoji: '📋', titleKey: 'settings.guide_copy_key', descKey: 'settings.guide_groq_copy' },
    { emoji: '🎉', titleKey: 'settings.guide_free_tier', descKey: 'settings.guide_free_tier_desc' },
  ],
};

const PROVIDERS: {
  id: AIProvider;
  name: string;
  color: string;
  placeholder: string;
  models: string;
  keyUrl: string;
  noteKey?: string;
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
    models: 'Claude Opus 4, Sonnet 4, Haiku 4.5',
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'google',
    name: 'Google Gemini',
    color: '#4285f4',
    placeholder: 'AIza...',
    models: 'Gemini 2.0 Flash, Gemini 2.5 Pro',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    noteKey: 'common.free_tier',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    color: '#4D6BFE',
    placeholder: 'sk-...',
    models: 'DeepSeek-V3, DeepSeek-R1',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    noteKey: 'common.ultra_cheap',
  },
  {
    id: 'groq',
    name: 'Groq',
    color: '#F55036',
    placeholder: 'gsk_...',
    models: 'Llama 3.3 70B, Mixtral 8x7B',
    keyUrl: 'https://console.groq.com/keys',
    noteKey: 'common.free_fast',
  },
];

export function SettingsView() {
  const { keys, setKey, loadFromStorage } = useAPIKeyStore();
  const chatStore = useChatStore();
  const promptStore = usePromptStore();
  const agentStore = useAgentStore();
  const usageStore = useUsageStore();
  const { systemPrompt, setSystemPrompt, settings, updateSettings, systemPromptPresets, addSystemPromptPreset, removeSystemPromptPreset, customModels, addCustomModel, removeCustomModel } = useSettingsStore();
  const { t, lang, setLang } = useTranslation();
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [testingKey, setTestingKey] = useState<Record<string, boolean>>({});
  const [testResult, setTestResult] = useState<Record<string, 'ok' | 'fail' | null>>({});
  const [guideProvider, setGuideProvider] = useState<string | null>(null);
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
        alert(t('settings.import_success'));
      } catch {
        alert(t('settings.import_error'));
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
          headers: {
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
        });
        ok = res.ok;
      } else if (providerId === 'google') {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        ok = res.ok;
      } else if (providerId === 'deepseek') {
        const res = await fetch('https://api.deepseek.com/v1/models', { headers: { Authorization: `Bearer ${key}` } });
        ok = res.ok;
      } else if (providerId === 'groq') {
        const res = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${key}` } });
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
    if (confirm(t('settings.clear_all_confirm'))) {
      // [2026-04-12 01:07] BUG-011 수정: localStorage.clear() → blend: 접두사 키만 삭제
      // 기존: localStorage.clear() → 다른 브라우저 앱 데이터까지 삭제되는 버그
      // 수정: blend: 또는 blend- 로 시작하는 키만 삭제
      const keysToDelete: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('blend') || key.startsWith('blend:') || key.startsWith('blend-'))) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach((key) => localStorage.removeItem(key));
      window.location.reload();
    }
  };

  const guideData = guideProvider ? API_GUIDE_STEPS_KEYS[guideProvider] : null;
  const guideProviderInfo = PROVIDERS.find((p) => p.id === guideProvider);

  return (
    <div className="h-full overflow-y-auto bg-surface p-6">
      {/* API Key Guide Modal */}
      {guideProvider && guideData && (
        <>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60" onClick={() => setGuideProvider(null)} />
            <div className="relative z-10 w-full max-w-sm bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="px-5 pt-5 pb-4 border-b border-gray-700 flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">{t('settings.api_guide_title')}</p>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <span style={{ color: guideProviderInfo?.color }}>●</span>
                    {guideProviderInfo?.name}
                  </h2>
                </div>
                <button onClick={() => setGuideProvider(null)} className="text-gray-500 hover:text-white p-1">
                  <X size={18} />
                </button>
              </div>
              {/* Steps */}
              <div className="px-5 py-4 space-y-4">
                {guideData.map((step, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                      {i + 1}
                    </div>
                    <div className="flex items-start gap-2.5 pt-0.5">
                      <span className="text-xl leading-none">{step.emoji}</span>
                      <div>
                        <p className="text-sm font-medium text-white leading-tight">{t(step.titleKey)}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{t(step.descKey)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Footer */}
              <div className="px-5 pb-5">
                <a
                  href={guideProviderInfo?.keyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2.5 bg-blue-600 hover:bg-blue-700 rounded-xl text-sm font-medium text-white transition-colors"
                >
                  {t('settings.go_to_site')} <ExternalLink size={14} />
                </a>
              </div>
            </div>
          </div>
        </>
      )}
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-on-surface mb-6">{t('settings.title')}</h1>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-on-surface mb-1 flex items-center gap-2">
            <Key size={20} /> {t('settings.api_keys')}
          </h2>
          <p className="text-sm text-on-surface-muted mb-4">
            {t('settings.api_keys_desc')}
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
                        {provider.noteKey && (
                          <span className="text-xs text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded">{t(provider.noteKey)}</span>
                        )}
                      </div>
                      <p className="text-xs text-on-surface-muted mt-0.5">{provider.models}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {keys[provider.id] ? (
                      <span className="flex items-center gap-1 text-xs text-green-400">
                        <Check size={12} /> {t('settings.key_set')}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-on-surface-muted">
                        <X size={12} /> {t('settings.key_not_set')}
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
                    aria-label={showKeys[provider.id] ? t('settings.hide_key') : t('settings.show_key')}
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
                      title={t('settings.test_key')}
                    >
                      {testingKey[provider.id] ? <Loader size={12} className="animate-spin" /> :
                       testResult[provider.id] === 'ok' ? <Check size={12} /> :
                       testResult[provider.id] === 'fail' ? <AlertCircle size={12} /> :
                       t('settings.test_key')}
                    </button>
                  )}
                </div>
                {/* Get key link + guide button */}
                {!keys[provider.id] && (
                  <div className="flex items-center gap-3 mt-2">
                    <a
                      href={provider.keyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                    >
                      {t('settings.get_api_key')} <ExternalLink size={11} />
                    </a>
                    <button
                      onClick={() => setGuideProvider(provider.id)}
                      className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200"
                    >
                      <HelpCircle size={12} /> {t('settings.how_to_get')}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── Custom Model Endpoints ── */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-on-surface mb-1 flex items-center gap-2">
            <Cpu size={20} /> {t('settings.custom_models')}
          </h2>
          <p className="text-sm text-on-surface-muted mb-4">
            {t('settings.custom_models_desc')}
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
                    aria-label={`${t('settings.delete')} ${m.name}`}
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
                  <label className="text-xs text-on-surface-muted mb-1 block">{t('settings.display_name')}</label>
                  <input
                    type="text"
                    value={newModelName}
                    onChange={(e) => setNewModelName(e.target.value)}
                    placeholder="Llama 3.2"
                    className="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-on-surface-muted mb-1 block">{t('settings.model_id')}</label>
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
                >{t('settings.add')}</button>
                <button
                  onClick={() => { setShowAddModel(false); setNewModelName(''); setNewModelId(''); setNewModelBaseUrl(''); }}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300"
                >{t('settings.cancel')}</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddModel(true)}
              className="flex items-center gap-2 px-4 py-2 bg-surface-2 hover:bg-gray-700 rounded-xl text-sm text-on-surface-muted border border-dashed border-border-token transition-colors"
            >
              <Plus size={16} /> {t('settings.add_model')}
            </button>
          )}
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-on-surface mb-4">{t('settings.theme')}</h2>
          <div className="bg-surface-2 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-on-surface">{t('settings.color_theme')}</span>
              <div className="flex gap-1">
                {(['light', 'dark', 'system'] as const).map((theme) => (
                  <button
                    key={theme}
                    onClick={() => updateSettings({ theme })}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      settings.theme === theme
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'
                    }`}
                  >
                    {theme === 'light' && <Sun size={12} />}
                    {theme === 'dark' && <Moon size={12} />}
                    {theme === 'light' ? t('settings.light') : theme === 'dark' ? t('settings.dark') : t('settings.system')}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-on-surface-muted">
              {settings.theme === 'system' ? t('settings.theme_system') : settings.theme === 'light' ? t('settings.theme_light') : t('settings.theme_dark')}
            </p>
          </div>
        </section>

        {/* ── Language Selector ── */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-on-surface mb-4 flex items-center gap-2">
            <Globe size={20} /> {t('settings.language')}
          </h2>
          <div className="bg-surface-2 rounded-xl p-4">
            <p className="text-sm text-on-surface-muted mb-3">{t('settings.language_desc')}</p>
            <div className="flex gap-2">
              {(['ko', 'en'] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    lang === l
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'
                  }`}
                >
                  <span>{l === 'ko' ? '🇰🇷' : '🇺🇸'}</span>
                  <span>{l === 'ko' ? t('settings.language_ko') : t('settings.language_en')}</span>
                  {lang === l && <Check size={14} />}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-on-surface mb-4">{t('settings.cost_alert')}</h2>
          <div className="bg-surface-2 rounded-xl p-4">
            <p className="text-sm text-on-surface-muted mb-3">
              {t('settings.cost_alert_desc')}
            </p>
            <div className="flex items-center gap-3">
              <label className="text-sm text-on-surface whitespace-nowrap">{t('settings.daily_limit')}</label>
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
                {(settings.dailyCostLimit ?? 0) <= 0 ? t('settings.limit_disabled') : t('settings.limit_warn', { amount: (settings.dailyCostLimit ?? 1).toFixed(2) })}
              </span>
            </div>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-on-surface mb-4">{t('settings.system_prompt')}</h2>
          <div className="bg-surface-2 rounded-xl p-4">
            <p className="text-sm text-on-surface-muted mb-2">
              {t('settings.system_prompt_desc')}
            </p>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder={t('settings.system_prompt_placeholder')}
              rows={4}
              className="w-full px-3 py-2 bg-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 outline-none resize-none focus:ring-1 focus:ring-blue-500"
            />

            {/* System Prompt Presets Library */}
            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-on-surface-muted flex items-center gap-1">
                  <BookMarked size={11} /> {t('settings.preset_library')}
                </span>
                <button
                  onClick={() => { setShowSavePreset(true); setPresetName(''); }}
                  disabled={!systemPrompt.trim()}
                  className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-40 flex items-center gap-0.5"
                  aria-label={t('settings.save_current')}
                >
                  <Plus size={11} /> {t('settings.save_current')}
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
                    placeholder={t('settings.preset_name_placeholder')}
                    className="flex-1 px-2.5 py-1.5 bg-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 outline-none focus:ring-1 focus:ring-blue-500"
                    aria-label={t('settings.preset_name_placeholder')}
                  />
                  <button
                    onClick={() => { if (presetName.trim()) { addSystemPromptPreset(presetName.trim(), systemPrompt); setShowSavePreset(false); } }}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs text-white"
                  >{t('settings.save')}</button>
                  <button onClick={() => setShowSavePreset(false)} className="text-on-surface-muted hover:text-on-surface" aria-label={t('settings.cancel')}>
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
                        aria-label={t('settings.apply_preset', { name: p.name })}
                      >{p.name}</button>
                      <button
                        onClick={() => removeSystemPromptPreset(p.id)}
                        className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label={t('settings.delete_preset', { name: p.name })}
                      ><X size={10} /></button>
                    </div>
                  ))}
                </div>
              )}
              {systemPromptPresets.length === 0 && !showSavePreset && (
                <p className="text-xs text-on-surface-muted">{t('settings.no_presets')}</p>
              )}
            </div>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-on-surface mb-4">{t('settings.data_storage')}</h2>
          <div className="bg-surface-2 rounded-xl p-4">
            <p className="text-sm text-on-surface-muted mb-2">
              {t('settings.data_storage_desc')}
            </p>
            <div className="flex flex-wrap gap-2">
              <button onClick={handleExport} className="flex items-center gap-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm text-white">
                <Download size={14} /> {t('settings.export_all')}
              </button>
              <button
                onClick={() => exportAllChatsAsJSON(chatStore.chats)}
                className="flex items-center gap-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-white"
                title={t('settings.export_chats_json')}
              >
                <Download size={14} /> {t('settings.export_chats_json')}
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-white">
                <Upload size={14} /> {t('settings.import')}
              </button>
              <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
              <button onClick={handleClearAll} className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 rounded-lg text-sm text-red-400">
                {t('settings.clear_all')}
              </button>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-on-surface mb-4">{t('settings.info')}</h2>
          <div className="bg-surface-2 rounded-xl p-4 text-sm text-on-surface-muted">
            <p>{t('settings.version')}</p>
            <p className="mt-1">{t('app.tagline')}</p>
          </div>
        </section>
      </div>
    </div>
  );
}
