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
import { D1TrialExhaustedModal, D1KeyRequiredModal, D1TtsQualityModal } from '@/modules/chat/trial-modals-design1';
import { AVAILABLE_MODELS, getFeaturedModels, getAutoFallbackChain, getBestImageModel, isImageGenModel, FEATURED_PROVIDER_ORDER, PROVIDER_LABELS, type ProviderId } from '@/data/available-models';
import { trackEvent } from '@/lib/analytics';
// [2026-05-02 Roy] trackUsage / calculateCost 호출 제거 — chat-api.ts가 자체적으로
// 모든 sendChatRequest 호출에 대해 자동 트래킹. 여기서 또 호출하면 이중 누적.
import { useD1ChatStore, type D1Chat, type D1Message } from '@/stores/d1-chat-store';
import { D1HistoryOverlay, type ChatSummary } from '@/modules/chat/history-overlay-design1';
import { useD1MemoryStore, D1_MEMORY_LIMIT } from '@/stores/d1-memory-store';
import { D1ExportDropdown } from '@/modules/chat/export-dropdown-design1';
// [2026-04-26] Sprint 3 (16384367) — Share Links
import { ShareModal } from '@/components/share-modal';
import type { ShareMessage } from '@/lib/share-encoder';
import { exportD1Chat, type D1ExportFormat } from '@/modules/chat/export-utils-design1';
// v3 회귀 복구 (Tori P0.2-0.5): 음성 / 이미지 / 비전 / 웹검색
import { VoiceButton } from '@/modules/chat/voice-button';
import { sttOpenAI, sttGeminiAudio } from '@/lib/voice-chat';
import { generateImage, extractImagePrompt } from '@/modules/plugins/image-gen';
import { detectCategory } from '@/lib/model-router';
import { performWebSearch, extractSearchQuery, formatSearchResultsAsContext } from '@/modules/plugins/web-search';
// P3.3 — RAG (활성 문서 컨텍스트) + CitationBlock
import { useDocumentStore } from '@/stores/document-store';
import { buildContext, buildFullContext, buildMetadataContext } from '@/modules/plugins/document-plugin';
import { stripSourceTag } from '@/lib/source-indexer';
// Tori 17989643 PR #1 — 첨부 파일 처리 의도 분류
import { classifyAttachmentIntent, getModePromptHeader, getLangEnforcementHeader } from '@/modules/chat/intent-classifier';
// [2026-05-02 Roy] Blend 핵심: 질문별 최적 AI 자동 매칭 — detectCategory로 카테고리
// 분류 후 ROUTE_MAP에서 우선 모델 선택. 단순 'first available' fallback 폐기.
import { detectCategory as routerDetectCategory, getCategoryPreferredModels } from '@/lib/model-router';
import { inferProvider as routerInferProvider } from '@/data/available-models';
// [2026-05-01 Roy] Blend 정체성 — 모든 AI에 system prompt로 주입
import { getBlendIdentityPrompt, BLEND_INTRO_QUESTION } from '@/lib/blend-identity';

// [2026-05-02 Roy] AI 도구 한국어 라벨 — indicator 표시용. 영어는 raw name 그대로.
const TOOL_LABEL_KO: Record<string, string> = {
  get_current_time: '시간 조회',
  get_weather: '날씨',
  get_currency_rate: '환율',
  calculate: '계산',
};
// [2026-04-28 Roy 직접 요청] AI 응답을 PDF로 자동 다운로드
import { exportResponseAsPDF, detectPdfDownloadIntent, stripPdfDownloadIntent } from '@/lib/export/export-response-pdf';
// [Tori 18644993 PR #1+#2+#3] Cross-Model 컨텍스트 연속성
import { adaptForText, adaptForImage, adaptForVision, inferTargetModelType } from '@/lib/context/model-adapter';
// Tori 통합 RAG — 활성 소스 칩 바
import { ActiveSourcesBar } from '@/modules/chat/active-sources-bar';
// [2026-04-28] 진행률 배너 — 칩의 작은 점만으로는 분석 중을 인지 못하던 UX 보강
import { D1RagProgressBanner } from '@/modules/chat/rag-progress-banner';

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
  // [Tori 18644993 PR #5] Cross-Model Bridge — UI Badge 표시용
  bridgeApplied?: boolean;
  bridgeFromCache?: boolean;
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

  // [2026-05-01] defensive — corrupt localStorage(과거 버전 zustand persist 형식 등)에서
  // keys 값이 객체로 들어와 .trim() throw → 페이지 전체 crash. typeof 가드로 안전화.
  const hasAnyUserKey = Object.values(keys).some((k) => typeof k === 'string' && k.trim().length > 0);
  const isTrialMode   = !hasAnyUserKey && TRIAL_KEY_AVAILABLE;

  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [currentModel, setCurrentModel] = useState(initialModel ?? 'auto');
  const abortRef = useRef<AbortController | null>(null);
  const nextModelOverrideRef = useRef<string | null>(null);
  // [2026-05-02 Roy] AI 도구 사용 indicator — streaming 중에 '🔧 weather 도구
  // 사용 중' 식 표시. 사용자가 stuck/처리 중 구분.
  const [activeToolName, setActiveToolName] = useState<string | null>(null);

  // [2026-05-02 Roy] TTS — 답변 음성 재생 (Roy 결정 기반 B+C 모드).
  //   B (자동): 사용자가 마이크로 입력 → 답변 음성 자동 재생
  //   C (수동): 텍스트 입력 → 답변에 🔊 버튼, 클릭 시 재생
  //   master toggle: 헤더 🔊/🔇 ON/OFF (default ON, OFF면 둘 다 비활성)
  //   품질: 'premium' (Chirp3-HD) / 'standard' (Neural2 + OpenAI gpt-4o-mini-tts)
  //   limit: 채팅마다 50회. 새 채팅 시작 시 리셋. 카운터 헤더 노출.
  //   첫 사용 시 D1TtsQualityModal로 품질 선택 (default 'standard').
  const TTS_LIMIT = 50;
  // [2026-05-02 Roy] default OFF — 첫 사용자는 의도적으로 토글 ON해야 활성. 회의실
  // /카페 등에서 갑자기 음성 재생 방지. localStorage에 'true' 저장된 사용자는 그
  // 값으로 복원 (새 세션에서도 유지).
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(false);
  const [ttsQuality, setTtsQuality] = useState<'premium' | 'standard'>('standard');
  const [ttsQualityChosen, setTtsQualityChosen] = useState<boolean>(false);
  const [ttsCount, setTtsCount] = useState<number>(0);
  const [showTtsQualityModal, setShowTtsQualityModal] = useState<boolean>(false);
  const lastUserSourceRef = useRef<'voice' | 'text'>('text');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ttsEn = localStorage.getItem('d1:tts-enabled');
    if (ttsEn !== null) setTtsEnabled(ttsEn === 'true');
    const q = localStorage.getItem('d1:tts-quality');
    if (q === 'premium' || q === 'standard') setTtsQuality(q);
    const chosen = localStorage.getItem('d1:tts-quality-chosen');
    if (chosen === 'true') setTtsQualityChosen(true);
    audioRef.current = new Audio();
    audioRef.current.preload = 'auto';
  }, []);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('d1:tts-enabled', String(ttsEnabled));
    }
    if (!ttsEnabled && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [ttsEnabled]);
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('d1:tts-quality', ttsQuality);
  }, [ttsQuality]);

  function setTtsQualityAndPersist(q: 'premium' | 'standard'): void {
    setTtsQuality(q);
    setTtsQualityChosen(true);
    // 첫 모달에서 품질 선택 = ON 활성화 의도. 마스터 토글도 ON으로.
    setTtsEnabled(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem('d1:tts-quality', q);
      localStorage.setItem('d1:tts-quality-chosen', 'true');
      localStorage.setItem('d1:tts-enabled', 'true');
    }
  }

  // [2026-05-02 Roy] 입력바 토글 클릭 시 — OFF→ON 전환 + 첫 사용이면 품질 모달.
  // 첫 사용 시 모달 먼저, 사용자가 품질 선택해야 ON 활성화. 모달 닫기 → OFF 유지
  // (의도적 cancel 보호). 이미 chosen된 상태면 즉시 토글.
  function handleToggleTts(): void {
    if (!ttsEnabled && !ttsQualityChosen) {
      // 첫 ON 시도 — 모달부터. ttsEnabled은 onChoose에서 true로 셋팅.
      setShowTtsQualityModal(true);
      return;
    }
    setTtsEnabled((v) => !v);
  }

  // 답변 텍스트를 TTS에 보낼 때 마크다운/이미지/코드블록 제거 + 길이 제한.
  // 첫 1500자만 (~30초 음성). 사용자가 클릭/자동재생 시 30초로 충분.
  function cleanForTTS(raw: string): string {
    return raw
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/```[\s\S]*?```/g, '코드 블록.')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[*_~#>]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1500);
  }

  /** 외부에서 호출되는 TTS 핵심 — 자동/수동 모두 이 함수 통과 */
  async function playTTS(text: string): Promise<void> {
    if (!ttsEnabled) return;
    if (ttsCount >= TTS_LIMIT) {
      setToastMsg(lang === 'ko'
        ? `이번 채팅 음성 한도(${TTS_LIMIT}회) 도달. 새 채팅 시작하면 리셋돼요.`
        : `Voice limit (${TTS_LIMIT}) reached for this chat. Start a new chat to reset.`);
      return;
    }
    const cleaned = cleanForTTS(text);
    if (!cleaned) return;

    // 첫 TTS 사용 시 품질 선택 모달 — 한 번만
    if (!ttsQualityChosen) {
      setShowTtsQualityModal(true);
      return;
    }

    try {
      const { synthesizeTTS } = await import('@/lib/voice-chat');
      const openaiKey = getKey('openai') || null;
      const googleKey = getKey('google') || null;
      if (!openaiKey && !googleKey) {
        setToastMsg(lang === 'ko'
          ? '🔑 OpenAI 또는 Google 키를 설정 → API 키 관리에 등록하면 음성 답변 들을 수 있어요.'
          : '🔑 Register an OpenAI or Google key in Settings → API Keys to enable voice playback.');
        return;
      }
      const url = await synthesizeTTS(cleaned, ttsQuality, openaiKey, googleKey);
      setTtsCount((c) => c + 1);
      if (audioRef.current) {
        audioRef.current.src = url;
        await audioRef.current.play().catch(() => {
          setToastMsg(lang === 'ko'
            ? '🔊 음성 재생을 위해 한 번 화면을 탭해주세요'
            : '🔊 Tap the screen once to enable audio playback');
        });
      }
    } catch (e) {
      if (typeof window !== 'undefined') console.warn('[TTS] failed:', e);
      setToastMsg(lang === 'ko' ? `🔇 음성 재생 실패: ${(e as Error).message}` : `🔇 TTS failed: ${(e as Error).message}`);
    }
  }

  /** [2026-05-02 Roy] 마스터 토글 ON일 때 모든 답변 자동 재생 (source 무관).
   *  Roy 결정 — B+C 모드 폐기, 단순 ON/OFF로 회귀. 입력 source 추적은 코드 호환을
   *  위해 유지하되 maybeAutoPlay 분기에는 사용 X. */
  async function maybeAutoPlay(text: string, _source: 'voice' | 'text'): Promise<void> {
    if (!ttsEnabled) return;
    await playTTS(text);
  }

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

  // [2026-05-02 Roy] '채팅 기억하기' — d1-memory-store 공유 (사이드바 + 히스토리
  // 오버레이 양쪽에서 같은 store 참조). 페이지 reload 시 자동 초기화.
  const selectedMemoryIds = useD1MemoryStore((s) => s.selectedIds);
  const memorySummaryCache = useRef<Map<string, string>>(new Map());

  function toggleMemoryChat(chatId: string): void {
    const ok = useD1MemoryStore.getState().toggle(chatId);
    if (!ok) {
      setToastMsg(lang === 'ko' ? `최대 ${D1_MEMORY_LIMIT}개 채팅만 동시 기억 가능` : `Up to ${D1_MEMORY_LIMIT} chats max`);
      return;
    }
    // 제거된 경우 캐시도 같이 비우기
    if (!useD1MemoryStore.getState().selectedIds.includes(chatId)) {
      memorySummaryCache.current.delete(chatId);
    }
  }
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

  // v3 P0.2: Web Speech 미지원 브라우저 fallback (iOS Safari 강제 포함)
  // [2026-04-26 Tori 16220538 §1] STT 성공 시 즉시 자동 전송 + input 리셋.
  // [2026-05-01] 키 우선순위 로직 — 사용자가 가진 키에 맞춰 STT 자동 선택.
  //   1. OpenAI 키 → Whisper (가장 정확, mp4/m4a 지원)
  //   2. Google 키 → Gemini multimodal STT (사용자 키, mp4 지원)
  //   3. 트라이얼 모드 → Gemini multimodal STT (NEXT_PUBLIC 트라이얼 키)
  //   4. 모든 키 없음 + 트라이얼 비활성 → "API 키 설정" 토스트
  async function handleVoiceFallbackRecorded(blob: Blob) {
    const openaiKey = getKey('openai') || '';
    const googleKey = getKey('google') || '';
    const trialKey = process.env.NEXT_PUBLIC_BLEND_TRIAL_GEMINI_KEY || '';

    let text = '';
    try {
      // [2026-05-02 Roy] 채팅 환경 lang(KO/EN) 무시하고 'auto' — Whisper/Gemini가
      // 100+개 언어 자동 감지. 한국어 환경에서 영어/필리핀어 발화도 그대로 변환.
      // 사용자 명시 요청: '어느 환경에서든 언어를 구분하라'.
      if (openaiKey) {
        text = await sttOpenAI(blob, openaiKey, 'auto');
      } else if (googleKey) {
        text = await sttGeminiAudio(blob, googleKey, 'auto');
      } else if (trialKey && TRIAL_KEY_AVAILABLE) {
        text = await sttGeminiAudio(blob, trialKey, 'auto');
      } else {
        setToastMsg(t.noApiKey);
        return;
      }
    } catch {
      setToastMsg(lang === 'ko' ? '음성 변환 실패' : 'Voice transcription failed');
      return;
    }
    if (!text.trim()) {
      setToastMsg(lang === 'ko' ? '음성을 인식하지 못했어요' : "Couldn't recognize speech");
      return;
    }
    const existing = value.trim();
    const combined = existing ? `${existing} ${text.trim()}` : text.trim();
    // input 리셋 — 다음 음성 시 누적 방지 (이슈 2)
    setValue('');
    // 자동 전송 — handleSend가 BYOK 키 또는 트라이얼 모드 자동 분기.
    handleSend(combined);
  }

  // P3.2 — 자동 제목 생성: 첫 응답 후 LLM에 짧은 제목 1회 요청 → window 이벤트로 부모에 전달
  function triggerAutoTitle(userContent: string, assistantContent: string) {
    if (typeof window === 'undefined') return;
    // 사용 가능한 BYOK 또는 trial fallback 결정
    // [2026-04-30] FALLBACK_ORDER를 registry에서 동적 도출 — 3시간 cron이 모델 갱신하면 자동 따라감.
    // 안전망: registry가 비어있으면 (build error 등) 마지막에 알려진 최신 ID로 fallback.
    const dynamicChain = getAutoFallbackChain();
    const FALLBACK_ORDER: Array<{ provider: AIProvider; apiModel: string }> =
      dynamicChain.length > 0 ? dynamicChain : [
        { provider: 'openai',    apiModel: 'gpt-5-mini' },
        { provider: 'anthropic', apiModel: 'claude-haiku-4-5-20251001' },
        { provider: 'google',    apiModel: 'gemini-2.5-flash' },
        { provider: 'deepseek',  apiModel: 'deepseek-chat' },
        { provider: 'groq',      apiModel: 'llama-3.3-70b-versatile' },
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
        // [2026-05-02 Roy] auto-title은 4-6 단어 요약이라 도구 X
        enableTools: false,
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

  // [2026-04-28 Roy] AI 응답 완료 후 PDF 자동 다운로드.
  // wantsPdfDownload이고 응답이 비어있지 않으면 호출자가 트리거.
  function triggerPdfDownload(
    userQuery: string,
    aiResponse: string,
    sources: string[],
    currentLang: 'ko' | 'en'
  ) {
    // 사용자 입력에서 제목 추출 — "PDF로 다운로드해줘" 같은 동사 제거
    const cleaned = userQuery
      .replace(/[#`*_~]/g, '')
      .replace(/pdf\s*(로|으로)?\s*(다운로드|받아|저장|내려)\s*(해|줘|줄래|줄까|할래|돼)?[?.!]?/gi, '')
      .replace(/(다운로드|저장)[\s,]*(해|줘|받아)?[?.!]?/gi, '')
      .replace(/(download|export|save).*pdf/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    const sourceFile = sources[0]?.replace(/\s*·\s*\d+개\s*청크$/, '').replace(/\s*·\s*\d+\s*chunks?$/i, '').trim() ?? '';
    const titleParts = [
      sourceFile || (currentLang === 'ko' ? 'Blend 답변' : 'Blend Response'),
      cleaned ? cleaned.slice(0, 60) : (currentLang === 'ko' ? '한국어 번역' : 'translation'),
    ];
    const title = titleParts.join(' — ');

    // 비동기 호출 — onDone 동기 흐름 막지 않도록
    void exportResponseAsPDF(
      {
        title,
        body: aiResponse,
        sourceFiles: sources.length ? sources : undefined,
        createdAt: Date.now(),
      },
      currentLang
    ).catch((err) => {
      // PDF 실패 시에도 텍스트 응답은 살아있음 → 토스트로 안내만
      setToastMsg(
        currentLang === 'ko'
          ? `PDF 생성 실패: ${(err as Error).message ?? '오류'}`
          : `PDF export failed: ${(err as Error).message ?? 'error'}`
      );
    });
  }

  // [2026-04-28] AI 호출 실패 시 사용자 친화 메시지 변환.
  // raw error 문자열을 그대로 보여주면 "Error: 401 Unauthorized" 같은
  // 기술적 메시지가 노출되어 사용자 입장에서 무엇을 해야 할지 모름.
  // [2026-05-02 Roy] provider 인자 추가 — 어떤 AI 키를 어디에서 발급받아야 하는지
  // 정확히 알려주기 위함. '키 등록했는데 왜 안 됨' 혼란 차단.
  function friendlyError(err: unknown, provider?: AIProvider): string {
    const raw = String(
      err instanceof Error ? err.message :
      typeof err === 'string' ? err :
      ((err as { message?: string })?.message ?? err)
    );
    const lower = raw.toLowerCase();
    const isKo = lang === 'ko';

    // 프로바이더별 발급/콘솔 URL — 메시지에 직접 링크
    const PROVIDER_INFO: Record<AIProvider, { name: string; keyUrl: string; consoleKo: string; consoleEn: string }> = {
      openai:    { name: 'OpenAI',         keyUrl: 'https://platform.openai.com/api-keys',         consoleKo: 'OpenAI Platform', consoleEn: 'OpenAI Platform' },
      anthropic: { name: 'Anthropic',      keyUrl: 'https://console.anthropic.com/settings/keys',  consoleKo: 'Anthropic Console', consoleEn: 'Anthropic Console' },
      google:    { name: 'Google Gemini',  keyUrl: 'https://aistudio.google.com/app/apikey',       consoleKo: 'Google AI Studio', consoleEn: 'Google AI Studio' },
      deepseek:  { name: 'DeepSeek',       keyUrl: 'https://platform.deepseek.com/api_keys',       consoleKo: 'DeepSeek Platform', consoleEn: 'DeepSeek Platform' },
      groq:      { name: 'Groq',           keyUrl: 'https://console.groq.com/keys',                consoleKo: 'Groq Console', consoleEn: 'Groq Console' },
      custom:    { name: 'Custom',         keyUrl: '',                                              consoleKo: '', consoleEn: '' },
    };
    const info = provider ? PROVIDER_INFO[provider] : null;
    const providerLabel = info?.name ?? (isKo ? '선택한 AI' : 'the selected AI');

    // AbortError = 사용자가 중단한 경우 또는 timeout
    if (/abort/.test(lower)) {
      return isKo
        ? '⏱ 응답이 중단되었어요. 다시 시도하시겠어요?'
        : '⏱ The response was stopped. Try again?';
    }
    // 401 / invalid key / unauthorized — 프로바이더 명시
    if (/401|invalid.*key|unauthorized|api key/i.test(raw)) {
      if (info) {
        return isKo
          ? `🔑 **${info.name}** API 키가 유효하지 않아요.\n\n` +
            `해결 방법:\n` +
            `1. [${info.consoleKo}](${info.keyUrl})에서 키가 살아있는지(또는 만료/삭제됐는지) 확인\n` +
            `2. 필요하면 새 키 발급 → 복사 (앞뒤 공백 없이)\n` +
            `3. **설정 → API 키 관리 → ${info.name}** 칸에 붙여넣고 [테스트] 버튼으로 검증\n\n` +
            `ℹ️ Blend는 키를 브라우저에만 저장합니다. 외부로 전송하지 않아요.`
          : `🔑 Your **${info.name}** API key isn't valid.\n\n` +
            `How to fix:\n` +
            `1. Open [${info.consoleEn}](${info.keyUrl}) and confirm the key still exists\n` +
            `2. Issue a new key if needed and copy it (no leading/trailing spaces)\n` +
            `3. Paste it into **Settings → API Keys → ${info.name}** and click [Test]\n\n` +
            `ℹ️ Blend stores your key only in this browser — it's never sent anywhere else.`;
      }
      return isKo
        ? '🔑 API 키가 유효하지 않아요.\n설정 → API 키에서 다시 확인해주세요.'
        : '🔑 Your API key is invalid.\nPlease check it in Settings → API Keys.';
    }
    // 404 / model not found — 키는 OK인데 해당 모델 접근 불가
    if (/404|not[\s_-]?found|does not exist|model.*not.*available/i.test(raw)) {
      const inner = info
        ? (isKo
            ? `${info.name} 계정에 이 모델 접근 권한이 없거나, 모델이 아직 출시 전일 수 있어요.\n다른 모델을 선택하거나 [${info.consoleKo}](${info.keyUrl})에서 모델 활성화를 확인해주세요.`
            : `Your ${info.name} account may not have access to this model, or the model isn't released yet.\nPick a different model or check [${info.consoleEn}](${info.keyUrl}).`)
        : (isKo
            ? '계정에서 이 모델에 접근할 수 없어요. 다른 모델을 선택해주세요.'
            : "Your account can't access this model. Pick a different one.");
      return isKo ? `🔍 ${inner}` : `🔍 ${inner}`;
    }
    // 403 / forbidden / quota / billing
    if (/403|forbidden|insufficient.*quota|billing|payment/i.test(raw)) {
      return isKo
        ? `🚫 ${providerLabel}에서 모델 사용 권한 또는 결제 한도 문제가 발생했어요.\n프로바이더 콘솔에서 결제 상태를 확인하거나 다른 모델을 시도해주세요.`
        : `🚫 ${providerLabel} returned a permission or billing issue.\nCheck your provider console, or try a different model.`;
    }
    // 429 / rate limit
    if (/429|rate.*limit|too many|quota.*exceed/i.test(raw)) {
      return isKo
        ? `⏳ ${providerLabel} 요청 한도를 초과했어요.\n잠시 후 다시 시도하거나 다른 모델을 선택해주세요.`
        : `⏳ ${providerLabel} rate limit reached.\nWait a moment, or pick a different model.`;
    }
    // 5xx / server error
    if (/5\d{2}|server.*error|internal|service.*unavailable|bad gateway|timeout/i.test(raw)) {
      return isKo
        ? `🌐 ${providerLabel} 서비스에 일시적 문제가 있어요. 잠시 후 다시 시도해주세요.`
        : `🌐 ${providerLabel} is having a hiccup. Try again in a moment.`;
    }
    // network / fetch failed
    if (/fetch|network|failed to fetch|enotfound|econnrefused/i.test(lower)) {
      return isKo
        ? '📡 네트워크 연결을 확인하고 다시 시도해주세요.'
        : '📡 Check your internet connection and retry.';
    }
    // 정확한 원인 모름 — raw message는 보여주되 안내 추가
    return isKo
      ? `❌ ${providerLabel}에서 답변을 가져오지 못했어요.\n자세한 내용: ${raw.slice(0, 160)}\n문제가 계속되면 설정 → API 키에서 키를 다시 확인해주세요.`
      : `❌ Couldn't get a response from ${providerLabel}.\nDetails: ${raw.slice(0, 160)}\nIf this keeps happening, check your API key in Settings.`;
  }

  // [2026-04-26 Tori 16220538 §1] override — 음성 자동 전송용
  function handleSend(override?: string) {
    // [2026-04-28] 방어 코드: 호출자가 실수로 SyntheticEvent를 넘기면
    // (event).trim() TypeError로 silent crash 났던 회귀 차단.
    const overrideStr = typeof override === 'string' ? override : undefined;
    const content = (overrideStr !== undefined ? overrideStr : value).trim();
    if (!overrideStr && !canSend) return;
    if (!content && (!attachedImages || attachedImages.length === 0)) return;
    const images  = attachedImages;

    // [2026-05-02 Roy] 입력 source 캡처는 performSend 내부에서 처리 (onDone 스코프 일치).

    // v3 P0.3 — /image 명령: DALL-E 3로 이미지 생성, 응답에 markdown 이미지 인라인
    const imgPrompt = extractImagePrompt(content);

    // [2026-04-27 BUG-006 회귀 수정] 자연어 이미지 생성 자동 라우팅
    // [2026-05-01 Roy] 모델 ID 하드코딩 제거 — registry에서 동적 도출.
    // 사용자가 image gen 모델(dall-e-3, gpt-image-2 등)을 직접 선택했거나, Auto +
    // 'image_gen' 카테고리 매칭 시 image generation으로 라우팅. 사용 모델은 registry
    // 최신 버전 기준 자동 선택 (getBestImageModel) — cron이 새 모델 추가하면 따라감.
    const isAutoModel    = currentModel === 'auto';
    const isUserPickedImageModel = isImageGenModel(currentModel);
    const noAttachedImg  = !images || images.length === 0;
    const autoImagePrompt =
      !imgPrompt && (isAutoModel || isUserPickedImageModel) && noAttachedImg && content
        ? (detectCategory(content, false) === 'image_gen' ? content : null)
        : null;

    const finalImgPrompt = imgPrompt ?? autoImagePrompt;
    if (finalImgPrompt) {
      const openaiKey = getKey('openai') || '';
      if (!openaiKey) {
        setToastMsg(t.noApiKey);
        return;
      }
      // 사용자가 명시적으로 image 모델 골랐으면 그 모델 사용, 그렇지 않으면 registry-derived 최신
      const imageModel = isUserPickedImageModel ? currentModel : getBestImageModel();
      setValue('');
      setAttachedImages([]);
      const userMsg: Message = { id: Date.now().toString(), role: 'user', content };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);

      // [Tori 18644993 PR #3] image flow에 ModelAdapter 적용 — 직전 대화의 묘사를
      // English prompt로 보강 (Anthropic 키 + 모델 switch 시).
      void (async () => {
        const history = messages as unknown as Parameters<typeof adaptForImage>[0]['sessionMessages'];
        const adapt = await adaptForImage({
          sessionMessages: history,
          currentUserMessage: finalImgPrompt,
          targetModel: imageModel,
          anthropicKey: getKey('anthropic') || undefined,
          lang,
        });
        const promptToSend = adapt.finalPrompt;
        if (typeof window !== 'undefined') {
          console.info(
            '[Bridge:image]',
            adapt.reason,
            adapt.bridgeApplied ? (adapt.fromCache ? '(cache hit)' : '(Haiku call)') : '',
            `→ ${imageModel}`
          );
        }

        // [2026-05-02 Roy] OpenAI 한도/quota/rate-limit 실패 시 Google Imagen으로
        // seamless 자동 전환. 사용자에 자연스럽게 '자동 전환됨' 안내 + 이미지 결과.
        // Blend 핵심 — 한 AI 막혔다고 사용자 흐름 끊으면 안 됨.
        const tryImageWithFallback = async (): Promise<{ ok: true; res: Awaited<ReturnType<typeof generateImage>>; modelUsed: string; fallbackNote: string } | { ok: false; error: string }> => {
          // 1차: OpenAI gpt-image / dall-e
          try {
            const res = await generateImage(promptToSend, openaiKey, imageModel);
            if (!res.error) {
              const note = res.fallbackFrom
                ? (lang === 'ko'
                    ? `> ℹ️ ${res.fallbackFrom}는 OpenAI 조직 인증이 필요한 신규 모델이라, ${res.modelUsed ?? 'DALL-E 3'}로 자동 전환했어요.\n\n`
                    : `> ℹ️ ${res.fallbackFrom} requires OpenAI org verification — auto-switched to ${res.modelUsed ?? 'DALL-E 3'}.\n\n`)
                : '';
              return { ok: true, res, modelUsed: res.modelUsed ?? imageModel, fallbackNote: note };
            }
            // res.error에 quota/rate-limit/billing 단어 포함 → Gemini fallback 시도
            const errLower = String(res.error).toLowerCase();
            if (!/quota|rate|limit|billing|402|429|insufficient/.test(errLower)) {
              return { ok: false, error: res.error };
            }
            // fallthrough to Gemini
          } catch (e) {
            const msg = String((e as Error)?.message ?? e).toLowerCase();
            if (!/quota|rate|limit|billing|402|429|insufficient/.test(msg)) {
              return { ok: false, error: friendlyError(e, 'openai') };
            }
          }

          // 2차: Google Gemini Imagen (사용자가 google 키 등록했으면)
          const googleKey = getKey('google') || '';
          if (!googleKey) {
            return {
              ok: false,
              error: lang === 'ko'
                ? '🎨 OpenAI 이미지 생성 한도 초과 — Google Gemini 키도 없어 자동 전환 불가. OpenAI 콘솔에서 한도 늘리거나(platform.openai.com/settings/organization/billing/overview), 설정 → API 키에서 Google Gemini 키 등록하면 자동 전환 가능.'
                : '🎨 OpenAI image quota hit — no Google Gemini key registered for auto-fallback. Raise OpenAI quota or register a Google key in Settings → API Keys.',
            };
          }
          try {
            const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${googleKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                instances: [{ prompt: promptToSend }],
                parameters: { sampleCount: 1, aspectRatio: '1:1' },
              }),
            });
            if (!r.ok) {
              const j = await r.json().catch(() => ({}));
              return {
                ok: false,
                error: lang === 'ko'
                  ? `🎨 OpenAI 한도 초과 → Google Imagen 자동 전환 시도했지만 실패: ${j?.error?.message ?? r.status}. 잠시 후 다시 시도하거나 다른 모델 선택.`
                  : `🎨 OpenAI quota → tried Google Imagen but failed: ${j?.error?.message ?? r.status}. Retry later or pick different model.`,
              };
            }
            const json = await r.json();
            const b64 = json?.predictions?.[0]?.bytesBase64Encoded;
            if (!b64) {
              return { ok: false, error: 'Google Imagen returned empty result' };
            }
            const dataUrl = `data:image/png;base64,${b64}`;
            const note = lang === 'ko'
              ? `> 🔄 OpenAI 이미지 한도 초과 → **Google Imagen 3.0**으로 자동 전환했어요.\n\n`
              : `> 🔄 OpenAI image quota hit → auto-switched to **Google Imagen 3.0**.\n\n`;
            return {
              ok: true,
              res: { url: dataUrl, modelUsed: 'imagen-3.0-generate-002' } as Awaited<ReturnType<typeof generateImage>>,
              modelUsed: 'imagen-3.0-generate-002',
              fallbackNote: note,
            };
          } catch (e) {
            return {
              ok: false,
              error: lang === 'ko'
                ? `🎨 OpenAI 한도 초과 + Google Imagen 자동 전환 실패: ${(e as Error).message}`
                : `🎨 OpenAI quota + Google Imagen fallback failed: ${(e as Error).message}`,
            };
          }
        };

        tryImageWithFallback()
          .then((r) => {
            if (!r.ok) {
              setMessages((prev) => [...prev, {
                id: Date.now().toString() + '_err',
                role: 'assistant',
                content: r.error,
              }]);
              return;
            }
            setMessages((prev) => [...prev, {
              id: Date.now().toString() + '_img',
              role: 'assistant',
              content: `${r.fallbackNote}![${finalImgPrompt.slice(0, 80)}](${r.res.url})`,
              modelUsed: r.modelUsed,
              bridgeApplied: adapt.bridgeApplied,
              bridgeFromCache: adapt.fromCache,
            }]);
          })
        .finally(() => {
          setIsStreaming(false);
          setStreamingContent('');
        });
      })();  // close async IIFE — Bridge 전 prompt 결정 후 generateImage 호출
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

    // [2026-05-02 Roy] 이번 send의 입력 source 캡처 (performSend 내부 스코프).
    // onDone 클로저에서 sourceForThisMessage로 참조 — 'voice'면 자동 TTS 재생 (B 모드).
    const sourceForThisMessage: 'voice' | 'text' = lastUserSourceRef.current;
    lastUserSourceRef.current = 'text';

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
        .map((d) => ({ name: stripSourceTag(d.name), percent: Math.round(docStoreState.embedProgress[d.id]?.percent ?? 0) }));
      errorDocs = activeDocs
        .filter((d) => docStoreState.embedProgress[d.id]?.status === 'error')
        .map((d) => ({ name: stripSourceTag(d.name), error: docStoreState.embedProgress[d.id]?.error }));
      if (activeDocs.length > 0) {
        // Tori 17989643 PR #1 — 의도 분류 + 모드 분기
        const intent = classifyAttachmentIntent(content, lang);

        if (intent === 'full_context') {
          // 번역/요약/재구성 — 파일 전체 텍스트 주입
          const result = buildFullContext(activeDocs);
          if (result.strategy === 'inline') {
            docContext = result.context;
          } else if (result.strategy === 'chunked') {
            // 청크 단위 순차 처리는 후속 PR에서 다중 LLM 호출 구현 — 일단 첫 N 청크
            // 만 합쳐서 inline으로 처리해 사용자 좌절 차단 (단일 호출 안전선).
            const safeBlocks: string[] = [];
            let totalChars = 0;
            for (const c of result.chunks) {
              if (totalChars + c.text.length > 150_000) break;
              safeBlocks.push(`[source: ${c.source}]\n${c.text}`);
              totalChars += c.text.length;
            }
            docContext =
              `[Active sources — large file partial inline (${safeBlocks.length}/${result.chunks.length} chunks)]\n` +
              `The file is too large to inline fully (${result.totalChars.toLocaleString()} chars). Showing the first portion. ` +
              `Tell the user that some content was truncated for size, and offer to process specific sections if needed.\n\n` +
              safeBlocks.join('\n\n---\n\n');
          } else {
            // too_large
            docContext =
              `[Active sources — too large for full processing]\n` +
              `Files exceed the safe size limit (${result.totalChars.toLocaleString()} chars). ` +
              `Inform the user that the file is too large for whole-file translation/summary in one pass, ` +
              `and offer alternatives: (1) ask about specific sections, (2) split the file before uploading.`;
          }
        } else if (intent === 'metadata_only') {
          // 페이지 수 / 파일 크기 등 메타만
          docContext = buildMetadataContext(activeDocs);
        } else {
          // rag_search (기존 동작)
          const embeddingApiKey = getKey('openai') || getKey('google') || undefined;
          const embeddingProvider: 'openai' | 'google' | undefined = getKey('openai') ? 'openai' : getKey('google') ? 'google' : undefined;
          docContext = await buildContext(content, activeDocs, embeddingApiKey, embeddingProvider);
        }

        // 모드 헤더 prepend (모든 모드 공통)
        if (docContext) {
          docContext = `${getModePromptHeader(intent, lang)}\n\n---\n\n${docContext}`;
        }

        // Sources 추출 (모든 모드 공통)
        // [Tori 17989643 PR #3] 파일 ID 단위 그루핑 — chunk source가
        // "file.pdf (pages 1-3)", "file.pdf (chunk 2/6)" 등 청크 식별자를
        // 포함해서 단순 Set dedupe로는 같은 파일이 N번 중복 표시되던 회귀.
        // baseName 정규화 + count 추적으로 "file.pdf (3개 청크)" 형식 표시.
        if (docContext) {
          const matches = docContext.match(/\[source:\s*([^\]]+)\]/g) ?? [];
          const counts = new Map<string, number>();
          matches.forEach((m) => {
            const raw = m.replace(/^\[source:\s*/, '').replace(/\]$/, '').trim();
            if (!raw) return;
            // 청크 식별자 제거: " (pages 1-3)", " (rows 0-50)", " (chunk 2/6)" 등.
            // 마지막 괄호 절을 제거 (파일 이름 자체에 () 있으면 보존)
            const noChunkSuffix = raw.replace(/\s*\((?:pages|rows|chunk|warning|image)[^)]*\)\s*$/i, '');
            // 시트/섹션 구분자 제거: "file.xlsx / Sheet1" → "file.xlsx"
            const noSheetSuffix = noChunkSuffix.replace(/\s*\/\s*[^/]+$/, '');
            // NFC 정규화 + 공백 통일
            const norm = noSheetSuffix.normalize('NFC').replace(/\s+/g, ' ').trim();
            if (!norm) return;
            counts.set(norm, (counts.get(norm) ?? 0) + 1);
          });
          docSources = Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])  // 청크 많은 파일 먼저
            .slice(0, 8)
            .map(([name, count]) =>
              count > 1
                ? (lang === 'ko' ? `${name} · ${count}개 청크` : `${name} · ${count} chunks`)
                : name
            );
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

      // Tori 핫픽스 (2026-04-25, 2026-04-30 v2 정정) — 활성 데이터 소스 메타 주입
      // [2026-04-30 v2 BUG-FIX] 사용자가 "구글 드라이브의 내용을 요약해봐" 같이 특정 소스를
      //   직접 지명해 물었을 때 "구체적 내용 요약 X" 환각 답변하던 회귀.
      //   원인: dsHeader가 모든 소스를 동등하게 표기 + RAG 청크가 다른 자료에서 왔는지
      //   해당 소스에서 왔는지 구분 없음.
      //
      // 정정: 각 소스에 대해 실제로 indexed 된 문서가 몇 개인지 source-indexer의
      //   `__source:<id>/` 태그 prefix로 카운트. 이를 dsHeader에 명시:
      //     - "Google Drive (folder name) · 12 files connected · 5 indexed and searchable"
      //     - "OneDrive (folder name) · 8 files connected · 0 indexed (sync pending)"
      //   AI는 정확한 사실 기반으로 답변 가능.
      const { useDataSourceStore } = await import('@/stores/datasource-store');
      const dsList = useDataSourceStore.getState().sources.filter((s) => s.isActive !== false);
      if (dsList.length > 0) {
        // source-indexer의 `__source:<id>/<file>` 패턴으로 indexed 문서 카운트
        const allActiveDocs = (await import('@/stores/document-store'))
          .useDocumentStore.getState().getActiveDocs();
        const indexedBySource = new Map<string, number>();
        for (const d of allActiveDocs) {
          const m = (d.name || '').match(/^__source:([^/]+)\//);
          if (m) {
            indexedBySource.set(m[1], (indexedBySource.get(m[1]) ?? 0) + 1);
          }
        }

        const dsLines = dsList.map((s) => {
          const svc = s.type === 'google-drive' ? 'Google Drive'
                    : s.type === 'onedrive'     ? 'OneDrive'
                    : s.type === 'local'        ? 'Local Drive'
                    : s.type === 'webdav'       ? 'WebDAV' : s.type;
          const folder = s.name && s.name !== svc ? ` · ${s.name}` : '';
          const fileCount = typeof s.fileCount === 'number' ? ` · ${s.fileCount} files connected` : '';
          const indexed = indexedBySource.get(s.id) ?? 0;
          const indexedNote = indexed > 0
            ? ` · ${indexed} indexed and searchable`
            : (s.status === 'syncing'
                ? ' · 0 indexed (sync in progress)'
                : s.status === 'error'
                  ? ` · 0 indexed (sync error: ${s.error ?? 'unknown'})`
                  : ' · 0 indexed (run sync from Data Sources page to enable file search)');
          return `- ${svc}${folder}${fileCount}${indexedNote}`;
        }).join('\n');

        // 어떤 소스든 indexed 청크가 있는지 요약
        const totalIndexed = Array.from(indexedBySource.values()).reduce((a, b) => a + b, 0);
        const hasRagContext = docContext.length > 0;

        const dsHeader = hasRagContext && totalIndexed > 0
          // 청크 retrieve 됐고 indexed 소스 있음 → 자연스럽게 인용
          ? `[Active data sources — connected]
${dsLines}

The chunks shown below were retrieved from these sources via embedding search. Cite them inline when relevant. If the user asks specifically about a source that shows "0 indexed", explain that the connection is in place but file content needs to be synced — direct them to Data Sources page.`

          : hasRagContext
          // 청크 retrieve 됐지만 indexed 소스 0 → 청크는 다른 곳(uploaded docs / meetings)에서 옴
          ? `[Active data sources — connected, content not yet synced]
${dsLines}

⚠️ The chunks below come from directly-uploaded documents or meeting transcripts, NOT from the data sources above. If the user asks about a specific data source's content (e.g. "summarize my Google Drive"), tell them the source is connected but file content hasn't been embedded yet — and direct them to Data Sources page to sync. Don't fabricate Drive/OneDrive contents.`

          // 청크 0 + indexed 소스 0 → 연결만 되어 있음
          : `[Active data sources — connected, content not yet searchable]
${dsLines}

These data sources are connected to the user's account but file contents aren't indexed yet. For now, you can only acknowledge the connection. If the user asks about file contents, suggest they go to Data Sources page and run sync. For other questions, answer with general knowledge.`;

        docContext = docContext ? `${dsHeader}\n\n---\n\n${docContext}` : dsHeader;

        // 출처 칩에도 표시 — indexed 0인 소스는 칩에서 제외 (사용자 혼동 방지)
        dsList.forEach((s) => {
          const indexed = indexedBySource.get(s.id) ?? 0;
          if (indexed === 0) return;
          const svc = s.type === 'google-drive' ? 'Google Drive'
                    : s.type === 'onedrive' ? 'OneDrive'
                    : s.type === 'local' ? 'Local Drive' : s.type;
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
    // [2026-04-28] BUG-007 fix: 가드가 너무 경직되어 "요약해줘" 같은 합리적 요청까지
    // "Not found"로 거부하던 문제. 합성/요약은 명시적으로 허용 + 거부 조건을 좁힘.
    if (docContext) {
      const guardKo =
`[답변 가이드]
아래 [Active...] 섹션이 사용자의 활성 자료입니다. 질문에 답할 때 이 자료를 1차 지식원으로 사용하세요.

✅ 적극적으로 하세요:
- 자료를 합성·요약·설명·번역해서 답변
- "요약해줘 / 뭐야 / 알려줘 / 설명해줘" 같은 메타 요청 — 자료 청크를 종합해서 자유롭게 응답
- 출처를 인라인으로 표기: [source: 파일명], [meeting: 제목]

⚠️ 하지 마세요:
- 자료에 명시되지 않은 구체적 숫자·날짜·인용을 지어내기
- 자료에 없는 사람 이름·고유명사를 추측하기

🚫 정말 자료에 관련 정보가 0인 매우 구체적 사실 질문일 때만 "관련 정보 없음"을 명시하고, 그 다음 일반 지식으로 도움 시도.`;

      const guardEn =
`[Answer Guidance]
The [Active...] sections below are the user's activated sources. Use them as your primary knowledge source when answering.

✅ Do these freely:
- Synthesize, summarize, explain, or translate the source material
- Meta requests like "summarize / what's this / tell me about / explain" — synthesize across the chunks and respond helpfully
- Cite sources inline: [source: filename], [meeting: title]

⚠️ Don't:
- Fabricate specific numbers, dates, or quotes that aren't in the sources
- Invent proper nouns or names not present in the sources

🚫 Only refuse with "the sources don't contain that information" for narrowly factual questions where the sources truly have zero relevant content — then offer general-knowledge help as a follow-up.`;
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

    // [2026-04-28 Roy] PDF 다운로드 의도 감지 + AI 거부 차단 (trial+BYOK 공용)
    // wantsPdfDownload: 활성 문서 + "PDF로 다운로드" 매칭 시 true.
    // sanitizedMessages: AI에게 보낼 메시지에서 "PDF로 다운로드" 부분 제거
    //   (GPT-4o-mini 등이 PDF 단어 보면 alignment 자동 거부 → 순수 번역 task만 노출).
    const wantsPdfDownload = detectPdfDownloadIntent(content) && docSources.length > 0;
    const sanitizedMessages = wantsPdfDownload
      ? updatedMessages.map((m, i, arr) =>
          i === arr.length - 1 && m.role === 'user'
            ? { ...m, content: stripPdfDownloadIntent(typeof m.content === 'string' ? m.content : '') }
            : m
        )
      : updatedMessages;

    // [Tori 18644993 PR #3] Cross-Model 컨텍스트 보강 — ModelAdapter
    //  - inferTargetModelType: 모델 ID + 첨부 이미지 수 기준
    //  - text → adaptForText / vision → adaptForVision / image는 handleSend
    //    autoImagePrompt 분기에서 별도 처리 (performSend 도달 X)
    //  - Anthropic 키 없거나 같은 모델이면 silent skip (성능 영향 0)
    let bridgedMessages = sanitizedMessages;
    let bridgeApplied = false;
    let bridgeFromCache = false;
    {
      const lastUser = sanitizedMessages[sanitizedMessages.length - 1];
      const lastUserContent = typeof lastUser?.content === 'string' ? lastUser.content : content;
      const history = sanitizedMessages.slice(0, -1) as unknown as Parameters<typeof adaptForText>[0]['sessionMessages'];
      const inferredType = inferTargetModelType(effectiveModel, images?.length ?? 0);
      const adapter = inferredType === 'vision' ? adaptForVision : adaptForText;
      const adapt = await adapter({
        sessionMessages: history,
        currentUserMessage: lastUserContent,
        targetModel: effectiveModel,
        attachedImageCount: images?.length ?? 0,
        anthropicKey: getKey('anthropic') || undefined,
        lang,
        signal: controller.signal,
      });
      if (adapt.bridgeApplied) {
        bridgedMessages = sanitizedMessages.map((m, i, arr) =>
          i === arr.length - 1 && m.role === 'user'
            ? { ...m, content: adapt.finalPrompt }
            : m
        );
        bridgeApplied = true;
        bridgeFromCache = adapt.fromCache;
      }
      if (typeof window !== 'undefined') {
        console.info(
          '[Bridge]',
          adapt.reason,
          adapt.bridgeApplied ? (adapt.fromCache ? '(cache hit)' : '(Haiku call)') : '',
          '→',
          effectiveModel,
        );
      }
    }

    // ── Trial path (Gemini 2.5 Flash, no user key) ───────────────
    if (isTrialMode) {
      sendTrialMessage({
        messages: bridgedMessages.map(m => ({ role: m.role, content: m.content })),
        // [2026-05-01 Roy] trial path도 Blend identity 주입 — '블렌드가 뭐냐' 답변 일관성.
        systemPrompt: getBlendIdentityPrompt(lang),
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
            bridgeApplied,
            bridgeFromCache,
          }]);
          setIsStreaming(false);
          setStreamingContent('');
          abortRef.current = null;
          // P3.2 자동 제목 — 첫 응답 직후만 트리거
          if (messages.length === 0) triggerAutoTitle(content, fullText);
          // [2026-04-28 Roy] PDF 다운로드 자동화
          if (wantsPdfDownload && fullText.trim()) {
            triggerPdfDownload(content, fullText, docSources, lang);
          }
          // [2026-05-02 Roy] B 모드 — 음성 입력이었으면 답변 자동 재생
          maybeAutoPlay(fullText, sourceForThisMessage);
        },
        onError: (err) => {
          setMessages(prev => [...prev, {
            id: Date.now().toString() + '_err',
            role: 'assistant',
            // trial path는 Gemini 사용 — 실패해도 사용자 키와 무관하므로 provider 안 전달
            content: friendlyError(err),
          }]);
          setIsStreaming(false);
          setStreamingContent('');
          abortRef.current = null;
        },
      });
      return;
    }

    // ── Normal (BYOK) path ───────────────────────────────────────
    // [2026-04-30] FALLBACK_ORDER를 registry에서 동적 도출 — 3시간 cron이 모델 갱신하면 자동 따라감.
    // 안전망: registry가 비어있으면 (build error 등) 마지막에 알려진 최신 ID로 fallback.
    const dynamicChain = getAutoFallbackChain();
    const FALLBACK_ORDER: Array<{ provider: AIProvider; apiModel: string }> =
      dynamicChain.length > 0 ? dynamicChain : [
        { provider: 'openai',    apiModel: 'gpt-5-mini' },
        { provider: 'anthropic', apiModel: 'claude-haiku-4-5-20251001' },
        { provider: 'google',    apiModel: 'gemini-2.5-flash' },
        { provider: 'deepseek',  apiModel: 'deepseek-chat' },
        { provider: 'groq',      apiModel: 'llama-3.3-70b-versatile' },
      ];

    let resolvedProvider: AIProvider;
    let resolvedApiModel: string;
    let resolvedModelId: string;

    if (effectiveModel === 'auto') {
      // [2026-05-02 Roy] Blend 핵심 — 질문 카테고리 분석 후 최적 AI 자동 매칭.
      // 단순 'first available' 우선순위 → detectCategory + ROUTE_MAP 기반 라우팅.
      // 사용자 한 줄 → 카테고리별 우선 모델 중 키 보유 첫 번째 → 그게 답변.
      // 예: '최근 뉴스' → realtime_info → Gemini 우선 (grounding으로 Google 검색)
      //     '코딩 도와줘' → coding → Claude Opus 우선
      //     '긴 문서 요약' → long_doc → Gemini Pro 우선
      const queryText = typeof content === 'string' ? content : '';
      const category = routerDetectCategory(queryText, attachedImages.length > 0);
      const preferredModels = getCategoryPreferredModels(category);

      // 카테고리 우선 모델 중 사용자 키 보유 + AVAILABLE_MODELS 등록된 것 first.
      let picked: { provider: AIProvider; apiModel: string } | null = null;
      for (const modelId of preferredModels) {
        const provider = routerInferProvider(modelId);
        if (!provider) continue;
        if (hasKey(provider)) {
          picked = { provider, apiModel: modelId };
          break;
        }
      }
      // 카테고리 우선 모델 중 키 있는 게 없으면 generic FALLBACK_ORDER로
      if (!picked) {
        const avail = FALLBACK_ORDER.find(p => hasKey(p.provider));
        if (!avail) {
          setMessages(prev => [...prev, { id: Date.now().toString() + '_err', role: 'assistant', content: t.noApiKey }]);
          setIsStreaming(false);
          return;
        }
        picked = avail;
      }
      resolvedProvider = picked.provider;
      resolvedApiModel = picked.apiModel;
      resolvedModelId = picked.apiModel;
      // 콘솔 진단 — 어떤 카테고리 → 어떤 모델로 매칭됐는지
      if (typeof window !== 'undefined') {
        console.info(`[Blend Auto] category=${category} → ${picked.provider}/${picked.apiModel}`);
      }
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

    const pdfDownloadHeader = wantsPdfDownload
      ? (lang === 'ko'
          ? `[PDF 다운로드 자동화 안내]
사용자가 답변을 PDF로 받기를 원합니다. **Blend 플랫폼이 응답 완료 후 자동으로 PDF를 생성·다운로드합니다.**

✅ 너의 역할:
- 요청된 처리(번역/요약/재구성)를 끝까지 완수해서 본문 형태로 작성.
- "PDF를 만들 수 없습니다" 같은 거부 절대 금지 — 플랫폼이 처리함.
- 너는 텍스트 본문만 제공하면 됨.

❌ 금지:
- "기술적 제약으로 PDF 다운로드 불가" 답변 (틀림 — 자동 export 됨).
- "특정 부분만 도와줄 수 있어요" 식의 회피.`
          : `[PDF Download Automation]
The user wants this answer downloaded as PDF. **The Blend platform will automatically generate and download a PDF after your response.**

✅ Your job:
- Complete the requested processing (translation/summary/rewrite) end-to-end as the body.
- Do NOT refuse with "I can't make PDFs" — the platform handles it.
- You only provide the text body.

❌ Don't:
- "Technical limitation prevents PDF download" (false — auto-exported).
- "I can only help with parts" workarounds.`)
      : '';

    // [Tori 17989643 PR #2] 응답 언어 강제 — 모든 메시지에 lang 헤더 prepend.
    // docContext가 있으면 그 위에, 없으면 단독으로 system 메시지로 주입.
    // 한국어 사용자가 "Not found in the provided sources" 같은 영어 echo
    // 받는 회귀 차단.
    const langHeader = getLangEnforcementHeader(lang);
    // [2026-05-01 Roy] Blend identity — 모든 AI에 'Blend 서비스' 정체성 주입.
    // 사용자가 "너는 누구냐" / "블렌드가 뭐냐" 등 메타 질문하면 일관된 답변.
    const blendIdentity = getBlendIdentityPrompt(lang);

    // [2026-05-02 Roy] 선택된 이전 세션 메모리 컨텍스트 — system prompt에 주입.
    // 각 chat을 1회만 요약 (memorySummaryCache) → 후속 메시지는 캐시 재사용.
    // 길이 제한: 각 세션 800자 이하 + 헤더 + 5개 max → 토큰 부담 관리.
    let memoryContext = '';
    if (selectedMemoryIds.length > 0) {
      try {
        const summaries = await Promise.all(selectedMemoryIds.map(async (chatId) => {
          if (memorySummaryCache.current.has(chatId)) {
            return memorySummaryCache.current.get(chatId)!;
          }
          const chat = useD1ChatStore.getState().chats.find((c) => c.id === chatId);
          if (!chat || chat.messages.length === 0) return '';
          // 첫 user message + 마지막 assistant message + 중간 길이 한정 압축
          // (Haiku 요약은 비용 발생하니 일단 단순 truncate, 향후 Haiku 추가 가능)
          const transcript = chat.messages.slice(0, 30).map((m) => {
            const txt = typeof m.content === 'string' ? m.content : '';
            return `${m.role}: ${txt.slice(0, 200)}`;
          }).join('\n').slice(0, 800);
          const summary = `[${chat.title || 'Untitled'}]\n${transcript}`;
          memorySummaryCache.current.set(chatId, summary);
          return summary;
        }));
        const combined = summaries.filter(Boolean).join('\n\n---\n\n');
        if (combined) {
          memoryContext = lang === 'ko'
            ? `[이전 세션 컨텍스트 — 사용자가 명시적으로 선택해 가져온 ${selectedMemoryIds.length}개 대화입니다]\n\n${combined}\n\n[위 내용을 참조해 답변하세요. 사용자가 직접 언급하지 않으면 명시적으로 인용하지 마세요.]`
            : `[Previous session context — ${selectedMemoryIds.length} chats explicitly selected by the user]\n\n${combined}\n\n[Refer to the above when answering. Don't quote unless the user mentions it explicitly.]`;
        }
      } catch (e) {
        if (typeof window !== 'undefined') console.warn('[memory] summary build failed:', e);
      }
    }

    const systemContent = [blendIdentity, memoryContext, pdfDownloadHeader, langHeader, docContext]
      .filter(Boolean)
      .join('\n\n---\n\n');

    const apiMessages = [
      { role: 'system' as const, content: systemContent } as { role: 'system'; content: import('@/modules/chat/chat-api').MessageContent },
      ...bridgedMessages.map(m => ({ role: m.role, content: toApiContent(m) })),
    ];

    sendChatRequest({
      messages: apiMessages,
      model: resolvedApiModel,
      provider: resolvedProvider,
      apiKey: getKey(resolvedProvider),
      signal: controller.signal,
      // [2026-05-02 Roy] AI 도구 자동 사용 default ON. 사용자가 '오늘 날씨' 같은
      // 자연어 한 줄에 모델이 자체 판단으로 도구 호출. 모델/provider가 미지원이면
      // 자동 비활성 (chat-api supportsTools).
      enableTools: true,
      onToolUse: (toolName) => {
        setActiveToolName(toolName);
        // 5초 후 자동 해제 — 다음 도구 호출 또는 답변 도착으로 덮어쓰기
        setTimeout(() => setActiveToolName(null), 5000);
      },
      onChunk: (text) => {
        accumulated += text;
        setStreamingContent(accumulated);
        setActiveToolName(null); // 텍스트 chunk 도착하면 도구 indicator 해제
      },
      onDone: (fullText) => {
        setMessages(prev => [...prev, {
          id: Date.now().toString() + '_ai',
          role: 'assistant',
          content: fullText,
          modelUsed: resolvedModelId,
          sources: docSources.length ? docSources : undefined,
          bridgeApplied,
          bridgeFromCache,
        }]);
        setIsStreaming(false);
        setStreamingContent('');
        setActiveToolName(null);
        abortRef.current = null;
        // [2026-05-02 Roy] usage 트래킹은 chat-api.ts 내부에서 자동 처리.
        // 여기서 또 호출하면 이중 누적되니 제거.
        // P3.2 자동 제목 — 첫 응답 직후만 트리거
        if (messages.length === 0) triggerAutoTitle(content, fullText);
        // [2026-04-28 Roy] PDF 다운로드 자동화
        if (wantsPdfDownload && fullText.trim()) {
          triggerPdfDownload(content, fullText, docSources, lang);
        }
        // [2026-05-02 Roy] B 모드 — 음성 입력이었으면 답변 자동 재생
        maybeAutoPlay(fullText, sourceForThisMessage);
      },
      onError: (err) => {
        setMessages(prev => [...prev, {
          id: Date.now().toString() + '_err',
          role: 'assistant',
          // [2026-05-02 Roy] resolvedProvider 전달 — 어떤 AI 키 문제인지 정확히 안내.
          content: friendlyError(err, resolvedProvider),
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
    setActiveToolName(null);
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
          {/* [2026-05-02 Roy] TTS 마스터 토글은 헤더가 아닌 입력바로 이동 (마이크
              아이콘 옆). 헤더 정리. */}
          <D1IconButton
            title={lang === 'ko' ? '새 채팅' : 'New chat'}
            onClick={() => {
              setActiveChatId(null);
              setMessages([]);
              setValue('');
              // [2026-05-02 Roy] 새 채팅 시 TTS 카운터 리셋 (50회/채팅 한도)
              setTtsCount(0);
              if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
              // [2026-05-02 Roy] 메모리 선택 자동 초기화 — 새 채팅마다 다시 선택해야 함
              useD1MemoryStore.getState().clear();
              memorySummaryCache.current.clear();
            }}
          >
            <PlusIcon />
          </D1IconButton>
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
            {/* [2026-05-02 Roy] AI 도구 사용 indicator — 'weather/calculator/...' 도구
                실행 중. streaming 텍스트 시작하기 전 단계 시각 표시. */}
            {isStreaming && activeToolName && (
              <div className="mt-2 flex items-center gap-2 text-[12.5px]" style={{ color: tokens.textDim, animation: 'd1-rise 240ms cubic-bezier(0.16,1,0.3,1) both' }}>
                <span aria-hidden>🔧</span>
                <span>
                  {lang === 'en' ? `Using ${activeToolName} tool…` : `${TOOL_LABEL_KO[activeToolName] ?? activeToolName} 도구 사용 중…`}
                </span>
              </div>
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
              <D1RagProgressBanner lang={lang} />
              <ActiveSourcesBar
                lang={lang}
                onNavigate={(source) => {
                  // [2026-04-26 QA-BUG-A] chip type별 view 분기. 이전엔 모든 chip이 documents view로만 이동.
                  const view =
                    source.type === 'meeting' ? 'meeting'
                    : source.type === 'datasource-folder' ? 'datasources'
                    : 'documents';
                  window.dispatchEvent(new CustomEvent('d1:nav-to', { detail: { view } }));
                }}
                onShowToast={showToast}
              />
            </div>
            {selectedMemoryIds.length > 0 && (
              <D1MemoryChipsBar
                lang={lang}
                selectedIds={selectedMemoryIds}
                chats={chatSummaries}
                onRemove={toggleMemoryChat}
                onClearAll={() => { useD1MemoryStore.getState().clear(); memorySummaryCache.current.clear(); }}
              />
            )}
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
              onVoiceError={(msg) => { setToastMsg(msg); setTimeout(() => setToastMsg(null), 4500); }}
              onAskBlend={() => handleSend(BLEND_INTRO_QUESTION[lang])}
              onVoiceUsed={() => { lastUserSourceRef.current = 'voice'; }}
              ttsActive={ttsEnabled}
              onToggleTts={handleToggleTts}
              ttsCount={ttsCount}
              ttsLimit={TTS_LIMIT}
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
            <D1RagProgressBanner lang={lang} />
            <ActiveSourcesBar
              lang={lang}
              onNavigate={() => window.dispatchEvent(new CustomEvent('d1:nav-documents'))}
              onShowToast={showToast}
            />
            {/* [2026-05-02 Roy] 선택된 이전 세션 chips — 입력바 바로 위. 새 세션
                시작 시 자동 비워짐. × 클릭으로 개별 제거. */}
            {selectedMemoryIds.length > 0 && (
              <D1MemoryChipsBar
                lang={lang}
                selectedIds={selectedMemoryIds}
                chats={chatSummaries}
                onRemove={toggleMemoryChat}
                onClearAll={() => { useD1MemoryStore.getState().clear(); memorySummaryCache.current.clear(); }}
              />
            )}
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
              onVoiceError={(msg) => { setToastMsg(msg); setTimeout(() => setToastMsg(null), 4500); }}
              onAskBlend={() => handleSend(BLEND_INTRO_QUESTION[lang])}
              onVoiceUsed={() => { lastUserSourceRef.current = 'voice'; }}
              ttsActive={ttsEnabled}
              onToggleTts={handleToggleTts}
              ttsCount={ttsCount}
              ttsLimit={TTS_LIMIT}
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

      {/* [2026-05-02 Roy] TTS 품질 첫 사용 모달 — '프리미엄' / '표준' 선택 */}
      {showTtsQualityModal && (
        <D1TtsQualityModal
          lang={lang}
          onChoose={(q) => setTtsQualityAndPersist(q)}
          onClose={() => setShowTtsQualityModal(false)}
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
        selectedMemoryIds={selectedMemoryIds}
        onToggleMemory={toggleMemoryChat}
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
  tryAnother: string;
};

// [2026-05-02 Roy] 선택된 이전 세션 chips — 입력바 위에 작은 행으로 표시.
// 사용자가 history-overlay에서 선택한 chat들의 제목을 보여주고 × 클릭으로 개별 제거.
// '모두 지우기' 버튼으로 한 번에 정리 가능. 새 채팅 시작 시 자동 비워짐 (부모 reset).
function D1MemoryChipsBar({
  lang,
  selectedIds,
  chats,
  onRemove,
  onClearAll,
}: {
  lang: 'ko' | 'en';
  selectedIds: string[];
  chats: ChatSummary[];
  onRemove: (id: string) => void;
  onClearAll: () => void;
}) {
  const items = selectedIds
    .map((id) => chats.find((c) => c.id === id))
    .filter((c): c is ChatSummary => !!c);
  if (items.length === 0) return null;
  return (
    <div className="mx-auto mb-2 flex w-full max-w-[720px] flex-wrap items-center gap-1.5 px-1">
      <span className="text-[12px]" style={{ color: tokens.textDim }}>
        {lang === 'ko' ? '🧠 기억 중:' : '🧠 Remembering:'}
      </span>
      {items.map((c) => (
        <span
          key={c.id}
          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px]"
          style={{ background: '#FEF3C7', borderColor: '#FCD34D', color: '#854D0E' }}
        >
          <span className="max-w-[180px] truncate">{c.title || (lang === 'ko' ? '제목 없음' : 'Untitled')}</span>
          <button
            onClick={() => onRemove(c.id)}
            className="ml-0.5 rounded-full px-1 transition-opacity hover:opacity-70"
            aria-label="remove"
            style={{ color: '#854D0E' }}
          >
            ×
          </button>
        </span>
      ))}
      {items.length > 1 && (
        <button
          onClick={onClearAll}
          className="text-[11.5px] underline transition-opacity hover:opacity-70"
          style={{ color: tokens.textFaint }}
        >
          {lang === 'ko' ? '모두 지우기' : 'Clear all'}
        </button>
      )}
    </div>
  );
}

function D1MessageRow({ message, lang, t, onTryAnother, onFork, onShare }: {
  message: Message; lang: Lang; t: CopyObj;
  onTryAnother: (newModel?: string) => void;
  onFork?: () => void; onShare?: () => void;
}) {
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
      bridgeApplied={message.bridgeApplied}
      bridgeFromCache={message.bridgeFromCache}
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
  // [2026-05-02 Roy] totalTokens/cost는 props로 유지(상위 호출 호환)하지만
  // 현재 UI에서는 미사용. 좌측 'Message meta footer' 제거하면서 정리.
  // 별도 패널에서 다시 노출할 가능성 있어 prop 시그니처 유지.
  totalTokens: _totalTokens,
  cost: _cost,
  sources,
  bridgeApplied,
  bridgeFromCache,
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
  bridgeApplied?: boolean;
  bridgeFromCache?: boolean;
  lang: Lang;
  t: CopyObj;
  onTryAnother?: (newModel?: string) => void;
  onFork?: () => void;
  onShare?: () => void;
  // [2026-05-02 Roy] per-message TTS 버튼 제거 — 입력바 마스터 토글로만 제어.
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
          // [2026-05-02 Roy] 모바일 액션 바 가시성 수정 +
          // 데스크톱 모델명 중복 제거.
          // 이전: opacity-0 + group-hover:opacity-100 → hover 없는 모바일에서 영구 invisible.
          // 신규: 항상 회색(textFaint)으로 표시, hover 시 약간 진하게.
          // 표시 항목: 복사, 공유, 답변 AI(우측), 다른 AI로
          //   ↳ '다시 생성' 버튼은 2026-05-02 Roy 결정으로 제거 — '다른 AI로' +
          //     자동 fallback이 동일 역할을 더 똑똑하게 처리.
          //   ↳ 좌측 'Message meta footer'(모델·토큰·비용) + 우측 modelUsed 모델명
          //     중복 회귀 → 좌측 footer 제거, 우측만 유지.
          <div className="mt-3 flex flex-wrap items-center gap-1" style={{ color: tokens.textFaint }}>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] transition-colors hover:bg-black/5 hover:text-current"
              style={{ color: 'inherit' }}
              title={t.copy}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? t.copied : t.copy}
            </button>
            {/* [2026-05-02 Roy] '다시 생성' 버튼 제거 — 불필요한 기능. '다른 AI로'
                재생성 + 자동 fallback이 같은 역할을 더 똑똑하게 처리.
                per-message '듣기' 버튼도 제거 — Roy 결정으로 입력바 마스터 토글 ON/OFF만
                사용 (모든 답변 자동 재생 또는 전부 비활성). */}

            {/* [2026-04-26] Sprint 3 (16384367) — Share button */}
            {onShare && (
              <button
                onClick={onShare}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] transition-colors hover:bg-black/5"
                style={{ color: 'inherit' }}
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

            {/* [Tori 18644993 PR #5] Cross-Model Bridge Badge — 이전 대화 참조 시 표시 */}
            {bridgeApplied && (
              <span
                className="ml-1 inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10.5px]"
                style={{
                  background: tokens.accentSoft,
                  color: tokens.accent,
                  fontWeight: 500,
                }}
                title={
                  lang === 'ko'
                    ? `이전 대화의 컨텍스트를 자동으로 참조해서 답변했어요${bridgeFromCache ? ' (캐시 hit)' : ''}`
                    : `Previous conversation context was automatically used${bridgeFromCache ? ' (cache hit)' : ''}`
                }
              >
                ✨ {lang === 'ko' ? '이전 대화 참조' : 'Previous context'}
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
              <div ref={pickerRef} className="relative ml-auto flex items-center gap-2">
                {/* [2026-05-02 Roy] 답변한 AI 모델명 표시 — '다른 AI로' 버튼 왼쪽.
                    Auto 라우팅 시 사용자가 어떤 AI가 답변했는지 즉시 인지 가능. */}
                {modelUsed && (
                  <span
                    className="inline-flex items-center gap-1 text-[11.5px]"
                    style={{ color: 'inherit' }}
                    title={lang === 'ko' ? '이 답변을 생성한 AI' : 'AI that generated this response'}
                  >
                    <span
                      aria-hidden
                      className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
                      style={{ background: modelInfo ? (BRAND_COLORS[modelInfo.brand] ?? tokens.accent) : tokens.accent }}
                    />
                    {modelInfo?.name ?? modelUsed}
                  </span>
                )}
                <button
                  onClick={() => setShowModelPicker((v) => !v)}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] transition-colors hover:bg-black/5"
                  style={{ color: 'inherit' }}
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
  onVoiceError,
  onAskBlend,
  onVoiceUsed,
  ttsActive,
  onToggleTts,
  ttsCount,
  ttsLimit,
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
  onVoiceError?: (msg: string) => void;
  // [2026-05-01 Roy] '블렌드 서비스란?' 칩 — 클릭 시 BLEND_INTRO_QUESTION 자동 전송
  onAskBlend?: () => void;
  // [2026-05-02 Roy] 마이크로 음성 입력될 때 신호 — 부모가 lastUserSourceRef='voice'로
  // 표시. 다음 답변 끝나면 자동 TTS 재생 트리거.
  onVoiceUsed?: () => void;
  // [2026-05-02 Roy] TTS 마스터 토글 — '블렌드란?' 왼쪽 위치. 부모가 상태 관리.
  ttsActive?: boolean;
  onToggleTts?: () => void;
  ttsCount?: number;
  ttsLimit?: number;
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
      // [2026-05-02 Roy] 부모에 voice 입력 사용 시그널 — 답변 끝나면 자동 TTS.
      onVoiceUsed?.();
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
              onError={onVoiceError}
              disabled={isStreaming}
              lang={lang}
            />
          )}
          {/* [2026-05-02 Roy] TTS 마스터 토글 — 마이크 옆, '블렌드란?' 왼쪽.
              ON이면 모든 답변 자동 음성 재생, OFF면 비활성. localStorage 영구 보존
              (새 세션에서도 유지). 50/채팅 한도 도달 시 회색 비활성. */}
          {onToggleTts && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); onToggleTts(); }}
              disabled={isStreaming || (ttsCount !== undefined && ttsCount >= ttsLimit!)}
              className="ml-0.5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                // [2026-05-02 Roy] ON일 때 연한 파랑(soft blue, sky-100) — 메모리(노랑)와
                // 시각 구분. accent(orange)와도 구분. 음성 = 파랑, 메모리 = 노랑 의미 분리.
                background: ttsActive ? '#DBEAFE' : 'transparent',
                color:      ttsActive ? '#1E40AF' : 'var(--d1-text-dim)',
                border:     ttsActive ? '1px solid #93C5FD' : '1px solid var(--d1-border-strong)',
              }}
              title={
                ttsCount !== undefined && ttsCount >= ttsLimit!
                  ? (lang === 'ko' ? `이번 채팅 음성 한도(${ttsLimit})` : `Voice limit reached`)
                  : ttsActive
                    ? (lang === 'ko' ? '음성 답변 끄기' : 'Turn off voice')
                    : (lang === 'ko' ? '음성 답변 켜기' : 'Turn on voice')
              }
            >
              {ttsActive ? <SpeakerOnIcon /> : <SpeakerOffIcon />}
              {ttsActive && ttsCount !== undefined && (
                <span className="text-[11px] tabular-nums">
                  {ttsCount}/{ttsLimit}
                </span>
              )}
            </button>
          )}
          {/* [2026-05-01 Roy] '블렌드 서비스란?' 칩 — 음성 버튼 오른쪽.
              클릭 시 BLEND_INTRO_QUESTION을 자동 전송해 Blend 소개 답변을 받음. */}
          {onAskBlend && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); onAskBlend(); }}
              disabled={isStreaming}
              className="ml-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: 'var(--d1-accent-soft)',
                color: 'var(--d1-accent)',
                border: `1px solid var(--d1-accent-mid)`,
              }}
              title={lang === 'en' ? 'About Blend' : '블렌드 서비스 소개'}
            >
              <span aria-hidden>✦</span>
              {lang === 'en' ? 'What is Blend?' : '블렌드란?'}
            </button>
          )}
        </div>
        <button
          onClick={(e) => {
            // [2026-04-28] 버그 수정: onClick은 SyntheticEvent를 인자로 넘겨주는데
            // onSend === handleSend(override?: string)라서 event 객체가 override 자리에
            //들어가 (event).trim() TypeError로 silent fail. Enter 키는 handleSend()
            // (인자 없이) 호출이라 정상 동작 → "엔터만 됨" 증상의 원인.
            // 명시적으로 인자 없이 호출.
            e.preventDefault();
            if (isStreaming) onStop();
            else onSend();
          }}
          type="button"
          disabled={!isStreaming && !canSend}
          // [2026-05-02 Roy] isStreaming 시 'd1-pulse-morph' 애니메이션 — 버튼이
          // 일그러지며 brething → '답변 준비 중' 시각 피드백. 정적 버튼이라 사용자가
          // 'stuck/버그'로 오인하던 문제 해결. globals.css에 keyframe 정의.
          className={`flex h-[34px] w-[34px] items-center justify-center rounded-full border-none hover:-translate-y-px disabled:cursor-not-allowed disabled:translate-y-0 ${isStreaming ? 'd1-pulse-morph' : 'transition-[transform,background] duration-150'}`}
          style={{
            background: isStreaming ? tokens.accent : canSend ? tokens.text : tokens.borderStrong,
            color: isStreaming || canSend ? tokens.bg : tokens.textFaint,
          }}
          title={isStreaming ? (lang === 'en' ? 'Generating… click to stop' : '답변 준비 중… 클릭하면 중지') : sendLabel}
          aria-label={isStreaming ? (lang === 'en' ? 'Generating, click to stop' : '답변 준비 중, 클릭하면 중지') : sendLabel}
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
function PlusIcon()     { return <svg {...iconProps}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>; }
function ShareIcon()    { return <svg {...iconProps}><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><path d="m16 6-4-4-4 4" /><path d="M12 2v13" /></svg>; }
function AttachIcon()   { return <svg {...iconProps}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 17.93 8.8l-8.58 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>; }
function MicIcon()      { return <svg {...iconProps}><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" /></svg>; }
function SendIcon()     { return <svg {...iconProps}><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></svg>; }
function StopIcon()     { return <svg {...iconProps}><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" /></svg>; }
function CopyIcon()     { return <svg {...iconProps} width={13} height={13}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>; }
function CheckIcon()    { return <svg {...iconProps} width={13} height={13} style={{ color: tokens.accent }}><path d="M20 6 9 17l-5-5" /></svg>; }
function RefreshIcon()  { return <svg {...iconProps} width={13} height={13}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M3 21v-5h5" /></svg>; }
// [2026-05-02 Roy] TTS toggle icons — speaker ON / OFF (이모지 사용 금지 결정).
function SpeakerOnIcon() { return <svg {...iconProps} width={14} height={14}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></svg>; }
function SpeakerOffIcon() { return <svg {...iconProps} width={14} height={14}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="22" y1="9" x2="16" y2="15" /><line x1="16" y1="9" x2="22" y2="15" /></svg>; }
