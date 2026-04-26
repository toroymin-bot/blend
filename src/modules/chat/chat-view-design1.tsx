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
import { AVAILABLE_MODELS, getFeaturedModels, FEATURED_PROVIDER_ORDER, PROVIDER_LABELS, type ProviderId } from '@/data/available-models';
import { trackEvent } from '@/lib/analytics';
import { useD1ChatStore, type D1Chat, type D1Message } from '@/stores/d1-chat-store';
import { D1HistoryOverlay, type ChatSummary } from '@/modules/chat/history-overlay-design1';
import { D1ExportDropdown } from '@/modules/chat/export-dropdown-design1';
// [2026-04-26] Sprint 3 (16384367) — Share Links
import { ShareModal } from '@/components/share-modal';
import type { ShareMessage } from '@/lib/share-encoder';
import { exportD1Chat, type D1ExportFormat } from '@/modules/chat/export-utils-design1';
// v3 회귀 복구 (Tori P0.2-0.5): 음성 / 이미지 / 비전 / 웹검색
import { VoiceButton } from '@/modules/chat/voice-button';
import { sttOpenAI } from '@/lib/voice-chat';
import { generateImage, extractImagePrompt } from '@/modules/plugins/image-gen';
import { performWebSearch, extractSearchQuery, formatSearchResultsAsContext } from '@/modules/plugins/web-search';
// P3.3 — RAG (활성 문서 컨텍스트) + CitationBlock
import { useDocumentStore } from '@/stores/document-store';
import { buildContext } from '@/modules/plugins/document-plugin';
// Tori 통합 RAG — 활성 소스 칩 바
import { ActiveSourcesBar } from '@/modules/chat/active-sources-bar';

// ============================================================
// Design tokens (same as Phase 1)
// ============================================================
const tokens = {
  bg: 'var(--d1-bg)',
  surface: 'var(--d1-surface)',
  surfaceAlt: 'var(--d1-surface-alt)',
  text: 'var(--d1-text)',
  textDim: 'var(--d1-text-dim)',
  textFaint: 'var(--d1-text-faint)',
  accent: 'var(--d1-accent)',
  accentSoft: 'var(--d1-accent-soft)',
  border: 'var(--d1-border)',
  borderStrong: 'var(--d1-border-strong)',
} as const;

// ============================================================
// i18n
// ============================================================
const copy = {
  ko: {
    emptyTitle: '',
    emptyTitleAccent: 'AI들에게',
    emptyTitleEnd: '묻고, 문서를 찾고, 회의를 정리하세요.',
    emptySubtitle: '하나로, 더 싸게, 더 스마트하게.',
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
    tryAnother: '다른 AI로',
    comingSoon: '곧 지원됩니다',
  },
  en: {
    emptyTitle: 'Ask',
    emptyTitleAccent: 'multiple AIs,',
    emptyTitleEnd: 'search documents, summarize meetings.',
    emptySubtitle: 'One AI app — cheaper and smarter.',
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
    tryAnother: 'Try another AI',
    comingSoon: 'Coming soon',
  },
} as const;

type Lang = keyof typeof copy;

// ============================================================
// Suggestions with recommended models
// ============================================================
// IMP-025: SUGGESTIONS suggestedModel을 카탈로그 기반으로 동적 선택.
// cron 갱신 시 신규 모델이 자동 매핑되도록.
//
// [2026-04-26 QA-BUG #1] candidates를 featured만으로 한정.
// 이전엔 AVAILABLE_MODELS 전체에서 골라 chat-view의 MODELS(=AUTO+featured)에
// 없는 id가 반환되면 모델 chip이 'modelAuto' fallback으로 표시되던 회귀.
function pickSuggestedModel(category: 'small' | 'vision' | 'coding' | 'long'): string {
  const featured = getFeaturedModels();
  const featuredIds = new Set(featured.map((m) => m.id));
  const candidates = AVAILABLE_MODELS.filter((m) => !m.deprecated && featuredIds.has(m.id));
  const score = (m: typeof candidates[number]): number => {
    const id = m.id.toLowerCase();
    let s = 0;
    switch (category) {
      case 'small':
        if (m.tier === 'fast') s += 10;
        if (/mini|haiku|flash|lite/.test(id)) s += 8;
        break;
      case 'vision':
        if (!m.supportsVision) return -1;
        if (m.provider === 'google') s += 5;
        if (id.includes('pro')) s += 3;
        break;
      case 'coding':
        if (m.provider === 'anthropic' && id.includes('sonnet')) s += 10;
        if (id.includes('opus') || id.includes('gpt-4')) s += 6;
        if (m.tier === 'flagship' || m.tier === 'balanced') s += 2;
        break;
      case 'long':
        if ((m.contextWindow ?? 0) >= 200_000) s += 5;
        if (m.provider === 'anthropic' && id.includes('sonnet')) s += 4;
        if (m.provider === 'google' && id.includes('pro')) s += 3;
        break;
    }
    return s;
  };
  const ranked = candidates.map((m) => ({ m, s: score(m) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  return ranked[0]?.m.id ?? 'gpt-4o-mini';
}

// [2026-04-26] Sprint 2 (16384367 §3.2) — 6 카드로 확장 + 툴팁 + routeOverride
const SUGGESTIONS_WITH_MODEL = [
  { id: 'email',   ko: '이메일 초안 써줘',    en: 'Draft an email',          suggestedModel: pickSuggestedModel('small'),
    icon: '✉️', tooltipKo: 'GPT-4o mini가 가장 빠르고 저렴해요',  tooltipEn: 'GPT-4o mini is fastest and cheapest' },
  { id: 'image',   ko: '이 이미지 분석해줘',  en: 'Analyze this image',      suggestedModel: pickSuggestedModel('vision'),
    icon: '🖼️', tooltipKo: 'Gemini가 이미지 이해를 가장 잘해요',   tooltipEn: 'Gemini understands images best' },
  { id: 'code',    ko: '코드 리뷰 해줘',      en: 'Review my code',          suggestedModel: pickSuggestedModel('coding'),
    icon: '💻', tooltipKo: 'Claude가 코드 분석에 강해요',          tooltipEn: 'Claude excels at code analysis' },
  { id: 'summary', ko: '긴 글 요약해줘',      en: 'Summarize a long text',   suggestedModel: pickSuggestedModel('long'),
    icon: '📝', tooltipKo: 'Claude가 긴 문맥을 잘 다뤄요',         tooltipEn: 'Claude handles long context well' },
  { id: 'youtube', ko: 'YouTube 영상 분석',   en: 'Analyze YouTube video',   suggestedModel: pickSuggestedModel('vision'),
    icon: '🎥', tooltipKo: 'Gemini가 영상 이해 가능해요',          tooltipEn: 'Gemini can understand videos' },
  { id: 'meeting', ko: '회의 녹음 정리',      en: 'Summarize a meeting',     suggestedModel: '',
    icon: '🎙️', routeOverride: 'meeting',
    tooltipKo: '전용 회의 분석 페이지로 이동',                     tooltipEn: 'Goes to dedicated meeting page' },
] as const;

// ============================================================
// Formatting utilities
// ============================================================
function formatKRW(usd: number | undefined, lang: 'ko' | 'en'): string {
  if (usd === undefined || usd === 0) return '';
  if (lang === 'en') return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(3)}`;
  const krw = Math.round(usd * 1370);
  if (krw < 1) return '<₩1';
  return `₩${krw}`;
}

function formatTokens(count: number | undefined, lang: 'ko' | 'en'): string {
  if (count === undefined || count === 0) return '';
  if (count >= 1000) return lang === 'ko' ? `${(count / 1000).toFixed(1)}K토큰` : `${(count / 1000).toFixed(1)}K tokens`;
  return lang === 'ko' ? `${count}토큰` : `${count} tokens`;
}

// ============================================================
// Model registry — built from live available-models.generated.json
// ============================================================
type ModelEntry = {
  id: string;
  name: string;
  brand: string;
  provider: AIProvider;
  apiModel: string;
  desc_ko: string;
  desc_en: string;
};

// Auto entry (special, not in registry)
const AUTO_ENTRY: ModelEntry = {
  id: 'auto',
  name: 'Auto',
  brand: 'blend',
  provider: 'openai',
  apiModel: 'gpt-4o-mini',
  desc_ko: '질문에 가장 적합한 AI를 자동 선택',
  desc_en: 'Picks the best AI for each question',
};

// Built once at module load from registry
const MODELS: ModelEntry[] = [
  AUTO_ENTRY,
  ...getFeaturedModels().map((m): ModelEntry => ({
    id: m.id,
    name: m.displayName,
    brand: m.provider,
    provider: m.provider as AIProvider,
    apiModel: m.id, // in registry, id IS the API model ID
    desc_ko: m.description_ko,
    desc_en: m.description_en,
  })),
];

const BRAND_COLORS: Record<string, string> = {
  blend:     '#c65a3c',
  openai:    '#10a37f',
  anthropic: '#d97757',
  google:    '#4285f4',
  deepseek:  '#4B5EFC',
  groq:      '#f55036',
};

// v3 P0.4 — 큰 이미지 base64를 캔버스로 리사이즈/JPEG 변환 (1MB 이상이면 전송량 ↓)
async function compressDataUrl(dataUrl: string, maxSide: number, quality: number): Promise<string> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('image decode failed'));
      i.src = dataUrl;
    });
    const ratio = Math.min(1, maxSide / Math.max(img.width, img.height));
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return dataUrl;
  }
}

// ============================================================
// Message shape (local — design1 isolated from main chat-store)
// ============================================================
type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  modelUsed?: string;
  totalTokens?: number;
  cost?: number;
  // v3 회귀 복구 (Tori P0.4): 비전 첨부 이미지 (base64 data URL 배열)
  images?: string[];
  // P3.3 — 인용 출처 (RAG 컨텍스트로 사용된 문서 파일명 배열)
  sources?: string[];
};

// ============================================================
// Main component
// ============================================================
export default function D1ChatView({
  lang,
  onConversationStart,
  initialModel,
}: {
  lang: 'ko' | 'en';
  onConversationStart?: (title: string) => void;
  initialModel?: string;
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
  const [currentModel, setCurrentModel] = useState(initialModel ?? 'auto');
  const abortRef = useRef<AbortController | null>(null);
  const nextModelOverrideRef = useRef<string | null>(null);

  const t = copy[lang] ?? copy.en;
  const hasMessages = messages.length > 0 || isStreaming;
  const hasAnyKey = (['openai', 'anthropic', 'google', 'deepseek', 'groq'] as AIProvider[]).some(p => hasKey(p));

  const [value, setValue] = useState('');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [isModelChanging, setIsModelChanging] = useState(false);
  const [inputGlowing, setInputGlowing] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  // v3 회귀 복구 (P0.4 비전): 첨부 이미지 base64 data URL 배열
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  // P3.3 + Tori 통합 RAG — race-safe 활성 문서 로딩 보장
  const getActiveDocs = useDocumentStore((s) => s.getActiveDocs);
  const docsEnsureLoaded = useDocumentStore((s) => s.ensureLoaded);
  useEffect(() => { docsEnsureLoaded(); }, [docsEnsureLoaded]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const modelChipRef = useRef<HTMLButtonElement>(null);
  const prevModelRef = useRef(currentModel);

  // isMobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check, { passive: true });
    return () => window.removeEventListener('resize', check);
  }, []);

  // Tori P1.1: PromptsView에서 "사용" 클릭 시 d1:prompt-content 이벤트로 input 채우기
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === 'string' && detail) {
        setValue(detail);
        textareaRef.current?.focus();
      }
    };
    window.addEventListener('d1:prompt-content', handler as EventListener);
    return () => window.removeEventListener('d1:prompt-content', handler as EventListener);
  }, []);

  // Model chip pulse animation on change
  useEffect(() => {
    if (prevModelRef.current === currentModel) return;
    prevModelRef.current = currentModel;
    setIsModelChanging(true);
    const t = setTimeout(() => setIsModelChanging(false), 500);
    // Phase 5.0 Analytics
    if (currentModel && currentModel !== 'auto') {
      const m = AVAILABLE_MODELS.find((x) => x.id === currentModel);
      trackEvent('model_select', { provider: m?.provider ?? 'unknown', model: currentModel });
    }
    return () => clearTimeout(t);
  }, [currentModel]);

  // [2026-04-26] Sprint 2 — 첫 클릭 hint 1회 표시 (localStorage)
  const [firstClickHintShown, setFirstClickHintShown] = useState(false);

  function handleSuggestionClick(s: (typeof SUGGESTIONS_WITH_MODEL)[number]) {
    trackEvent('suggestion_clicked', { model: s.suggestedModel, label: s.ko });

    // [2026-04-26] 카드 6 (회의 녹음): 채팅 대신 Meeting 페이지로 이동
    const route = (s as { routeOverride?: string }).routeOverride;
    if (route === 'meeting') {
      window.dispatchEvent(new CustomEvent('d1:nav-to', { detail: { view: 'meeting' } }));
      return;
    }

    const prompt = lang === 'ko' ? s.ko : s.en;
    if (s.suggestedModel) setCurrentModel(s.suggestedModel);
    setTimeout(() => {
      setValue(prompt);
      textareaRef.current?.focus();
    }, 200);
    setInputGlowing(true);
    setTimeout(() => setInputGlowing(false), 800);

    // [2026-04-26] 첫 클릭 hint (1회만)
    try {
      if (typeof window !== 'undefined' && !localStorage.getItem('blend:first-click-shown')) {
        setFirstClickHintShown(true);
        localStorage.setItem('blend:first-click-shown', 'true');
        setTimeout(() => setFirstClickHintShown(false), 3000);
      }
    } catch {}
  }

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2000);
  }

  // ── Persistence / history ─────────────────────────────────────
  const d1Chats        = useD1ChatStore((s) => s.chats);
  const d1Loaded       = useD1ChatStore((s) => s.loaded);
  const d1Load         = useD1ChatStore((s) => s.loadFromStorage);
  const d1Upsert       = useD1ChatStore((s) => s.upsertChat);
  const d1Delete       = useD1ChatStore((s) => s.deleteChat);
  const d1DeriveTitle  = useD1ChatStore((s) => s.deriveTitle);

  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chatCreatedAt, setChatCreatedAt] = useState<number>(() => Date.now());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  // [2026-04-26] Sprint 3 (16384367) — Share modal
  const [shareOpen, setShareOpen] = useState(false);
  const shareMessages: ShareMessage[] = useMemo(() =>
    messages.map((m) => ({ role: m.role, content: m.content, model: m.modelUsed })),
    [messages]);

  useEffect(() => { d1Load(); }, [d1Load]);

  // Save whenever messages change (if we have any messages)
  useEffect(() => {
    if (!d1Loaded) return;
    if (messages.length === 0) return;
    const id = activeChatId ?? `d1_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    if (!activeChatId) setActiveChatId(id);
    const now = Date.now();
    const persisted: D1Chat = {
      id,
      title: d1DeriveTitle(messages as D1Message[]) || '',
      messages: messages.map<D1Message>((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        modelUsed: m.modelUsed,
        createdAt: now,
      })),
      model: currentModel,
      createdAt: activeChatId ? chatCreatedAt : now,
      updatedAt: now,
    };
    if (!activeChatId) setChatCreatedAt(now);
    d1Upsert(persisted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, d1Loaded]);

  // Cmd/Ctrl+K → open history
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setHistoryOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Build chat summaries for the overlay
  const chatSummaries = useMemo<ChatSummary[]>(() => {
    return d1Chats.map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updatedAt,
      messageCount: c.messages.length,
      model: c.model,
      preview: c.messages[c.messages.length - 1]?.content?.slice(0, 120),
      allText: c.messages.map((m) => m.content).join(' '),
      pinned: c.pinned,
      tags: c.tags,
    }));
  }, [d1Chats]);

  // [2026-04-26] BUG-FIX (16417011) — 사이드바 '최근' 클릭 시 외부 dispatch listener
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      if (id) loadChat(id);
    };
    window.addEventListener('d1:load-chat', handler as EventListener);
    return () => window.removeEventListener('d1:load-chat', handler as EventListener);
    // loadChat은 이 컴포넌트 안에서 정의된 함수 — deps 비움
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load a chat from history
  const loadChat = (chatId: string) => {
    const chat = useD1ChatStore.getState().getChat(chatId);
    if (!chat) return;
    setActiveChatId(chat.id);
    setChatCreatedAt(chat.createdAt);
    setCurrentModel(chat.model || 'auto');
    setMessages(chat.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      modelUsed: m.modelUsed,
    })));
  };

  // Export current chat
  const handleExport = (format: D1ExportFormat) => {
    if (messages.length === 0) return;
    const now = Date.now();
    const id = activeChatId ?? 'd1_unsaved';
    const chat: D1Chat = {
      id,
      title: d1DeriveTitle(messages as D1Message[]) || (lang === 'ko' ? 'Blend 대화' : 'Blend Chat'),
      messages: messages.map<D1Message>((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        modelUsed: m.modelUsed,
        createdAt: now,
      })),
      model: currentModel,
      createdAt: chatCreatedAt,
      updatedAt: now,
    };
    exportD1Chat(chat, format);
  };

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

  const canSend = (value.trim().length > 0 || attachedImages.length > 0) && !isStreaming;

  // v3 P0.4: 이미지 → base64 + 압축 (1MB 이상이면 JPEG 80% 리사이즈)
  async function handleImagesAttached(files: File[]) {
    const next: string[] = [];
    for (const f of files) {
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('read failed'));
          reader.readAsDataURL(f);
        });
        // 큰 파일은 캔버스로 리사이즈 (max 1600px, JPEG 80%)
        if (f.size > 800_000) {
          const compressed = await compressDataUrl(dataUrl, 1600, 0.8);
          next.push(compressed);
        } else {
          next.push(dataUrl);
        }
      } catch {
        // 무시 — 다른 파일은 계속
      }
    }
    if (next.length) setAttachedImages((prev) => [...prev, ...next].slice(0, 6));
  }

  function handleRemoveImage(idx: number) {
    setAttachedImages((prev) => prev.filter((_, i) => i !== idx));
  }

  // v3 P0.2: Web Speech 미지원 브라우저 fallback — Whisper STT
  async function handleVoiceFallbackRecorded(blob: Blob) {
    const openaiKey = getKey('openai') || '';
    if (!openaiKey) {
      setToastMsg(t.noApiKey);
      return;
    }
    try {
      const sttLang = lang === 'ko' ? 'ko-KR' : 'en-US';
      const text = await sttOpenAI(blob, openaiKey, sttLang);
      if (text.trim()) setValue((v) => (v ? v + ' ' + text : text));
    } catch {
      setToastMsg('STT failed');
    }
  }

  // P3.2 — 자동 제목 생성: 첫 응답 후 LLM에 짧은 제목 1회 요청 → window 이벤트로 부모에 전달
  function triggerAutoTitle(userContent: string, assistantContent: string) {
    if (typeof window === 'undefined') return;
    // 사용 가능한 BYOK 또는 trial fallback 결정
    const FALLBACK_ORDER: Array<{ provider: AIProvider; apiModel: string }> = [
      { provider: 'openai',    apiModel: 'gpt-4o-mini' },
      { provider: 'anthropic', apiModel: 'claude-3-5-haiku-20241022' },
      { provider: 'google',    apiModel: 'gemini-1.5-flash' },
      { provider: 'deepseek',  apiModel: 'deepseek-chat' },
      { provider: 'groq',      apiModel: 'llama3-70b-8192' },
    ];
    const avail = FALLBACK_ORDER.find((p) => hasKey(p.provider));
    const sysPrompt = lang === 'ko'
      ? '대화의 주제를 4-6단어 한국어로 요약하라. 제목만 반환. 따옴표·마침표 금지.'
      : 'Summarize this conversation in 4-6 English words. Return ONLY the title. No quotes or punctuation.';
    const userPayload = `User: ${userContent.slice(0, 400)}\n\nAssistant: ${assistantContent.slice(0, 400)}`;

    const onTitle = (raw: string) => {
      const title = raw.replace(/^["'`]|["'`]$/g, '').replace(/[\n\r]+.*/, '').trim().slice(0, 60);
      if (title.length >= 2) {
        window.dispatchEvent(new CustomEvent('d1:chat-retitle', { detail: title }));
      }
    };

    if (avail) {
      sendChatRequest({
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: userPayload },
        ],
        model: avail.apiModel,
        provider: avail.provider,
        apiKey: getKey(avail.provider),
        onDone: (full) => onTitle(full),
        onError: () => { /* ignore — fallback derived title 유지 */ },
      });
    } else if (TRIAL_KEY_AVAILABLE) {
      sendTrialMessage({
        messages: [{ role: 'user', content: `${sysPrompt}\n\n${userPayload}` }],
        onChunk: () => {},
        onDone: (full) => onTitle(full),
        onError: () => {},
      });
    }
  }

  // P3.1 — 메시지 시점에서 분기 (포크)
  function forkChatAtMessage(messageId: string) {
    let srcId = activeChatId;
    if (!srcId) {
      // 미저장 채팅: 즉시 저장 (id 발급) 후 포크
      const id = `d1_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      const now = Date.now();
      const persisted: D1Chat = {
        id,
        title: d1DeriveTitle(messages as D1Message[]) || '',
        messages: messages.map<D1Message>((m) => ({
          id: m.id, role: m.role, content: m.content, modelUsed: m.modelUsed, createdAt: now,
        })),
        model: currentModel,
        createdAt: now,
        updatedAt: now,
      };
      d1Upsert(persisted);
      setActiveChatId(id);
      setChatCreatedAt(now);
      srcId = id;
    }
    const newId = useD1ChatStore.getState().forkChatAt(srcId, messageId);
    if (newId) {
      loadChat(newId);
      showToast(lang === 'ko' ? '새 채팅으로 분기했어요' : 'Forked to a new chat');
    }
  }

  // P3.2 — 응답 재생성: 해당 assistant 메시지를 제거하고 직전 user 메시지로 재호출
  function regenerateAssistantMessage(assistantMsgId: string, newModel?: string) {
    if (isStreaming) return;
    const idx = messages.findIndex((m) => m.id === assistantMsgId);
    if (idx <= 0) return;
    // 직전 user 메시지 찾기
    let userIdx = idx - 1;
    while (userIdx >= 0 && messages[userIdx].role !== 'user') userIdx--;
    if (userIdx < 0) return;
    const userMsg = messages[userIdx];
    // user 메시지까지만 남기고 그 이후 모두 제거
    setMessages(messages.slice(0, userIdx + 1));
    // 다른 모델로 재생성 시 override ref 설정 + UI 칩 업데이트
    if (newModel) {
      nextModelOverrideRef.current = newModel;
      setCurrentModel(newModel);
    }
    setTimeout(() => {
      performSend(userMsg.content, userMsg.images ?? []);
    }, 0);
  }

  function handleSend() {
    if (!canSend) return;
    const content = value.trim();
    const images  = attachedImages;

    // v3 P0.3 — /image 명령: DALL-E 3로 이미지 생성, 응답에 markdown 이미지 인라인
    const imgPrompt = extractImagePrompt(content);
    if (imgPrompt) {
      const openaiKey = getKey('openai') || '';
      if (!openaiKey) {
        setToastMsg(t.noApiKey);
        return;
      }
      setValue('');
      setAttachedImages([]);
      const userMsg: Message = { id: Date.now().toString(), role: 'user', content };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);
      generateImage(imgPrompt, openaiKey)
        .then((res) => {
          setMessages((prev) => [...prev, {
            id: Date.now().toString() + '_img',
            role: 'assistant',
            content: `![${imgPrompt}](${res.url})`,
            modelUsed: 'dall-e-3',
          }]);
        })
        .catch((err) => {
          setMessages((prev) => [...prev, {
            id: Date.now().toString() + '_err',
            role: 'assistant',
            content: `Error: ${err.message ?? err}`,
          }]);
        })
        .finally(() => {
          setIsStreaming(false);
          setStreamingContent('');
        });
      return;
    }

    // v3 P0.5 — 웹검색 명령(`!search ...` 또는 `?...`): 검색 결과를 사용자 메시지에 컨텍스트로 prepend
    const searchQuery = extractSearchQuery(content);
    if (searchQuery) {
      setIsStreaming(true);
      setValue('');
      setAttachedImages([]);
      performWebSearch(searchQuery)
        .then((searchRes) => {
          let augmented = content;
          const results = searchRes.results ?? [];
          if (searchRes.available && results.length > 0) {
            const ctx = formatSearchResultsAsContext(searchQuery, results);
            augmented = `${ctx}\n\n${content}`;
          } else {
            augmented = `${content}\n\n[Web search unavailable: ${searchRes.error || 'no results'}]`;
          }
          setIsStreaming(false);
          performSend(augmented, images);
        })
        .catch(() => {
          setIsStreaming(false);
        });
      return;
    }

    performSend(content, images);
  }

  // ── 핵심 LLM 송신 헬퍼: /image, /search 분기 후 또는 일반 입력에서 호출 ──
  async function performSend(content: string, images: string[]) {
    // Phase 5.0 Analytics — first message ever
    if (messages.length === 0) {
      trackEvent('first_message_sent', { lang });
    }

    // Consume any model override set by "Try another AI" — use ref so it survives the closure
    const effectiveModel = nextModelOverrideRef.current ?? currentModel;
    nextModelOverrideRef.current = null;

    // ── Trial mode gate ──────────────────────────────────────────
    if (isTrialMode) {
      // auto → gemini-2.5-flash (trial route)
      // 명시적으로 유료 모델 선택 시에만 키 요구 모달 표시
      const trialCompatible = effectiveModel === 'auto' || effectiveModel === 'gemini-2.5-flash';
      if (!trialCompatible) {
        const modelDef = MODELS.find(m => m.id === effectiveModel);
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
    setAttachedImages([]);
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content, images: images.length ? images : undefined };
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

    // P3.3 + Tori 핫픽스 — 활성 문서 RAG + 활성 데이터 소스 메타 주입
    let docContext = '';
    let docSources: string[] = [];
    // [2026-04-26 Tori 16384118 §2] syncing/error 헤더용 — try 밖에서 사용 가능하도록 선언
    type SyncEntry = { name: string; percent: number };
    type ErrEntry  = { name: string; error?: string };
    let syncingDocs: SyncEntry[] = [];
    let errorDocs:   ErrEntry[]  = [];
    try {
      // Tori 명세: store 로딩 완료 대기 (race 방지)
      await docsEnsureLoaded();
      const activeDocs = getActiveDocs();
      const docStoreState = (await import('@/stores/document-store')).useDocumentStore.getState();
      syncingDocs = activeDocs
        .filter((d) => docStoreState.embedProgress[d.id]?.status === 'embedding')
        .map((d) => ({ name: d.name, percent: Math.round(docStoreState.embedProgress[d.id]?.percent ?? 0) }));
      errorDocs = activeDocs
        .filter((d) => docStoreState.embedProgress[d.id]?.status === 'error')
        .map((d) => ({ name: d.name, error: docStoreState.embedProgress[d.id]?.error }));
      if (activeDocs.length > 0) {
        const embeddingApiKey = getKey('openai') || getKey('google') || undefined;
        const embeddingProvider: 'openai' | 'google' | undefined = getKey('openai') ? 'openai' : getKey('google') ? 'google' : undefined;
        docContext = await buildContext(content, activeDocs, embeddingApiKey, embeddingProvider);
        if (docContext) {
          const matches = docContext.match(/\[source:\s*([^\]]+)\]/g) ?? [];
          const set = new Set<string>();
          matches.forEach((m) => {
            const v = m.replace(/^\[source:\s*/, '').replace(/\]$/, '').trim();
            if (v) set.add(v);
          });
          docSources = Array.from(set).slice(0, 8);
        }
      }

      // Phase 3b — 활성 회의록 메타 + 본문 주입
      try {
        const raw = localStorage.getItem('d1:meetings');
        if (raw) {
          const meetings = JSON.parse(raw) as Array<{
            id: string; title: string; isActive?: boolean;
            summary?: string[]; actionItems?: { task: string; owner?: string; dueDate?: string }[];
            decisions?: string[]; topics?: string[]; fullSummary?: string;
          }>;
          const activeMeetings = meetings.filter((m) => m.isActive !== false).slice(0, 3);
          if (activeMeetings.length > 0) {
            const meetingBlocks = activeMeetings.map((m) => {
              const lines: string[] = [`[meeting: ${m.title}]`];
              if (m.summary?.length)     lines.push('Summary:\n' + m.summary.map((s) => `- ${s}`).join('\n'));
              if (m.actionItems?.length) lines.push('Action items:\n' + m.actionItems.slice(0, 10).map((a) => `- ${a.owner ? '[' + a.owner + '] ' : ''}${a.task}${a.dueDate ? ' (due ' + a.dueDate + ')' : ''}`).join('\n'));
              if (m.decisions?.length)   lines.push('Decisions:\n' + m.decisions.map((d) => `- ${d}`).join('\n'));
              if (m.topics?.length)      lines.push('Topics: ' + m.topics.join(', '));
              if (m.fullSummary)         lines.push('Full summary:\n' + m.fullSummary.slice(0, 1500));
              return lines.join('\n\n');
            }).join('\n\n---\n\n');
            const meetingHeader = `[Active meeting transcripts]\nThe user has activated these meeting analyses. Use them as primary context when relevant.\n\n${meetingBlocks}`;
            docContext = docContext ? `${meetingHeader}\n\n---\n\n${docContext}` : meetingHeader;
            activeMeetings.forEach((m) => docSources.push(`🎙️ ${m.title}`));
          }
        }
      } catch { /* ignore */ }

      // Tori 핫픽스 (2026-04-25) — 활성 데이터 소스 메타 주입
      // 청크 임베딩 인프라는 후속 작업이라 일단 LLM에게 활성 폴더 컨텍스트만 알림.
      const { useDataSourceStore } = await import('@/stores/datasource-store');
      const dsList = useDataSourceStore.getState().sources.filter((s) => s.isActive !== false);
      if (dsList.length > 0) {
        const dsLines = dsList.map((s) => {
          const svc = s.type === 'google-drive' ? 'Google Drive'
                    : s.type === 'onedrive'     ? 'OneDrive'
                    : s.type === 'webdav'       ? 'WebDAV' : s.type;
          const folder = s.name && s.name !== svc ? ` · ${s.name}` : '';
          const fileCount = typeof s.fileCount === 'number' ? ` (${s.fileCount} files)` : '';
          return `- ${svc}${folder}${fileCount}`;
        }).join('\n');
        const dsHeader =
`[Active data sources connected to this user's account]
The user has activated these external data sources. The actual file contents are NOT yet indexed (file embedding is a separate feature). When the user asks about the data inside these sources, acknowledge the connection and tell them you can see the folder is connected but the file content search will be available after embeddings are processed. Don't fabricate file contents.

${dsLines}`;
        docContext = docContext ? `${dsHeader}\n\n---\n\n${docContext}` : dsHeader;
        // 출처 칩에도 표시
        dsList.forEach((s) => {
          const svc = s.type === 'google-drive' ? 'Google Drive' : s.type === 'onedrive' ? 'OneDrive' : s.type;
          docSources.push(s.name && s.name !== svc ? `${svc} · ${s.name}` : svc);
        });
      }
    } catch { /* RAG 실패 시 무시 */ }

    // [2026-04-26 Tori 16384118 §2] syncing/error 헤더 — RAG context 비어있고 활성 소스에
    // syncing/error가 있을 때만 주입. RAG hit이 있으면 정상 RAG 답변 우선.
    if (!docContext && (syncingDocs.length > 0 || errorDocs.length > 0)) {
      if (syncingDocs.length > 0) {
        const list = syncingDocs.map((d) => `- 📄 ${d.name} · ${d.percent}%`).join('\n');
        const headerKo =
`[Active sources — currently syncing]
사용자가 활성화한 자료가 현재 분석 중입니다:
${list}

사용자가 이 자료에 대해 질문하면, 다음 형식으로 답변하세요:

"[자료 이름] 분석이 진행 중이에요 (XX%).
잠시 후 완료됩니다.

지금 할 수 있는 것:
• [데이터 소스 페이지로 이동] — 진행 상태 자세히 보기
• 또는 일반 답변을 받아도 됩니다 — 무엇을 도와드릴까요?"

자료와 무관한 질문이면 위 안내 없이 일반 답변하세요.`;
        const headerEn =
`[Active sources — currently syncing]
The user has activated these sources but they are still indexing:
${list}

When the user asks about content from these sources, reply in this format:

"[source name] is still analyzing (XX%).
It will finish shortly.

Available actions:
• [Open Data Sources page] — view detailed progress
• Or get a general answer — what can I help with?"

If the question is unrelated, answer normally without the notice.`;
        docContext = lang === 'ko' ? headerKo : headerEn;
      } else if (errorDocs.length > 0) {
        const list = errorDocs.map((d) => `- 📄 ${d.name}${d.error ? ` — ${d.error}` : ''}`).join('\n');
        const headerKo =
`[Active sources — error]
사용자가 활성화한 자료에 문제가 있어 검색할 수 없습니다:
${list}

사용자가 이 자료에 대해 질문하면, 다음 안내를 답변에 포함하세요:

"[자료 이름] 검색에 문제가 있어요.
[채팅 입력창 위 칩의 ⚠️ 클릭]하면 해결할 수 있어요.

가능한 원인:
• OpenAI/Google 임베딩 키 미설정 또는 만료
• 일일 한도 초과 (내일 자동 재개)

일반 답변을 받으시려면 그대로 진행하세요."`;
        const headerEn =
`[Active sources — error]
The user's active sources have an issue and cannot be searched:
${list}

When the user asks about these sources, include this guidance:

"[source name] search has an issue.
Click the ⚠️ on the chip above the input to resolve.

Possible causes:
• OpenAI/Google embedding key missing or expired
• Daily limit reached (auto-resumes tomorrow)

To get a general answer, just continue."`;
        docContext = lang === 'ko' ? headerKo : headerEn;
      }
    }

    // [2026-04-26] 답변 가드 — 활성 소스가 있으면 LLM이 추측 답변하지 않도록 명시
    if (docContext) {
      const guardKo =
`[Answer Guard]
다음 [Active...] 섹션을 1차 지식원으로 사용하세요.
- 제공된 소스에 없는 사실은 "제공된 소스에서 찾을 수 없어요"라고 명확히 답하고 추측하지 마세요.
- 출처를 인라인으로 표기하세요. 예: [source: 파일명], [meeting: 제목]
- 파일 내용·숫자·날짜를 임의로 만들어내지 마세요.`;
      const guardEn =
`[Answer Guard]
Use the [Active...] sections below as your primary knowledge source.
- If a fact isn't in the provided sources, reply "Not found in the provided sources" — do not guess.
- Cite sources inline, e.g. [source: filename], [meeting: title].
- Don't fabricate file contents, numbers, or dates.`;
      const guard = lang === 'ko' ? guardKo : guardEn;
      docContext = `${guard}\n\n---\n\n${docContext}`;
    }

    // 비전(이미지 첨부) 시 user 메시지 content를 multimodal parts로 변환 (chat-api.ts MultimodalPart)
    const toApiContent = (m: Message): import('@/modules/chat/chat-api').MessageContent => {
      if (m.role === 'user' && m.images && m.images.length > 0) {
        return [
          { type: 'text' as const, text: m.content },
          ...m.images.map((url) => ({ type: 'image_url' as const, url })),
        ];
      }
      return m.content;
    };

    // ── Trial path (Gemini 2.5 Flash, no user key) ───────────────
    if (isTrialMode) {
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
            modelUsed: 'gemini-2.5-flash',
            sources: docSources.length ? docSources : undefined,
          }]);
          setIsStreaming(false);
          setStreamingContent('');
          abortRef.current = null;
          // P3.2 자동 제목 — 첫 응답 직후만 트리거
          if (messages.length === 0) triggerAutoTitle(content, fullText);
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

    if (effectiveModel === 'auto') {
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
      const modelDef = MODELS.find(m => m.id === effectiveModel);
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

    // RAG 컨텍스트 있으면 system 메시지로 prepend
    const apiMessages = docContext
      ? [{ role: 'system' as const, content: docContext } as { role: 'system'; content: import('@/modules/chat/chat-api').MessageContent }, ...updatedMessages.map(m => ({ role: m.role, content: toApiContent(m) }))]
      : updatedMessages.map(m => ({ role: m.role, content: toApiContent(m) }));

    sendChatRequest({
      messages: apiMessages,
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
          sources: docSources.length ? docSources : undefined,
        }]);
        setIsStreaming(false);
        setStreamingContent('');
        abortRef.current = null;
        // P3.2 자동 제목 — 첫 응답 직후만 트리거
        if (messages.length === 0) triggerAutoTitle(content, fullText);
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
            className="inline-flex items-center gap-2 rounded-full border bg-transparent px-3 py-1.5 pl-2.5 text-[13px] transition-all duration-300 hover:bg-white"
            style={{
              borderColor: tokens.borderStrong,
              color: tokens.text,
              fontFamily: fontStack,
              transform: isModelChanging ? 'scale(1.05)' : 'scale(1)',
              boxShadow: isModelChanging
                ? `0 0 0 3px ${BRAND_COLORS[MODELS.find(m => m.id === currentModel)?.brand ?? 'blend'] ?? tokens.accent}26`
                : 'none',
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full transition-colors duration-300"
              style={{ background: BRAND_COLORS[MODELS.find(m => m.id === currentModel)?.brand ?? 'blend'] ?? tokens.accent }}
            />
            {MODELS.find((m) => m.id === currentModel)?.name ?? t.modelAuto}
            <ChevronIcon />
          </button>
          {/* [2026-04-26] Sprint 2 — 트라이얼 단계화 (🟢7-/🟡8-9/🔴10) */}
          {isTrialMode && (() => {
            const used = trialMaxPerDay - trialRemaining;
            const tone = trialRemaining === 0 ? 'red' : used >= 8 ? 'amber' : 'green';
            const bg = tone === 'red' ? '#fee2e2' : tone === 'amber' ? '#fef3c7' : tokens.accentSoft;
            const fg = tone === 'red' ? '#991b1b' : tone === 'amber' ? '#92400e' : tokens.accent;
            const trailKo = trialRemaining === 0 ? '' : (used >= 8 ? ' · 곧 종료' : '');
            const trailEn = trialRemaining === 0 ? '' : (used >= 8 ? ' · almost done' : '');
            return (
            <span
              className="inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] font-medium"
              style={{ background: bg, color: fg, fontFamily: fontStack }}
              suppressHydrationWarning
            >
              <span style={{ whiteSpace: 'nowrap' }} suppressHydrationWarning>
                {trialRemaining === 0
                  ? (lang === 'ko' ? '무료 체험 종료' : 'Free trial ended')
                  : lang === 'ko'
                  ? (isMobile ? `무료 · ${trialRemaining}/10${trailKo}` : `무료 체험중 · ${trialRemaining}/10${trailKo}`)
                  : (isMobile ? `Trial · ${trialRemaining}/10${trailEn}` : `Free trial · ${trialRemaining}/10${trailEn}`)}
              </span>
            </span>
            );
          })()}
        </div>
        <div className="flex items-center gap-1">
          <D1IconButton
            title={`${t.history} (${typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘K' : 'Ctrl+K'})`}
            onClick={() => setHistoryOpen(true)}
          >
            <HistoryIcon />
          </D1IconButton>
          <div className="relative hidden md:flex">
            <button
              onClick={() => { if (messages.length > 0) setExportOpen((o) => !o); }}
              title={
                messages.length === 0
                  ? (lang === 'ko' ? '대화를 시작하면 내보낼 수 있어요' : 'Start a conversation to export')
                  : (lang === 'ko' ? '대화 내보내기' : 'Export conversation')
              }
              aria-label={lang === 'ko' ? '대화 내보내기' : 'Export conversation'}
              className="flex h-9 w-9 items-center justify-center rounded-lg border-none bg-transparent transition-colors duration-150 hover:bg-black/5"
              style={{
                color: tokens.textDim,
                opacity: messages.length === 0 ? 0.35 : 1,
                cursor: messages.length === 0 ? 'not-allowed' : 'pointer',
                background: exportOpen ? 'rgba(0,0,0,0.05)' : undefined,
              }}
            >
              <ShareIcon />
            </button>
            <D1ExportDropdown
              open={exportOpen}
              onClose={() => setExportOpen(false)}
              onExport={handleExport}
              lang={lang}
            />
          </div>
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
              <D1MessageRow
                key={msg.id}
                message={msg}
                lang={lang}
                t={t}
                onTryAnother={(newModel?: string) => regenerateAssistantMessage(msg.id, newModel)}
                onFork={msg.role === 'assistant' ? () => forkChatAtMessage(msg.id) : undefined}
                onShare={msg.role === 'assistant' ? () => setShareOpen(true) : undefined}
              />
            ))}
            {isStreaming && streamingContent && (
              <D1AssistantMessage content={streamingContent} streaming lang={lang} t={t} />
            )}
          </div>
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col px-4 md:px-8" style={{ minHeight: 0 }}>
          {/* Hero — naturally centered in the upper region */}
          <div className="flex flex-1 flex-col items-center justify-center">
            <div
              className="text-center"
              style={{ animation: 'd1-rise 700ms cubic-bezier(0.16,1,0.3,1) both' }}
            >
              <h1
                className="mb-3.5 text-[40px] md:text-[56px] lg:text-[64px] font-medium leading-[1.1] tracking-[-0.03em]"
                style={{ fontFamily: fontStack, wordBreak: lang === 'ko' ? 'keep-all' : undefined }}
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
          </div>

          {/* Bottom block — input + (desktop only) suggestions + footer hint */}
          <div
            className="pb-[max(1.5rem,env(safe-area-inset-bottom))] md:pb-12"
            style={{ animation: 'd1-rise 700ms cubic-bezier(0.16,1,0.3,1) both' }}
          >
            {/* Tori 통합 RAG — 활성 소스 칩 바 (입력창 위) */}
            <div className="mx-auto w-full max-w-[720px]">
              <ActiveSourcesBar
                lang={lang}
                onNavigate={() => window.dispatchEvent(new CustomEvent('d1:nav-documents'))}
              />
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
              glowing={inputGlowing}
              lang={lang}
              attachedImages={attachedImages}
              onImagesAttached={handleImagesAttached}
              onRemoveImage={handleRemoveImage}
              voiceEnabled
              onVoiceFallbackRecorded={handleVoiceFallbackRecorded}
            />

            {/* Suggestions — desktop only. Sprint 2 (16384367): 6 카드 + icon + ⓘ 툴팁 */}
            <div
              className="mt-4 hidden flex-wrap justify-center gap-2 md:flex"
              style={{ animation: 'd1-rise 700ms cubic-bezier(0.16,1,0.3,1) 240ms both' }}
            >
              {SUGGESTIONS_WITH_MODEL.map((s) => {
                const label = lang === 'ko' ? s.ko : s.en;
                const tooltip = lang === 'ko' ? s.tooltipKo : s.tooltipEn;
                const modelEntry = MODELS.find(m => m.id === s.suggestedModel);
                const dotColor = (s as { routeOverride?: string }).routeOverride
                  ? tokens.accent
                  : (BRAND_COLORS[modelEntry?.brand ?? 'blend'] ?? tokens.accent);
                return (
                  <button
                    key={s.id}
                    onClick={() => handleSuggestionClick(s)}
                    className="group/card inline-flex items-center gap-2 rounded-full border bg-transparent px-3 py-2 text-[13.5px] transition-all duration-200 hover:bg-white"
                    style={{ borderColor: tokens.borderStrong, color: tokens.textDim, fontFamily: fontStack }}
                    title={tooltip}
                  >
                    <span aria-hidden className="text-[14px] leading-none">{s.icon}</span>
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dotColor }} />
                    {label}
                  </button>
                );
              })}
            </div>

            {/* [2026-04-26] Sprint 2 — 첫 클릭 hint (1회만) */}
            {firstClickHintShown && (
              <div
                className="mx-auto mt-3 inline-flex items-center justify-center rounded-full px-3 py-1 text-[12px]"
                style={{
                  background: tokens.accent,
                  color: '#fff',
                  animation: 'd1-rise 240ms cubic-bezier(0.16,1,0.3,1) both',
                }}
                role="status"
              >
                {lang === 'ko' ? '엔터를 눌러 보내세요' : 'Press Enter to send'}
              </div>
            )}

            <p
              className="mt-3 text-center text-[11.5px]"
              style={{ color: tokens.textFaint }}
            >
              {t.footer}
            </p>
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
            <ActiveSourcesBar
              lang={lang}
              onNavigate={() => window.dispatchEvent(new CustomEvent('d1:nav-documents'))}
            />
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
              glowing={inputGlowing}
              lang={lang}
              attachedImages={attachedImages}
              onImagesAttached={handleImagesAttached}
              onRemoveImage={handleRemoveImage}
              voiceEnabled
              onVoiceFallbackRecorded={handleVoiceFallbackRecorded}
            />
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMsg && (
        <div
          className="pointer-events-none fixed bottom-24 left-1/2 -translate-x-1/2 rounded-full px-4 py-2 text-[13px] shadow-lg z-50"
          style={{ background: tokens.text, color: tokens.bg, fontFamily: fontStack }}
        >
          {toastMsg}
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
          onSwitchToGemini={() => setCurrentModel('gemini-2.5-flash')}
          onOpenOnboarding={() => window.dispatchEvent(new CustomEvent('d1:open-onboarding'))}
          onClose={() => setShowKeyRequired(null)}
        />
      )}

      {/* [2026-04-26] Sprint 3 (16384367) — Share modal */}
      <ShareModal
        lang={lang}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        messages={shareMessages}
      />

      {/* History overlay (Cmd/Ctrl+K or History icon) */}
      <D1HistoryOverlay
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onSelect={(id) => loadChat(id)}
        onDelete={(id) => {
          d1Delete(id);
          if (id === activeChatId) {
            setActiveChatId(null);
            setMessages([]);
          }
        }}
        onTogglePin={(id) => useD1ChatStore.getState().togglePin(id)}
        chats={chatSummaries}
        lang={lang}
      />

      {/* Global styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes d1-rise {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes d1-glow-pulse {
          0%, 100% { box-shadow: 0 8px 32px rgba(0,0,0,0.06), 0 0 0 0 rgba(198, 90, 60, 0); }
          50%      { box-shadow: 0 8px 32px rgba(0,0,0,0.06), 0 0 0 4px rgba(198, 90, 60, 0.15); }
        }
        .d1-input-glow { animation: d1-glow-pulse 800ms cubic-bezier(0.4, 0, 0.6, 1); }
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
  tryAnother: string; comingSoon: string;
};

function D1MessageRow({ message, lang, t, onTryAnother, onFork, onShare }: { message: Message; lang: Lang; t: CopyObj; onTryAnother: (newModel?: string) => void; onFork?: () => void; onShare?: () => void }) {
  if (message.role === 'user') {
    return <D1UserMessage content={message.content} lang={lang} />;
  }
  return (
    <D1AssistantMessage
      content={message.content}
      modelUsed={message.modelUsed}
      totalTokens={message.totalTokens}
      cost={message.cost}
      sources={message.sources}
      lang={lang}
      t={t}
      onTryAnother={onTryAnother}
      onFork={onFork}
      onShare={onShare}
    />
  );
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
  totalTokens,
  cost,
  sources,
  lang,
  t,
  onTryAnother,
  onFork,
  onShare,
}: {
  content: string;
  streaming?: boolean;
  modelUsed?: string;
  totalTokens?: number;
  cost?: number;
  sources?: string[];
  lang: Lang;
  t: CopyObj;
  onTryAnother?: (newModel?: string) => void;
  onFork?: () => void;
  onShare?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const modelInfo = MODELS.find((m) => m.id === modelUsed || m.apiModel === modelUsed);

  useEffect(() => {
    if (!showModelPicker) return;
    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showModelPicker]);
  const tokensStr = formatTokens(totalTokens, lang);
  const costStr   = formatKRW(cost, lang);

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

            {/* [2026-04-26] Sprint 3 (16384367) — Share button */}
            {onShare && (
              <button
                onClick={onShare}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] transition-colors hover:bg-black/5"
                style={{ color: tokens.textDim }}
                title={lang === 'ko' ? '공유' : 'Share'}
              >
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx={18} cy={5} r={3} />
                  <circle cx={6} cy={12} r={3} />
                  <circle cx={18} cy={19} r={3} />
                  <line x1={8.59} y1={13.51} x2={15.42} y2={17.49} />
                  <line x1={15.41} y1={6.51} x2={8.59} y2={10.49} />
                </svg>
                {lang === 'ko' ? '공유' : 'Share'}
              </button>
            )}

            {/* Message meta footer */}
            {modelInfo && (
              <span className="ml-2 flex items-center gap-1.5 text-[11px]" style={{ color: tokens.textFaint }}>
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: BRAND_COLORS[modelInfo.brand] ?? tokens.accent }}
                />
                {modelInfo.name}
                {tokensStr && <><span>·</span><span>{tokensStr}</span></>}
                {costStr   && <><span>·</span><span>{costStr}</span></>}
              </span>
            )}

            {/* P3.1 — 포크: 이 메시지 시점에서 분기 */}
            {onFork && (
              <button
                onClick={onFork}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] opacity-0 transition-opacity duration-150 hover:!opacity-100 group-hover:opacity-60"
                style={{ color: tokens.textDim }}
                title={lang === 'ko' ? '분기 (포크)' : 'Fork from here'}
              >
                ⑂ {lang === 'ko' ? '분기' : 'Fork'}
              </button>
            )}
            {onTryAnother && (
              <div ref={pickerRef} className="relative ml-auto">
                <button
                  onClick={() => setShowModelPicker((v) => !v)}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] opacity-0 transition-opacity duration-150 hover:!opacity-100 group-hover:opacity-60"
                  style={{ color: tokens.textDim }}
                  title={t.tryAnother}
                >
                  ↻ {t.tryAnother}
                </button>
                {showModelPicker && (
                  <div
                    className="absolute bottom-full right-0 mb-1 z-50 rounded-xl border py-1.5 shadow-lg"
                    style={{ background: tokens.surface, borderColor: tokens.border, minWidth: 180 }}
                  >
                    {MODELS.filter((m) => m.id !== 'auto').slice(0, 8).map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setShowModelPicker(false);
                          onTryAnother(m.id);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] transition-colors hover:bg-black/5"
                        style={{ color: tokens.text }}
                      >
                        <span
                          className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
                          style={{ background: BRAND_COLORS[m.brand] ?? tokens.accent }}
                        />
                        {m.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* P3.3 — CitationBlock: RAG 인용 출처 */}
        {!streaming && sources && sources.length > 0 && (
          <div
            className="mt-3 flex flex-wrap items-center gap-1.5 text-[11.5px]"
            style={{ color: tokens.textDim }}
          >
            <span>{lang === 'ko' ? '출처:' : 'Sources:'}</span>
            {sources.map((src, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                style={{ background: tokens.surfaceAlt, color: tokens.text }}
                title={src}
              >
                <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6" />
                </svg>
                <span className="max-w-[180px] truncate">{src}</span>
              </span>
            ))}
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
  glowing = false,
  lang,
  onImagesAttached,
  attachedImages = [],
  onRemoveImage,
  voiceEnabled = true,
  onVoiceFallbackRecorded,
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
  glowing?: boolean;
  lang?: Lang;
  onImagesAttached?: (files: File[]) => void;
  attachedImages?: string[];
  onRemoveImage?: (idx: number) => void;
  voiceEnabled?: boolean;
  onVoiceFallbackRecorded?: (blob: Blob) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  // 음성 인식 누적 — 발화 종료 시점까지 interim 결과를 합쳐 input에 반영
  const voiceBaseRef = useRef<string>('');

  function handleAttachClick() {
    // 이미지 우선 (v3 회귀 복구 — 비전 첨부)
    if (onImagesAttached) imageInputRef.current?.click();
    else fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      onChange(value ? `${value}\n[첨부: ${file.name}]` : `[첨부: ${file.name}]`);
      e.target.value = '';
    }
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length && onImagesAttached) onImagesAttached(files);
    e.target.value = '';
  }

  function handleVoiceTranscript(text: string, isFinal: boolean) {
    // 발화 누적: 처음에는 현재 input을 base로 보존, interim마다 base + interim 텍스트로 갱신
    if (!voiceBaseRef.current) voiceBaseRef.current = value ? value + ' ' : '';
    const next = voiceBaseRef.current + text;
    onChange(next);
    if (isFinal) {
      // 최종 결과를 base에 누적, 다음 interim의 base로 사용
      voiceBaseRef.current = next + ' ';
    }
  }

  return (
    <div
      className={`w-full max-w-[720px] rounded-[20px] border bg-white px-[18px] pt-4 pb-3 transition-[border-color,box-shadow] duration-200 focus-within:shadow-[0_12px_40px_rgba(0,0,0,0.08)]${glowing ? ' d1-input-glow' : ''}`}
      style={{
        borderColor: tokens.borderStrong,
        boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
        animation: floating ? 'none' : 'd1-rise 700ms cubic-bezier(0.16,1,0.3,1) 120ms both',
        margin: floating ? '0 auto' : undefined,
      }}
    >
      {/* Hidden file input — generic */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
        accept=".pdf,.txt,.md,.csv,.json,.docx,.xlsx"
      />
      {/* Hidden image input (v3 비전 첨부) */}
      <input
        ref={imageInputRef}
        type="file"
        className="hidden"
        multiple
        onChange={handleImageChange}
        accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
      />

      {/* 첨부 이미지 미리보기 */}
      {attachedImages.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachedImages.map((src, i) => (
            <div key={i} className="relative">
              <img
                src={src}
                alt=""
                className="h-14 w-14 rounded-md border object-cover"
                style={{ borderColor: tokens.border }}
              />
              {onRemoveImage && (
                <button
                  type="button"
                  onClick={() => onRemoveImage(i)}
                  className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-white"
                  style={{ background: tokens.text }}
                  aria-label="remove"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => { voiceBaseRef.current = ''; onChange(e.target.value); }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-none border-none bg-transparent text-[15px] md:text-base leading-[1.5] tracking-[-0.01em] outline-none placeholder:text-[--d1-placeholder] min-h-[88px] md:min-h-[96px] max-h-[240px]"
        style={{ color: tokens.text, '--d1-placeholder': tokens.textFaint } as React.CSSProperties}
      />
      <div className="mt-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <D1IconButton title={attachLabel} onClick={handleAttachClick}>
            <AttachIcon />
          </D1IconButton>
          {voiceEnabled && (
            <VoiceButton
              onTranscript={handleVoiceTranscript}
              onFallbackRecorded={onVoiceFallbackRecorded}
              disabled={isStreaming}
              lang={lang}
            />
          )}
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
  // Render helper for a single row
  const renderRow = (m: ModelEntry) => {
    const selected = m.id === currentModel;
    const desc = lang === 'ko' ? m.desc_ko : m.desc_en;
    return (
      <button
        key={m.id}
        onClick={() => onSelect(m.id)}
        className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-black/5"
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
  };

  // Split: Auto row goes on top, rest grouped by provider
  const autoRow = MODELS.find((m) => m.id === 'auto');
  const nonAuto = MODELS.filter((m) => m.id !== 'auto');
  const grouped = new Map<ProviderId, ModelEntry[]>();
  for (const m of nonAuto) {
    const list = grouped.get(m.provider as ProviderId) ?? [];
    list.push(m);
    grouped.set(m.provider as ProviderId, list);
  }

  return (
    <div
      id="d1-model-dropdown"
      className="absolute left-8 top-[52px] z-50 w-[340px] max-h-[70vh] overflow-y-auto rounded-[16px] border"
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
        {autoRow && renderRow(autoRow)}

        {FEATURED_PROVIDER_ORDER.map((provider) => {
          const models = grouped.get(provider);
          if (!models || models.length === 0) return null;
          return (
            <div key={provider}>
              <div
                className="mt-1.5"
                style={{
                  borderTop: `1px solid ${tokens.borderStrong}`,
                  margin: '6px 12px 0',
                }}
              />
              <div
                className="pt-2 pb-1"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: tokens.textFaint,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  padding: '8px 16px 4px',
                }}
              >
                {PROVIDER_LABELS[provider][lang]}
              </div>
              {models.map(renderRow)}
            </div>
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
