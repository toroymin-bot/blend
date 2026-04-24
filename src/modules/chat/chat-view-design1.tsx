/**
 * D1ChatView — Jobs/Apple-inspired chat view for /design1/ route
 *
 * Handles: empty state, message list, streaming, code blocks,
 *          message actions, sticky input, model dropdown.
 *
 * Does NOT modify the original chat-view.tsx.
 * Self-contained local state (no shared chat-store) for design isolation.
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import hljs from 'highlight.js';
import { useAPIKeyStore } from '@/stores/api-key-store';
import { sendChatRequest } from '@/modules/chat/chat-api';
import type { AIProvider } from '@/types';
import { useTrialStore } from '@/stores/trial-store';
import { sendTrialMessage, TRIAL_KEY_AVAILABLE } from '@/modules/chat/trial-gemini-client';
import { D1TrialExhaustedModal, D1KeyRequiredModal } from '@/modules/chat/trial-modals-design1';

// ============================================================
// Design tokens (same as Phase 1)
// ============================================================
const tokens = {
  bg: '#fafaf9',
  surface: '#ffffff',
  surfaceAlt: '#f6f5f3',
  text: '#0a0a0a',
  textDim: '#6b6862',
  textFaint: '#a8a49b',
  accent: '#c65a3c',
  accentSoft: 'rgba(198, 90, 60, 0.08)',
  border: 'rgba(10, 10, 10, 0.06)',
  borderStrong: 'rgba(10, 10, 10, 0.12)',
} as const;

// ============================================================
// i18n
// ============================================================
const copy = {
  ko: {
    emptyTitle: '',
    emptyTitleAccent: '무엇을',
    emptyTitleEnd: '도와드릴까요?',
    emptySubtitle: '모든 AI가 하나의 대화 안에 있습니다.',
    placeholder: '질문을 입력하세요',
    placeholderActive: 'Blend에게 계속 질문하세요',
    suggestions: ['이메일 초안 써줘', '이 이미지 분석해줘', '코드 리뷰 해줘', '긴 글 요약해줘'],
    modelAuto: '자동',
    modelAutoDesc: '질문에 가장 적합한 AI를 자동 선택',
    footer: 'Blend는 각 질문에 가장 적합한 AI를 자동으로 선택합니다',
    copy: '복사',
    copied: '복사됨',
    regenerate: '다시 생성',
    noApiKey: 'API 키를 설정해주세요.',
    history: '대화 기록',
    share: '공유',
    attachFile: '파일 첨부',
    voiceInput: '음성 입력',
    send: '보내기',
  },
  en: {
    emptyTitle: 'How can I',
    emptyTitleAccent: 'help',
    emptyTitleEnd: 'today?',
    emptySubtitle: 'Every AI, inside one conversation.',
    placeholder: 'Ask anything',
    placeholderActive: 'Ask Blend anything',
    suggestions: ['Draft an email', 'Analyze this image', 'Review my code', 'Summarize a long text'],
    modelAuto: 'Auto',
    modelAutoDesc: 'Picks the best AI for each question',
    footer: 'Blend picks the best AI for each question automatically',
    copy: 'Copy',
    copied: 'Copied',
    regenerate: 'Regenerate',
    noApiKey: 'Please configure an API key first.',
    history: 'History',
    share: 'Share',
    attachFile: 'Attach file',
    voiceInput: 'Voice input',
    send: 'Send',
  },
} as const;

type Lang = keyof typeof copy;

// ============================================================
// Model registry
// ============================================================
const MODELS = [
  { id: 'auto',              name: 'Auto',            brand: 'blend',     provider: 'openai' as AIProvider,     apiModel: 'gpt-4o-mini',              desc_ko: '질문에 가장 적합한 AI를 자동 선택',  desc_en: 'Picks the best AI for each question' },
  { id: 'gpt-4o-mini',       name: 'GPT-4o mini',     brand: 'openai',    provider: 'openai' as AIProvider,     apiModel: 'gpt-4o-mini',              desc_ko: '빠르고 경제적인 OpenAI 모델',        desc_en: 'Fast and affordable OpenAI model' },
  { id: 'gpt-4o',            name: 'GPT-4o',          brand: 'openai',    provider: 'openai' as AIProvider,     apiModel: 'gpt-4o',                   desc_ko: '강력한 범용 성능',                   desc_en: 'Strong all-around performance' },
  { id: 'claude-3-5-haiku',  name: 'Claude 3.5 Haiku',brand: 'anthropic', provider: 'anthropic' as AIProvider,  apiModel: 'claude-3-5-haiku-20241022', desc_ko: '빠른 Anthropic 모델',               desc_en: 'Fast Anthropic model' },
  { id: 'claude-opus-4',     name: 'Claude Opus 4',   brand: 'anthropic', provider: 'anthropic' as AIProvider,  apiModel: 'claude-opus-4-5',          desc_ko: '글 쓰기와 추론에 최적',              desc_en: 'Best for writing and reasoning' },
  { id: 'gemini-2.0-flash',  name: 'Gemini 2.0 Flash',brand: 'google',    provider: 'google' as AIProvider,     apiModel: 'gemini-2.0-flash',         desc_ko: '체험 가능 · 무료 AI',                desc_en: 'Free trial · no key needed' },
  { id: 'gemini-1.5-flash',  name: 'Gemini 1.5 Flash',brand: 'google',    provider: 'google' as AIProvider,     apiModel: 'gemini-1.5-flash',         desc_ko: '실시간 정보와 멀티모달',             desc_en: 'Real-time info and multimodal' },
] as const;

const BRAND_COLORS: Record<string, string> = {
  blend:     '#c65a3c',
  openai:    '#10a37f',
  anthropic: '#d97757',
  google:    '#4285f4',
};

// ============================================================
// Message shape (local — design1 isolated from main chat-store)
// ============================================================
type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  modelUsed?: string;
};

// ============================================================
// Main component
// ============================================================
export default function D1ChatView({
  lang,
  onConversationStart,
}: {
  lang: 'ko' | 'en';
  onConversationStart?: (title: string) => void;
}) {
  const { keys, getKey, hasKey, loadFromStorage } = useAPIKeyStore();

  useEffect(() => { loadFromStorage(); }, []);

  // ── Trial store ──────────────────────────────────────────────
  const { resetIfNewDay: trialResetIfNewDay } = useTrialStore();
  const trialDailyCount = useTrialStore((s) => s.dailyCount);
  const trialMaxPerDay  = useTrialStore((s) => s.maxPerDay);
  const trialRemaining  = Math.max(0, trialMaxPerDay - trialDailyCount);
  useEffect(() => { trialResetIfNewDay(); }, []);

  const [showTrialExhausted, setShowTrialExhausted] = useState(false);
  const [showKeyRequired, setShowKeyRequired] = useState<{ providerName: string } | null>(null);

  const hasAnyUserKey = Object.values(keys).some((k) => k && k.trim().length > 0);
  const isTrialMode   = !hasAnyUserKey && TRIAL_KEY_AVAILABLE;

  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [currentModel, setCurrentModel] = useState('gemini-2.0-flash');
  const abortRef = useRef<AbortController | null>(null);

  const t = copy[lang] ?? copy.en;
  const hasMessages = messages.length > 0 || isStreaming;
  const hasAnyKey = (['openai', 'anthropic', 'google', 'deepseek', 'groq'] as AIProvider[]).some(p => hasKey(p));

  const [value, setValue] = useState('');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const modelChipRef = useRef<HTMLButtonElement>(null);

  // Auto-resize input
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }, [value]);

  // Auto-scroll to bottom during streaming
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, streamingContent]);

  // Focus on mount
  useEffect(() => {
    const id = setTimeout(() => textareaRef.current?.focus(), 300);
    return () => clearTimeout(id);
  }, []);

  // Scroll-to-bottom tracking
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 100);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [hasMessages]);

  // Close dropdown on outside click / escape
  useEffect(() => {
    if (!showModelDropdown) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setShowModelDropdown(false);
    const onClick = (e: MouseEvent) => {
      if (modelChipRef.current && !modelChipRef.current.contains(e.target as Node)) {
        const dropdown = document.getElementById('d1-model-dropdown');
        if (dropdown && !dropdown.contains(e.target as Node)) {
          setShowModelDropdown(false);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', onClick);
    };
  }, [showModelDropdown]);

  const canSend = value.trim().length > 0 && !isStreaming;

  function handleSend() {
    if (!canSend) return;
    const content = value.trim();

    // ── Trial mode gate ──────────────────────────────────────────
    if (isTrialMode) {
      if (currentModel !== 'gemini-2.0-flash') {
        const modelDef = MODELS.find(m => m.id === currentModel);
        const PROVIDER_NAMES: Record<string, string> = {
          openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google',
          deepseek: 'DeepSeek', groq: 'Groq', blend: 'Blend',
        };
        const providerName = modelDef
          ? (PROVIDER_NAMES[modelDef.provider] ?? modelDef.provider)
          : 'Unknown';
        setShowKeyRequired({ providerName });
        return;
      }
      const ok = useTrialStore.getState().useTrial();
      if (!ok) {
        setShowTrialExhausted(true);
        return;
      }
    }

    setValue('');
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    if (messages.length === 0 && onConversationStart) {
      onConversationStart(content.slice(0, 45));
    }
    setIsStreaming(true);
    setStreamingContent('');

    const controller = new AbortController();
    abortRef.current = controller;
    let accumulated = '';

    // ── Trial path (Gemini 2.0 Flash, no user key) ───────────────
    if (isTrialMode && currentModel === 'gemini-2.0-flash') {
      sendTrialMessage({
        messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
        signal: controller.signal,
        onChunk: (text) => {
          accumulated += text;
          setStreamingContent(accumulated);
        },
        onDone: (fullText) => {
          setMessages(prev => [...prev, {
            id: Date.now().toString() + '_ai',
            role: 'assistant',
            content: fullText,
            modelUsed: 'gemini-2.0-flash',
          }]);
          setIsStreaming(false);
          setStreamingContent('');
          abortRef.current = null;
        },
        onError: (err) => {
          setMessages(prev => [...prev, {
            id: Date.now().toString() + '_err',
            role: 'assistant',
            content: `Error: ${err.message}`,
          }]);
          setIsStreaming(false);
          setStreamingContent('');
          abortRef.current = null;
        },
      });
      return;
    }

    // ── Normal (BYOK) path ───────────────────────────────────────
    const FALLBACK_ORDER: Array<{ provider: AIProvider; apiModel: string }> = [
      { provider: 'openai',    apiModel: 'gpt-4o-mini' },
      { provider: 'anthropic', apiModel: 'claude-3-5-haiku-20241022' },
      { provider: 'google',    apiModel: 'gemini-1.5-flash' },
      { provider: 'deepseek',  apiModel: 'deepseek-chat' },
      { provider: 'groq',      apiModel: 'llama3-70b-8192' },
    ];

    let resolvedProvider: AIProvider;
    let resolvedApiModel: string;
    let resolvedModelId: string;

    if (currentModel === 'auto') {
      const avail = FALLBACK_ORDER.find(p => hasKey(p.provider));
      if (!avail) {
        setMessages(prev => [...prev, { id: Date.now().toString() + '_err', role: 'assistant', content: t.noApiKey }]);
        setIsStreaming(false);
        return;
      }
      resolvedProvider = avail.provider;
      resolvedApiModel = avail.apiModel;
      resolvedModelId = avail.apiModel;
    } else {
      const modelDef = MODELS.find(m => m.id === currentModel);
      if (!modelDef || !hasKey(modelDef.provider)) {
        const avail = FALLBACK_ORDER.find(p => hasKey(p.provider));
        if (!avail) {
          setMessages(prev => [...prev, { id: Date.now().toString() + '_err', role: 'assistant', content: t.noApiKey }]);
          setIsStreaming(false);
          return;
        }
        resolvedProvider = avail.provider;
        resolvedApiModel = avail.apiModel;
        resolvedModelId = avail.apiModel;
      } else {
        resolvedProvider = modelDef.provider;
        resolvedApiModel = modelDef.apiModel;
        resolvedModelId = modelDef.id;
      }
    }

    sendChatRequest({
      messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
      model: resolvedApiModel,
      provider: resolvedProvider,
      apiKey: getKey(resolvedProvider),
      signal: controller.signal,
      onChunk: (text) => {
        accumulated += text;
        setStreamingContent(accumulated);
      },
      onDone: (fullText) => {
        setMessages(prev => [...prev, {
          id: Date.now().toString() + '_ai',
          role: 'assistant',
          content: fullText,
          modelUsed: resolvedModelId,
        }]);
        setIsStreaming(false);
        setStreamingContent('');
        abortRef.current = null;
      },
      onError: (err) => {
        setMessages(prev => [...prev, {
          id: Date.now().toString() + '_err',
          role: 'assistant',
          content: `Error: ${err}`,
        }]);
        setIsStreaming(false);
        setStreamingContent('');
        abortRef.current = null;
      },
    });
  }

  function handleStop() {
    abortRef.current?.abort();
    if (streamingContent) {
      setMessages(prev => [...prev, {
        id: Date.now().toString() + '_ai',
        role: 'assistant',
        content: streamingContent,
        modelUsed: currentModel,
      }]);
    }
    setIsStreaming(false);
    setStreamingContent('');
    abortRef.current = null;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  }

  const fontStack = lang === 'ko'
    ? '"Pretendard Variable", Pretendard, -apple-system, system-ui, sans-serif'
    : '"Geist", -apple-system, system-ui, sans-serif';

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* ============ TOP BAR ============ */}
      <header className="flex h-14 shrink-0 items-center justify-between px-8">
        <div className="flex items-center gap-2">
          <button
            ref={modelChipRef}
            onClick={() => setShowModelDropdown((s) => !s)}
            className="inline-flex items-center gap-2 rounded-full border bg-transparent px-3 py-1.5 pl-2.5 text-[13px] transition-colors hover:bg-white"
            style={{ borderColor: tokens.borderStrong, color: tokens.text, fontFamily: fontStack }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: tokens.accent }} />
            {MODELS.find((m) => m.id === currentModel)?.name ?? t.modelAuto}
            <ChevronIcon />
          </button>
          {isTrialMode && (
            <span
              className="inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] font-medium"
              style={{ background: tokens.accentSoft, color: tokens.accent, fontFamily: fontStack }}
            >
              {lang === 'ko' ? `체험 · ${trialRemaining}/10` : `Trial · ${trialRemaining}/10`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <D1IconButton title={t.history}>
            <HistoryIcon />
          </D1IconButton>
          <D1IconButton title={t.share}>
            <ShareIcon />
          </D1IconButton>
        </div>

        {/* Model Dropdown */}
        {showModelDropdown && (
          <D1ModelDropdown
            lang={lang}
            currentModel={currentModel}
            onSelect={(id) => {
              setCurrentModel(id);
              setShowModelDropdown(false);
            }}
          />
        )}
      </header>

      {/* ============ CONTENT ============ */}
      {hasMessages ? (
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto"
          style={{ fontFamily: fontStack }}
        >
          <div className="mx-auto w-full max-w-[760px] px-8 py-8 pb-[180px]">
            {messages.map((msg) => (
              <D1MessageRow key={msg.id} message={msg} lang={lang} t={t} />
            ))}
            {isStreaming && streamingContent && (
              <D1AssistantMessage content={streamingContent} streaming lang={lang} t={t} />
            )}
          </div>
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col items-center justify-center px-8 pb-[120px]">
          <div
            className="mb-12 text-center"
            style={{ animation: 'd1-rise 700ms cubic-bezier(0.16,1,0.3,1) both' }}
          >
            <h1
              className="mb-3.5 font-medium leading-[1.15] tracking-[-0.03em]"
              style={{ fontSize: 'clamp(32px, 4.5vw, 52px)', fontFamily: fontStack }}
            >
              {t.emptyTitle ? <>{t.emptyTitle}{' '}</> : null}
              <span
                className="italic"
                style={{
                  fontFamily: '"Instrument Serif", Georgia, serif',
                  color: tokens.accent,
                  fontWeight: 400,
                  letterSpacing: '-0.01em',
                }}
              >
                {t.emptyTitleAccent}
              </span>{' '}
              {t.emptyTitleEnd}
            </h1>
            <p className="text-base tracking-[-0.01em]" style={{ color: tokens.textDim }}>
              {t.emptySubtitle}
            </p>
          </div>

          <D1InputBar
            value={value}
            onChange={setValue}
            onSend={handleSend}
            onStop={handleStop}
            onKeyDown={handleKeyDown}
            textareaRef={textareaRef}
            canSend={canSend}
            isStreaming={isStreaming}
            placeholder={t.placeholder}
            attachLabel={t.attachFile}
            sendLabel={t.send}
            floating={false}
          />

          <div
            className="mt-8 flex flex-wrap justify-center gap-2"
            style={{ animation: 'd1-rise 700ms cubic-bezier(0.16,1,0.3,1) 240ms both' }}
          >
            {t.suggestions.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setValue(s);
                  textareaRef.current?.focus();
                }}
                className="rounded-full border bg-transparent px-4 py-2 text-[13.5px] transition-all duration-200 hover:bg-white"
                style={{ borderColor: tokens.borderStrong, color: tokens.textDim, fontFamily: fontStack }}
              >
                {s}
              </button>
            ))}
          </div>

          <div
            className="absolute bottom-5 left-1/2 -translate-x-1/2 text-xs"
            style={{ color: tokens.textFaint }}
          >
            {t.footer}
          </div>
        </div>
      )}

      {/* Scroll-to-bottom button */}
      {hasMessages && !isAtBottom && (
        <button
          onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })}
          className="absolute bottom-[148px] right-6 z-10 flex h-8 w-8 items-center justify-center rounded-full border bg-white shadow-[0_4px_12px_rgba(0,0,0,0.1)] transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.15)]"
          style={{ borderColor: tokens.borderStrong }}
          aria-label={lang === 'ko' ? '맨 아래로' : 'Scroll to bottom'}
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ color: tokens.textDim }}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      )}

      {/* Sticky bottom input (only when messages exist) */}
      {hasMessages && (
        <div className="absolute bottom-0 left-0 right-0 pb-6" style={{
          background: `linear-gradient(to bottom, transparent, ${tokens.bg} 40%)`,
        }}>
          <div className="mx-auto w-full max-w-[760px] px-8">
            <D1InputBar
              value={value}
              onChange={setValue}
              onSend={handleSend}
              onStop={handleStop}
              onKeyDown={handleKeyDown}
              textareaRef={textareaRef}
              canSend={canSend}
              isStreaming={isStreaming}
              placeholder={t.placeholderActive}
              attachLabel={t.attachFile}
              sendLabel={t.send}
              floating
            />
          </div>
        </div>
      )}

      {/* Trial modals */}
      {showTrialExhausted && (
        <D1TrialExhaustedModal
          lang={lang}
          onOpenOnboarding={() => window.dispatchEvent(new CustomEvent('d1:open-onboarding'))}
          onClose={() => setShowTrialExhausted(false)}
        />
      )}
      {showKeyRequired && (
        <D1KeyRequiredModal
          lang={lang}
          providerName={showKeyRequired.providerName}
          onSwitchToGemini={() => setCurrentModel('gemini-2.0-flash')}
          onOpenOnboarding={() => window.dispatchEvent(new CustomEvent('d1:open-onboarding'))}
          onClose={() => setShowKeyRequired(null)}
        />
      )}

      {/* Global styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes d1-rise {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes d1-cursor {
          0%, 49%   { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        .d1-cursor {
          display: inline-block;
          width: 2px; height: 1em;
          background: ${tokens.accent};
          margin-left: 2px;
          vertical-align: text-bottom;
          animation: d1-cursor 1s steps(2) infinite;
        }
        .d1-prose { color: ${tokens.text}; line-height: 1.75; font-size: 15.5px; letter-spacing: -0.005em; }
        .d1-prose p { margin: 0 0 1em 0; }
        .d1-prose p:last-child { margin-bottom: 0; }
        .d1-prose h1,.d1-prose h2,.d1-prose h3 { font-weight:600; margin:1.5em 0 0.5em; letter-spacing:-0.02em; }
        .d1-prose h1 { font-size:1.5em; }
        .d1-prose h2 { font-size:1.25em; }
        .d1-prose h3 { font-size:1.1em; }
        .d1-prose ul,.d1-prose ol { margin:0 0 1em 0; padding-left:1.5em; }
        .d1-prose li { margin:0.25em 0; }
        .d1-prose a { color:${tokens.accent}; text-decoration:underline; text-underline-offset:2px; }
        .d1-prose code:not(pre code) {
          background:${tokens.surfaceAlt}; padding:2px 6px; border-radius:4px;
          font-size:0.9em; font-family:ui-monospace,"SF Mono",Menlo,Monaco,monospace;
        }
        .d1-prose blockquote {
          border-left:2px solid ${tokens.borderStrong}; padding-left:1em;
          margin:1em 0; color:${tokens.textDim};
        }
        .d1-prose table { border-collapse:collapse; margin:1em 0; }
        .d1-prose th,.d1-prose td { border:1px solid ${tokens.border}; padding:6px 10px; }
        .d1-prose th { background:${tokens.surfaceAlt}; font-weight:600; }
      `}} />
    </div>
  );
}

// ============================================================
// Message row
// ============================================================
type CopyObj = {
  emptyTitle: string; emptyTitleAccent: string; emptyTitleEnd: string;
  emptySubtitle: string; placeholder: string; placeholderActive: string;
  suggestions: readonly string[];
  modelAuto: string; modelAutoDesc: string; footer: string;
  copy: string; copied: string; regenerate: string; noApiKey: string;
  history: string; share: string; attachFile: string; voiceInput: string; send: string;
};

function D1MessageRow({ message, lang, t }: { message: Message; lang: Lang; t: CopyObj }) {
  if (message.role === 'user') {
    return <D1UserMessage content={message.content} lang={lang} />;
  }
  return <D1AssistantMessage content={message.content} modelUsed={message.modelUsed} lang={lang} t={t} />;
}

function D1UserMessage({ content, lang }: { content: string; lang: Lang }) {
  const fontStack = lang === 'ko'
    ? '"Pretendard Variable", Pretendard, sans-serif'
    : '"Geist", sans-serif';
  return (
    <div className="mb-8 flex justify-end">
      <div
        className="max-w-[80%] rounded-[18px] px-5 py-3 text-[15.5px] leading-[1.6] tracking-[-0.005em]"
        style={{
          background: tokens.accentSoft,
          color: tokens.text,
          fontFamily: fontStack,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {content}
      </div>
    </div>
  );
}

function D1AssistantMessage({
  content,
  streaming = false,
  modelUsed,
  lang,
  t,
}: {
  content: string;
  streaming?: boolean;
  modelUsed?: string;
  lang: Lang;
  t: CopyObj;
}) {
  const [copied, setCopied] = useState(false);
  const modelInfo = MODELS.find((m) => m.id === modelUsed || m.apiModel === modelUsed);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="group mb-10 flex gap-4">
      {/* Avatar */}
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center"
        style={{
          fontFamily: '"Instrument Serif", Georgia, serif',
          fontSize: 22,
          color: modelInfo ? BRAND_COLORS[modelInfo.brand] ?? tokens.accent : tokens.accent,
          lineHeight: 1,
        }}
      >
        B
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="d1-prose min-w-0">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              pre: ({ children }) => <>{children}</>,
              code: CodeRenderer as React.ComponentType<React.ComponentPropsWithoutRef<'code'> & { inline?: boolean }>,
            }}
          >
            {content}
          </ReactMarkdown>
          {streaming && <span className="d1-cursor" />}
        </div>

        {!streaming && (
          <div className="mt-3 flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] transition-colors hover:bg-black/5"
              style={{ color: tokens.textDim }}
              title={t.copy}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? t.copied : t.copy}
            </button>
            <button
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] transition-colors hover:bg-black/5"
              style={{ color: tokens.textDim }}
              title={t.regenerate}
            >
              <RefreshIcon />
              {t.regenerate}
            </button>
            {modelInfo && (
              <span className="ml-2 text-[11px]" style={{ color: tokens.textFaint }}>
                {modelInfo.name}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Code block renderer
// ============================================================
function CodeRenderer({
  inline,
  className,
  children,
  ...props
}: {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const match = /language-(\w+)/.exec(className ?? '');
  const lang = match?.[1];
  const code = String(children ?? '').replace(/\n$/, '');
  const [copied, setCopied] = useState(false);

  const highlighted = useMemo(() => {
    if (inline || !code) return null;
    try {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
      }
      return hljs.highlightAuto(code).value;
    } catch {
      return null;
    }
  }, [code, lang, inline]);

  if (inline) {
    return <code className={className} {...props}>{children}</code>;
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="group/code relative my-4 overflow-hidden rounded-[12px]" style={{ background: tokens.surfaceAlt }}>
      <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: `1px solid ${tokens.border}` }}>
        <span className="text-[11px] uppercase tracking-[0.08em]" style={{ color: tokens.textFaint, fontFamily: 'ui-monospace,"SF Mono",monospace' }}>
          {lang ?? 'text'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] opacity-0 transition-opacity group-hover/code:opacity-100"
          style={{ color: tokens.textDim }}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-[13.5px] leading-[1.6]" style={{ margin: 0, fontFamily: 'ui-monospace,"SF Mono",Menlo,Monaco,monospace' }}>
        {highlighted ? (
          <code dangerouslySetInnerHTML={{ __html: highlighted }} />
        ) : (
          <code>{code}</code>
        )}
      </pre>
    </div>
  );
}

// ============================================================
// Input bar
// ============================================================
function D1InputBar({
  value,
  onChange,
  onSend,
  onStop,
  onKeyDown,
  textareaRef,
  canSend,
  isStreaming,
  placeholder,
  attachLabel,
  sendLabel,
  floating,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  canSend: boolean;
  isStreaming: boolean;
  placeholder: string;
  attachLabel: string;
  sendLabel: string;
  floating: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleAttachClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      onChange(value ? `${value}\n[첨부: ${file.name}]` : `[첨부: ${file.name}]`);
      e.target.value = '';
    }
  }

  return (
    <div
      className="w-full max-w-[720px] rounded-[20px] border bg-white px-[18px] pt-4 pb-3 transition-[border-color,box-shadow] duration-200 focus-within:shadow-[0_12px_40px_rgba(0,0,0,0.08)]"
      style={{
        borderColor: tokens.borderStrong,
        boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
        animation: floating ? 'none' : 'd1-rise 700ms cubic-bezier(0.16,1,0.3,1) 120ms both',
        margin: floating ? '0 auto' : undefined,
      }}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
        accept="image/*,.pdf,.txt,.md,.csv,.json,.docx,.xlsx"
      />
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={1}
        className="w-full resize-none border-none bg-transparent text-base leading-[1.5] tracking-[-0.01em] outline-none placeholder:text-[--d1-placeholder]"
        style={{ color: tokens.text, minHeight: 28, maxHeight: 200, '--d1-placeholder': tokens.textFaint } as React.CSSProperties}
      />
      <div className="mt-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <D1IconButton title={attachLabel} onClick={handleAttachClick}>
            <AttachIcon />
          </D1IconButton>
        </div>
        <button
          onClick={isStreaming ? onStop : onSend}
          disabled={!isStreaming && !canSend}
          className="flex h-[34px] w-[34px] items-center justify-center rounded-full border-none transition-[transform,background] duration-150 hover:-translate-y-px disabled:cursor-not-allowed disabled:translate-y-0"
          style={{
            background: isStreaming ? tokens.accent : canSend ? tokens.text : tokens.borderStrong,
            color: isStreaming || canSend ? tokens.bg : tokens.textFaint,
          }}
          title={sendLabel}
        >
          {isStreaming ? <StopIcon /> : <SendIcon />}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Model dropdown
// ============================================================
function D1ModelDropdown({
  lang,
  currentModel,
  onSelect,
}: {
  lang: Lang;
  currentModel: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      id="d1-model-dropdown"
      className="absolute left-8 top-[52px] z-50 w-[340px] overflow-hidden rounded-[16px] border"
      style={{
        background: 'rgba(255,255,255,0.82)',
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        borderColor: tokens.borderStrong,
        boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
        animation: 'd1-rise 200ms cubic-bezier(0.16,1,0.3,1) both',
      }}
    >
      <div className="py-1.5">
        {MODELS.map((m) => {
          const selected = m.id === currentModel;
          const desc = lang === 'ko' ? m.desc_ko : m.desc_en;
          return (
            <button
              key={m.id}
              onClick={() => onSelect(m.id)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-black/5"
            >
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{ background: BRAND_COLORS[m.brand] ?? tokens.accent }}
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-medium" style={{ color: tokens.text }}>{m.name}</span>
                  {selected && <CheckIcon />}
                </div>
                <span className="mt-0.5 text-[12px]" style={{ color: tokens.textDim }}>{desc}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Small UI primitives
// ============================================================
function D1IconButton({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-9 w-9 items-center justify-center rounded-lg border-none bg-transparent transition-colors duration-150 hover:bg-black/5"
      style={{ color: tokens.textDim }}
    >
      {children}
    </button>
  );
}

// ============================================================
// API Key Onboarding
// ============================================================
const ONBOARD_PROVIDERS = [
  { id: 'openai'    as AIProvider, name: 'OpenAI',    color: '#10a37f', placeholder: 'sk-...',      hint_ko: 'GPT-4o, GPT-4.1',        hint_en: 'GPT-4o, GPT-4.1' },
  { id: 'anthropic' as AIProvider, name: 'Anthropic', color: '#d97757', placeholder: 'sk-ant-...', hint_ko: 'Claude Opus 4, Sonnet 4', hint_en: 'Claude Opus 4, Sonnet 4' },
  { id: 'google'    as AIProvider, name: 'Google',    color: '#4285f4', placeholder: 'AIza...',     hint_ko: 'Gemini 1.5 Flash (무료)', hint_en: 'Gemini 1.5 Flash (free)' },
  { id: 'groq'      as AIProvider, name: 'Groq',      color: '#f55036', placeholder: 'gsk_...',     hint_ko: 'Llama 3 (무료)',          hint_en: 'Llama 3 (free)' },
  { id: 'deepseek'  as AIProvider, name: 'DeepSeek',  color: '#4B5EFC', placeholder: 'sk-...',      hint_ko: 'DeepSeek-V3',            hint_en: 'DeepSeek-V3' },
] as const;

function D1KeyOnboarding({ lang }: { lang: Lang }) {
  const { setKey } = useAPIKeyStore();
  const [selected, setSelected] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const provider = ONBOARD_PROVIDERS.find(p => p.id === selected);

  const fontStack = lang === 'ko'
    ? '"Pretendard Variable", Pretendard, -apple-system, system-ui, sans-serif'
    : '"Geist", -apple-system, system-ui, sans-serif';

  const t = {
    title:    lang === 'ko' ? 'API 키 설정'                                         : 'Set up your API key',
    subtitle: lang === 'ko' ? 'AI와 대화하려면 API 키를 먼저 등록해주세요.'              : 'Add an API key from any provider to start chatting.',
    choose:   lang === 'ko' ? 'AI 제공사 선택'                                        : 'Choose a provider',
    inputLabel: (name: string) => lang === 'ko' ? `${name} API 키 입력` : `Enter your ${name} API key`,
    save:     lang === 'ko' ? '저장하고 시작하기'                                      : 'Save and start',
    privacy:  lang === 'ko' ? '키는 브라우저에만 저장됩니다. 서버로 전송되지 않습니다.'   : 'Keys are stored in your browser only — never sent to our servers.',
    back:     lang === 'ko' ? '← 뒤로'                                               : '← Back',
  };

  function handleSave() {
    if (!selected || !keyInput.trim() || !provider) return;
    setKey(provider.id, keyInput.trim());
    setSaved(true);
  }

  useEffect(() => {
    if (selected && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [selected]);

  return (
    <div
      className="flex h-full flex-col items-center justify-center px-8 pb-16"
      style={{ fontFamily: fontStack, background: tokens.bg }}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes d1-rise { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
      `}} />

      {/* Card */}
      <div
        className="w-full max-w-[420px] rounded-[24px] border bg-white px-8 py-10"
        style={{ borderColor: tokens.borderStrong, boxShadow: '0 12px 48px rgba(0,0,0,0.07)', animation: 'd1-rise 600ms cubic-bezier(0.16,1,0.3,1) both' }}
      >
        {/* Key icon */}
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-[14px]" style={{ background: tokens.accentSoft }}>
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={tokens.accent} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
          </svg>
        </div>

        <h2 className="mb-1.5 text-[22px] font-semibold tracking-[-0.03em]" style={{ color: tokens.text }}>
          {t.title}
        </h2>
        <p className="mb-7 text-[14px] leading-[1.55]" style={{ color: tokens.textDim }}>
          {t.subtitle}
        </p>

        {!selected ? (
          /* Provider list */
          <div className="flex flex-col gap-2">
            <p className="mb-1 text-[11.5px] font-medium uppercase tracking-[0.07em]" style={{ color: tokens.textFaint }}>
              {t.choose}
            </p>
            {ONBOARD_PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => { setSelected(p.id); setKeyInput(''); }}
                className="flex items-center gap-3 rounded-[12px] border px-4 py-3 text-left transition-all duration-150 hover:bg-black/[0.025]"
                style={{ borderColor: tokens.borderStrong }}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
                <span className="flex-1 text-[14px] font-medium" style={{ color: tokens.text }}>{p.name}</span>
                <span className="text-[12px]" style={{ color: tokens.textFaint }}>
                  {lang === 'ko' ? p.hint_ko : p.hint_en}
                </span>
              </button>
            ))}
          </div>
        ) : (
          /* Key input */
          <div style={{ animation: 'd1-rise 250ms cubic-bezier(0.16,1,0.3,1) both' }}>
            <button
              onClick={() => { setSelected(null); setKeyInput(''); setSaved(false); }}
              className="mb-4 text-[13px] transition-colors hover:opacity-60"
              style={{ color: tokens.textDim }}
            >
              {t.back}
            </button>

            <div className="mb-3 flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: provider?.color ?? tokens.accent }} />
              <span className="text-[15px] font-semibold" style={{ color: tokens.text }}>{provider?.name}</span>
            </div>

            <label className="mb-1.5 block text-[12px]" style={{ color: tokens.textDim }}>
              {provider ? t.inputLabel(provider.name) : ''}
            </label>
            <input
              ref={inputRef}
              type="password"
              value={keyInput}
              onChange={e => { setKeyInput(e.target.value); setSaved(false); }}
              placeholder={provider?.placeholder ?? ''}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              className="mb-4 w-full rounded-[10px] border px-4 py-3 text-[14px] font-mono outline-none transition-[border-color,box-shadow] focus:border-transparent focus:shadow-[0_0_0_2px_rgba(198,90,60,0.25)]"
              style={{ borderColor: tokens.borderStrong, color: tokens.text, background: tokens.surfaceAlt }}
            />

            <button
              onClick={handleSave}
              disabled={!keyInput.trim() || saved}
              className="w-full rounded-[12px] py-3 text-[14px] font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: saved ? '#22c55e' : tokens.accent, color: '#fff' }}
            >
              {saved ? (lang === 'ko' ? '저장됨 ✓' : 'Saved ✓') : t.save}
            </button>
          </div>
        )}
      </div>

      {/* Privacy note */}
      <p className="mt-6 max-w-[360px] text-center text-[12px] leading-[1.6]" style={{ color: tokens.textFaint }}>
        {t.privacy}
      </p>
    </div>
  );
}

// ============================================================
// Icons
// ============================================================
const iconProps = {
  width: 18, height: 18, viewBox: '0 0 24 24',
  fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function ChevronIcon()  { return <svg {...iconProps} width={14} height={14}><path d="m6 9 6 6 6-6" /></svg>; }
function HistoryIcon()  { return <svg {...iconProps}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" /></svg>; }
function ShareIcon()    { return <svg {...iconProps}><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><path d="m16 6-4-4-4 4" /><path d="M12 2v13" /></svg>; }
function AttachIcon()   { return <svg {...iconProps}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 17.93 8.8l-8.58 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>; }
function MicIcon()      { return <svg {...iconProps}><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" /></svg>; }
function SendIcon()     { return <svg {...iconProps}><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></svg>; }
function StopIcon()     { return <svg {...iconProps}><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" /></svg>; }
function CopyIcon()     { return <svg {...iconProps} width={13} height={13}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>; }
function CheckIcon()    { return <svg {...iconProps} width={13} height={13} style={{ color: tokens.accent }}><path d="M20 6 9 17l-5-5" /></svg>; }
function RefreshIcon()  { return <svg {...iconProps} width={13} height={13}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M3 21v-5h5" /></svg>; }
