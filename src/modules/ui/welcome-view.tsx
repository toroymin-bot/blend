'use client';

import { useState } from 'react';
import { useAPIKeyStore } from '@/stores/api-key-store';
import { Key, ArrowRight, Bot, FileText, Zap, Globe, ExternalLink } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

interface WelcomeViewProps {
  onComplete: () => void;
}

const PROVIDERS = [
  { id: 'openai' as const, name: 'OpenAI', placeholder: 'sk-...', color: '#10a37f', models: 'GPT-4o, GPT-4.1, o3, o4-mini', keyUrl: 'https://platform.openai.com/api-keys', noteKey: 'common.free_tier' as const },
  { id: 'anthropic' as const, name: 'Anthropic', placeholder: 'sk-ant-...', color: '#d4a574', models: 'Claude Opus 4, Sonnet 4, Haiku 4.5', keyUrl: 'https://console.anthropic.com/settings/keys', noteKey: null },
  { id: 'google' as const, name: 'Google', placeholder: 'AIza...', color: '#4285f4', models: 'Gemini 2.5 Pro, 2.0 Flash', keyUrl: 'https://aistudio.google.com/app/apikey', noteKey: 'common.free_tier' as const },
  { id: 'deepseek' as const, name: 'DeepSeek', placeholder: 'sk-...', color: '#4D6BFE', models: 'DeepSeek-V3, DeepSeek-R1', keyUrl: 'https://platform.deepseek.com/api_keys', noteKey: 'common.ultra_cheap' as const },
  { id: 'groq' as const, name: 'Groq', placeholder: 'gsk_...', color: '#F55036', models: 'Llama 3.3 70B, Mixtral 8x7B', keyUrl: 'https://console.groq.com/keys', noteKey: 'common.free_fast' as const },
];

export function WelcomeView({ onComplete }: WelcomeViewProps) {
  const { t } = useTranslation();
  const { setKey, hasKey } = useAPIKeyStore();
  const [keys, setKeys] = useState({ openai: '', anthropic: '', google: '', deepseek: '', groq: '' });
  const [step, setStep] = useState<'intro' | 'keys'>('intro');

  const FEATURES = [
    { icon: <Bot size={18} />, textKey: 'welcome.feature_models' as const },
    { icon: <FileText size={18} />, textKey: 'welcome.feature_docs' as const },
    { icon: <Zap size={18} />, textKey: 'welcome.feature_streaming' as const },
    { icon: <Globe size={18} />, textKey: 'welcome.feature_plugins' as const },
  ];

  const handleSave = () => {
    if (keys.openai.trim()) setKey('openai', keys.openai.trim());
    if (keys.anthropic.trim()) setKey('anthropic', keys.anthropic.trim());
    if (keys.google.trim()) setKey('google', keys.google.trim());
    if (keys.deepseek.trim()) setKey('deepseek', keys.deepseek.trim());
    if (keys.groq.trim()) setKey('groq', keys.groq.trim());
    onComplete();
  };

  const hasAnyKey = keys.openai.trim() || keys.anthropic.trim() || keys.google.trim() ||
    keys.deepseek.trim() || keys.groq.trim() ||
    hasKey('openai') || hasKey('anthropic') || hasKey('google') ||
    hasKey('deepseek') || hasKey('groq');

  if (step === 'intro') {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-900 px-6 text-center">
        <div className="max-w-sm">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-3xl font-bold text-white mx-auto mb-6 shadow-2xl">
            B
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">{t('welcome.title')}</h1>
          <p className="text-gray-400 mb-8 text-sm leading-relaxed">
            {t('welcome.subtitle').split('\n').map((line, i) => (
              <span key={i}>{line}{i === 0 ? <br /> : null}</span>
            ))}
          </p>

          <div className="space-y-3 mb-8 text-left">
            {FEATURES.map((f, i) => (
              <div key={i} className="flex items-center gap-3 text-gray-300 text-sm">
                <span className="text-blue-400">{f.icon}</span>
                {t(f.textKey)}
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <button
              onClick={() => setStep('keys')}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-colors"
            >
              {t('welcome.start')} <ArrowRight size={18} />
            </button>
            <button
              onClick={onComplete}
              className="w-full py-2 text-gray-500 hover:text-gray-300 text-sm transition-colors"
            >
              {t('welcome.skip')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full bg-gray-900 px-6">
      <div className="max-w-sm w-full">
        <div className="flex items-center gap-2 mb-6">
          <Key size={20} className="text-blue-400" />
          <h2 className="text-xl font-semibold text-white">{t('welcome.api_key_setup')}</h2>
        </div>
        <p className="text-gray-400 text-sm mb-6">
          {t('welcome.api_key_desc')}
        </p>

        <div className="space-y-4 mb-6">
          {PROVIDERS.map((p) => (
            <div key={p.id}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-gray-400 flex items-center gap-2">
                  <span style={{ color: p.color }}>●</span>
                  {p.name}
                  <span className="text-gray-600">({p.models})</span>
                  {p.noteKey && (
                    <span className="text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded">{t(p.noteKey)}</span>
                  )}
                </label>
                <a
                  href={p.keyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-0.5 text-xs text-blue-400 hover:text-blue-300"
                >
                  {t('welcome.get_key')} <ExternalLink size={10} />
                </a>
              </div>
              <input
                type="password"
                value={keys[p.id as keyof typeof keys]}
                onChange={(e) => setKeys((prev) => ({ ...prev, [p.id]: e.target.value }))}
                placeholder={p.placeholder}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-600 outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-600 mb-6">
          {t('welcome.change_later')}
        </p>

        <div className="space-y-3">
          <button
            onClick={handleSave}
            disabled={!hasAnyKey}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl font-medium transition-colors"
          >
            {hasAnyKey ? t('welcome.complete') : t('welcome.enter_key')}
          </button>
          <button
            onClick={onComplete}
            className="w-full py-2 text-gray-500 hover:text-gray-300 text-sm transition-colors"
          >
            {t('welcome.skip_setup')}
          </button>
        </div>
      </div>
    </div>
  );
}
