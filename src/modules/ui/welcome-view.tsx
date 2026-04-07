'use client';

import { useState } from 'react';
import { useAPIKeyStore } from '@/stores/api-key-store';
import { Key, ArrowRight, Bot, FileText, Zap, Globe } from 'lucide-react';

interface WelcomeViewProps {
  onComplete: () => void;
}

const PROVIDERS = [
  { id: 'openai' as const, name: 'OpenAI', placeholder: 'sk-...', color: '#10a37f', models: 'GPT-4o, GPT-4o Mini' },
  { id: 'anthropic' as const, name: 'Anthropic', placeholder: 'sk-ant-...', color: '#d4a574', models: 'Claude Sonnet 4.6, Haiku 4.5' },
  { id: 'google' as const, name: 'Google', placeholder: 'AIza...', color: '#4285f4', models: 'Gemini 2.5 Pro, 2.0 Flash' },
];

const FEATURES = [
  { icon: <Bot size={18} />, text: '6개 이상의 최신 AI 모델' },
  { icon: <FileText size={18} />, text: 'Excel/CSV 문서 RAG 검색' },
  { icon: <Zap size={18} />, text: '스트리밍 응답 + 비용 추적' },
  { icon: <Globe size={18} />, text: '웹 검색, 이미지 생성, 코드 실행' },
];

export function WelcomeView({ onComplete }: WelcomeViewProps) {
  const { setKey, hasKey } = useAPIKeyStore();
  const [keys, setKeys] = useState({ openai: '', anthropic: '', google: '' });
  const [step, setStep] = useState<'intro' | 'keys'>('intro');

  const handleSave = () => {
    if (keys.openai.trim()) setKey('openai', keys.openai.trim());
    if (keys.anthropic.trim()) setKey('anthropic', keys.anthropic.trim());
    if (keys.google.trim()) setKey('google', keys.google.trim());
    onComplete();
  };

  const hasAnyKey = keys.openai.trim() || keys.anthropic.trim() || keys.google.trim() ||
    hasKey('openai') || hasKey('anthropic') || hasKey('google');

  if (step === 'intro') {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-900 px-6 text-center">
        <div className="max-w-sm">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-3xl font-bold text-white mx-auto mb-6 shadow-2xl">
            B
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Blend에 오신 것을 환영합니다</h1>
          <p className="text-gray-400 mb-8 text-sm leading-relaxed">
            OpenAI, Anthropic, Google의 최신 AI를 하나의 앱에서.<br />
            API 키를 직접 사용하는 완전 오픈소스 AI 채팅 앱입니다.
          </p>

          <div className="space-y-3 mb-8 text-left">
            {FEATURES.map((f, i) => (
              <div key={i} className="flex items-center gap-3 text-gray-300 text-sm">
                <span className="text-blue-400">{f.icon}</span>
                {f.text}
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <button
              onClick={() => setStep('keys')}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-colors"
            >
              시작하기 <ArrowRight size={18} />
            </button>
            <button
              onClick={onComplete}
              className="w-full py-2 text-gray-500 hover:text-gray-300 text-sm transition-colors"
            >
              나중에 설정
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
          <h2 className="text-xl font-semibold text-white">API 키 설정</h2>
        </div>
        <p className="text-gray-400 text-sm mb-6">
          최소 하나의 API 키를 입력하면 시작할 수 있습니다. 키는 브라우저에만 저장되며 서버로 전송되지 않습니다.
        </p>

        <div className="space-y-4 mb-6">
          {PROVIDERS.map((p) => (
            <div key={p.id}>
              <label className="text-xs text-gray-400 mb-1 block flex items-center gap-2">
                <span style={{ color: p.color }}>●</span>
                {p.name}
                <span className="text-gray-600">({p.models})</span>
              </label>
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
          나중에 설정 {'>'} API 키 관리에서 변경 가능합니다
        </p>

        <div className="space-y-3">
          <button
            onClick={handleSave}
            disabled={!hasAnyKey}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl font-medium transition-colors"
          >
            {hasAnyKey ? '완료 — 채팅 시작' : 'API 키를 입력해주세요'}
          </button>
          <button
            onClick={onComplete}
            className="w-full py-2 text-gray-500 hover:text-gray-300 text-sm transition-colors"
          >
            나중에 설정
          </button>
        </div>
      </div>
    </div>
  );
}
