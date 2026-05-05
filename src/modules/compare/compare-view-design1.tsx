'use client';

/**
 * D1CompareView — Design1 Compare view
 * "여러 AI에게 같은 질문, 한 번에."
 *
 * Self-contained (no shared chat-store). Local state only.
 * Design tokens 100% identical to chat-view-design1.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAPIKeyStore } from '@/stores/api-key-store';
import { sendChatRequest } from '@/modules/chat/chat-api';
// [2026-05-05 PM-30 Roy] 단일 통화 표시 — lang별 ₩/$/₱ (xe.com 매월 1일 환율).
import { getCurrentFxRates } from '@/lib/currency';
import { sendTrialMessage, TRIAL_KEY_AVAILABLE } from '@/modules/chat/trial-gemini-client';
import { useTrialStore } from '@/stores/trial-store';
import {
  getFeaturedModels,
  FEATURED_PROVIDER_ORDER,
  PROVIDER_LABELS,
  isTrialModel,
  type ProviderId,
} from '@/data/available-models';
import type { AIProvider } from '@/types';

// ── Design tokens (same as chat-view-design1) ───────────────────
const tokens = {
  bg:           'var(--d1-bg)',
  surface:      'var(--d1-surface)',
  surfaceAlt:   'var(--d1-surface-alt)',
  text:         'var(--d1-text)',
  textDim:      'var(--d1-text-dim)',
  textFaint:    'var(--d1-text-faint)',
  accent:       'var(--d1-accent)',
  accentSoft:   'var(--d1-accent-soft)',
  border:       'var(--d1-border)',
  borderStrong: 'var(--d1-border-strong)',
} as const;

const BRAND_COLORS: Record<string, string> = {
  openai:    '#10a37f',
  anthropic: '#d97757',
  google:    '#4285f4',
  deepseek:  '#4B5EFC',
  groq:      '#f55036',
};

// ── Copy ─────────────────────────────────────────────────────────
const copy = {
  ko: {
    title:          '모델 비교',
    subtitle:       '여러 AI에게 같은 질문, 한 번에.',
    selectGuide:    '비교할 모델 선택 (2~3개)',
    placeholder:    '모든 선택된 모델에게 질문하세요',
    continueInChat: '채팅으로',
    regen:          '다시 생성',
    maxToast:       '최대 3개까지 비교 가능해요',
    newCompare:     '새 비교',
    streaming:      '응답 중…',
    noKey:          'API 키 없음',
    trialBadge:     '체험',
    send:           '보내기',
    selectFirst:    '먼저 모델을 2개 이상 선택하세요',
  },
  en: {
    title:          'Compare Models',
    subtitle:       'Ask many AIs the same question.',
    selectGuide:    'Pick models to compare (2–3)',
    placeholder:    'Ask all selected models',
    continueInChat: 'Continue in chat',
    regen:          'Regenerate',
    maxToast:       'Up to 3 models',
    newCompare:     'New comparison',
    streaming:      'Responding…',
    noKey:          'No API key',
    trialBadge:     'Trial',
    send:           'Send',
    selectFirst:    'Select at least 2 models first',
  },
} as const;

// ── Model list (from registry, filtered) ─────────────────────────
type ModelEntry = {
  id:        string;
  name:      string;
  provider:  ProviderId;
  apiProv:   AIProvider;
  desc_ko:   string;
  desc_en:   string;
  isTrial:   boolean;
};

const MODELS: ModelEntry[] = getFeaturedModels()
  .filter((m) => !m.deprecated)
  .map((m): ModelEntry => ({
    id:       m.id,
    name:     m.displayName,
    provider: m.provider,
    apiProv:  m.provider as AIProvider,
    desc_ko:  m.description_ko,
    desc_en:  m.description_en,
    isTrial:  isTrialModel(m.id),
  }));

const MODELS_BY_PROVIDER: Partial<Record<ProviderId, ModelEntry[]>> = {};
for (const m of MODELS) {
  if (!MODELS_BY_PROVIDER[m.provider]) MODELS_BY_PROVIDER[m.provider] = [];
  MODELS_BY_PROVIDER[m.provider]!.push(m);
}

// IMP-026: 정적 PRICE 테이블은 fallback. provider/tier 기반 휴리스틱으로 신규 모델 자동 추정.
// 향후 AVAILABLE_MODELS에 priceInput/priceOutput 필드 추가 시 그 값 우선 사용.
const PRICE_PER_1M: Record<string, number> = {
  'gpt-5.4':                 2.5,
  'gpt-5.4-mini':            0.15,
  'gpt-4o':                  2.5,
  'gpt-4o-mini':             0.15,
  'claude-opus-4-7':        15.0,
  'claude-sonnet-4-6':       3.0,
  'claude-haiku-4-5':        0.25,
  'gemini-2.5-flash':        0.0,
  'gemini-3.1-pro':          1.25,
  'deepseek-chat':           0.27,
  'deepseek-reasoner':       0.55,
  'llama-3.3-70b-versatile': 0.59,
};

function inferPricePer1M(modelId: string): number {
  // Hit table first
  if (PRICE_PER_1M[modelId] !== undefined) return PRICE_PER_1M[modelId];

  const id = modelId.toLowerCase();
  // Anthropic
  if (id.startsWith('claude')) {
    if (id.includes('opus'))   return 15.0;
    if (id.includes('sonnet')) return 3.0;
    if (id.includes('haiku'))  return 0.25;
    return 3.0;
  }
  // OpenAI
  if (id.startsWith('gpt') || id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4')) {
    if (id.includes('mini') || id.includes('nano')) return 0.15;
    if (id.startsWith('o1') || id.startsWith('o3')) return 15.0; // reasoning class
    return 2.5;
  }
  // Google
  if (id.startsWith('gemini') || id.startsWith('gemma')) {
    if (id.includes('flash') || id.includes('lite')) return 0.0;
    if (id.includes('pro'))                          return 1.25;
    return 0.5;
  }
  // DeepSeek
  if (id.startsWith('deepseek')) {
    if (id.includes('reasoner')) return 0.55;
    return 0.27;
  }
  // Groq (Llama, Mixtral) — typically very low
  if (id.includes('llama') || id.includes('mixtral')) return 0.59;
  return 1.0;
}

function estimateCost(modelId: string, totalTokens: number): number {
  return (inferPricePer1M(modelId) / 1_000_000) * totalTokens;
}

// [2026-05-05 PM-30 Roy] 단일 통화 표시 — lang별 ₩/$/₱.
// 환율 src/lib/currency.ts (매월 1일 xe.com 기준).
function formatKRW(usd: number | undefined, lang: 'ko' | 'en' | 'ph'): string {
  if (usd === undefined || usd === 0) return '';
  if (lang === 'en') return usd < 0.001 ? '<$0.001' : `$${usd.toFixed(3)}`;
  const fx = getCurrentFxRates();
  if (lang === 'ph') {
    const php = Math.ceil(usd * fx.phpPerUsd);
    if (php < 1) return '<₱1';
    return `₱${php.toLocaleString('en-PH')}`;
  }
  // ko
  const krw = Math.ceil(usd * fx.krwPerUsd);
  if (krw < 1) return '<₩1';
  return `₩${krw.toLocaleString()}`;
}

function formatTokens(count: number | undefined, lang: 'ko' | 'en' | 'ph'): string {
  if (!count) return '';
  if (count >= 1000) {
    return lang === 'ko'
      ? `${(count / 1000).toFixed(1)}K토큰`
      : `${(count / 1000).toFixed(1)}K tok`;
  }
  return lang === 'ko' ? `${count}토큰` : `${count} tok`;
}

// ── Column state ─────────────────────────────────────────────────
type ColumnState = {
  modelId:    string;
  content:    string;
  isStreaming: boolean;
  done:       boolean;
  tokens?:    number;
  cost?:      number;
  error?:     string;
};

// ── Main component ────────────────────────────────────────────────
export default function D1CompareView({
  lang,
  onContinueInChat,
}: {
  lang: 'ko' | 'en' | 'ph';
  onContinueInChat?: (modelId: string) => void;
}) {
  const t = lang === 'ko' ? copy.ko : copy.en;
  const { getKey, hasKey } = useAPIKeyStore();
  const { dailyCount, maxPerDay, resetIfNewDay } = useTrialStore();

  useEffect(() => { resetIfNewDay(); }, [resetIfNewDay]);

  const trialRemaining = Math.max(0, maxPerDay - dailyCount);

  const [selectedIds,  setSelectedIds]  = useState<string[]>([]);
  const [inputValue,   setInputValue]   = useState('');
  const [session,      setSession]      = useState<{
    question: string;
    columns:  ColumnState[];
  } | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const colContentRef = useRef<Record<string, string>>({});
  const abortRefs     = useRef<Record<string, AbortController>>({});
  const inputRef      = useRef<HTMLTextAreaElement>(null);

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  }

  function toggleModel(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) {
        showToast(t.maxToast);
        return [...prev.slice(1), id]; // drop oldest
      }
      return [...prev, id];
    });
  }

  const canSend = selectedIds.length >= 2 && inputValue.trim().length > 0;

  // ── Stream one model ─────────────────────────────────────────
  // [2026-05-04 Roy #12] Compare 모든 모델에 friendlyError + auto retry 적용.
  // chat-api는 onError로 raw err.message를 던짐 → 사용자에게 'OpenAI API error: 429'
  // 같은 raw 노출. 카테고리 정규식으로 친절 변환 + 일시 장애(rate/network/5xx)는
  // 자동 1회 retry. provider 무관 동일 처리.
  const streamOneModel = useCallback(async (modelId: string, question: string, attempt = 0) => {
    const model = MODELS.find((m) => m.id === modelId);
    if (!model) return;

    abortRefs.current[modelId]?.abort();
    const abort = new AbortController();
    abortRefs.current[modelId] = abort;

    const isTrialGemini =
      model.isTrial &&
      !hasKey('google') &&
      TRIAL_KEY_AVAILABLE &&
      trialRemaining > 0;

    const apiKey = getKey(model.apiProv);

    if (!isTrialGemini && !apiKey) {
      setSession((prev) => prev && ({
        ...prev,
        columns: prev.columns.map((c) =>
          c.modelId === modelId
            ? { ...c, isStreaming: false, done: true, error: t.noKey }
            : c,
        ),
      }));
      return;
    }

    const appendChunk = (chunk: string) => {
      colContentRef.current[modelId] =
        (colContentRef.current[modelId] ?? '') + chunk;
      const snapshot = colContentRef.current[modelId];
      setSession((prev) =>
        prev
          ? {
              ...prev,
              columns: prev.columns.map((c) =>
                c.modelId === modelId ? { ...c, content: snapshot } : c,
              ),
            }
          : prev,
      );
    };

    const finalize = (full: string, tokens?: number, cost?: number) => {
      setSession((prev) =>
        prev
          ? {
              ...prev,
              columns: prev.columns.map((c) =>
                c.modelId === modelId
                  ? { ...c, content: full, isStreaming: false, done: true, tokens, cost }
                  : c,
              ),
            }
          : prev,
      );
    };

    const markError = (err: string) => {
      setSession((prev) =>
        prev
          ? {
              ...prev,
              columns: prev.columns.map((c) =>
                c.modelId === modelId
                  ? { ...c, isStreaming: false, done: true, error: err }
                  : c,
              ),
            }
          : prev,
      );
    };

    // 일시 장애만 자동 재시도 — 인증/권한/모델 오류는 사용자 행동 필요라 재시도 무의미.
    const RETRYABLE = /429|rate.?limit|quota|timeout|timed out|aborted|fetch|network|load failed|connection|5\d\d|server.*error|service unavailable|overloaded/i;
    const friendlyCompareError = (raw: string): string => {
      const e = (raw ?? '').toLowerCase();
      const ko = lang === 'ko';
      // [2026-05-05 PM-33 Roy] Gemini "API key not valid" 패턴 보강 (PM-26 meeting-runner와 동일).
      if (/401|unauthorized|invalid.*api.?key|incorrect.*api.?key|invalid.*key|key.?not.?valid|not.?valid.*key|api_key_invalid|authentication.?error/.test(e)) {
        return ko
          ? '🔑 API 키가 올바르지 않아요. 설정 → API 키에서 다시 확인해주세요.'
          : '🔑 Invalid API key. Re-enter in Settings → API keys.';
      }
      if (/403|forbidden|verify|verification.required|permission.?denied/.test(e)) {
        return ko
          ? '🚫 이 모델 접근 권한이 없어요. 일부 모델은 organization 인증 필요.'
          : '🚫 No access to this model. Some require org verification.';
      }
      // [2026-05-05 PM-33 Roy] OpenAI Reasoning 모델 (gpt-5.5-pro 등)은 v1/chat/completions
      // 미지원 — v1/responses endpoint 필요. Compare에선 chat completions 호출이라 실패.
      if (/not.?a.?chat.?model|not.?supported.*chat\.?completions|v1.?responses|reasoning.?model.*not.?supported/.test(e)) {
        return ko
          ? '⚙️ 이 모델은 채팅 비교에 사용할 수 없어요. OpenAI Reasoning 모델(o1/o3/gpt-5.5-pro 등)은 별도 endpoint 사용 — 다른 모델을 선택해주세요.'
          : '⚙️ This model is not supported in chat comparison. OpenAI Reasoning models (o1/o3/gpt-5.5-pro etc.) use a separate endpoint — pick another.';
      }
      if (/429|rate.?limit|quota/.test(e)) {
        return ko
          ? '⚠️ 호출 한도 초과. 자동으로 한 번 더 시도했지만 실패. 잠시 후 다시 시도해주세요.'
          : '⚠️ Rate limit. Auto-retried once. Try again in a moment.';
      }
      if (/404|not.found|model.*not.*found|deprecated|unsupported/.test(e)) {
        return ko
          ? '⏳ 이 모델은 더 이상 사용할 수 없어요. 다른 모델을 선택해주세요.'
          : '⏳ Model unavailable. Pick another model.';
      }
      if (/network|fetch|load failed|connection|timeout|timed out|aborted/.test(e)) {
        return ko
          ? '📡 네트워크가 잠시 끊겼어요. 자동 재시도도 실패. 다시 시도해주세요.'
          : '📡 Network dropped. Auto-retry also failed. Try again.';
      }
      if (/5\d\d|server.*error|internal|service unavailable|overloaded/.test(e)) {
        return ko
          ? '🔧 서버 일시 장애. 자동 재시도 실패. 잠시 후 다시 시도해주세요.'
          : '🔧 Server hiccup. Auto-retry failed. Retry shortly.';
      }
      if (/content.*polic|safety|harmful|moderation/.test(e)) {
        return ko
          ? '🛡 컨텐츠 정책 차단. 질문을 다듬어 다시 시도해주세요.'
          : '🛡 Content policy blocked. Refine the prompt and try again.';
      }
      if (/billing|payment|insufficient/.test(e)) {
        return ko
          ? '💳 결제/잔액 문제로 호출 거부. provider 콘솔에서 확인.'
          : '💳 Billing/quota issue. Check the provider console.';
      }
      // generic — raw도 노출 (디버깅 단서). 너무 길면 잘라서.
      const short = (raw ?? '').slice(0, 140);
      return ko
        ? `❗ 응답 실패. ${short}`
        : `❗ Request failed. ${short}`;
    };

    const handleErr = (raw: string) => {
      // RETRYABLE 카테고리이고 첫 시도면 자동 재시도.
      if (attempt === 0 && RETRYABLE.test(raw ?? '')) {
        // 약간의 backoff (300ms) 후 재시도.
        setTimeout(() => streamOneModel(modelId, question, 1), 300);
        return;
      }
      markError(friendlyCompareError(raw));
    };

    if (isTrialGemini) {
      await sendTrialMessage({
        messages: [{ role: 'user', content: question }],
        onChunk:  appendChunk,
        onDone:   (full) => finalize(full),
        onError:  (e) => handleErr(e.message),
        signal:   abort.signal,
      });
    } else {
      await sendChatRequest({
        messages:  [{ role: 'user', content: question }],
        model:     model.id,
        provider:  model.apiProv,
        apiKey:    apiKey!,
        onChunk:   appendChunk,
        onDone:    (full, usage) => {
          const totalTok = (usage?.input ?? 0) + (usage?.output ?? 0);
          finalize(full, totalTok || undefined, estimateCost(modelId, totalTok));
        },
        onError:   handleErr,
        signal:    abort.signal,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getKey, hasKey, t.noKey, trialRemaining, lang]);

  // ── Send to all selected models ──────────────────────────────
  async function handleSend() {
    if (!canSend) return;
    const question = inputValue.trim();
    setInputValue('');
    // Phase 5.0 Analytics
    import('@/lib/analytics').then(({ trackEvent }) =>
      trackEvent('compare_used', { model_count: selectedIds.length, models: selectedIds.join(',') }),
    ).catch(() => {});

    colContentRef.current = {};
    Object.values(abortRefs.current).forEach((a) => a.abort());
    abortRefs.current = {};

    const initCols: ColumnState[] = selectedIds.map((id) => ({
      modelId: id, content: '', isStreaming: true, done: false,
    }));
    setSession({ question, columns: initCols });

    await Promise.all(selectedIds.map((id) => streamOneModel(id, question)));
  }

  function handleRegenerate(modelId: string) {
    if (!session) return;
    colContentRef.current[modelId] = '';
    setSession((prev) =>
      prev
        ? {
            ...prev,
            columns: prev.columns.map((c) =>
              c.modelId === modelId
                ? { ...c, content: '', isStreaming: true, done: false, error: undefined, tokens: undefined, cost: undefined }
                : c,
            ),
          }
        : prev,
    );
    streamOneModel(modelId, session.question);
  }

  function handleNewCompare() {
    Object.values(abortRefs.current).forEach((a) => a.abort());
    abortRefs.current = {};
    colContentRef.current = {};
    setSession(null);
    setInputValue('');
    setTimeout(() => inputRef.current?.focus(), 60);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // ── Model lookup ─────────────────────────────────────────────
  function getModel(id: string): ModelEntry | undefined {
    return MODELS.find((m) => m.id === id);
  }

  // ── Render ───────────────────────────────────────────────────
  const hasSession = !!session;
  const colCount = session?.columns.length ?? 0;

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{ background: tokens.bg }}
    >
      {/* ── Top bar (during session) ── */}
      {hasSession && (
        <div
          className="flex h-11 shrink-0 items-center justify-between border-b px-5"
          style={{ borderColor: tokens.border }}
        >
          <span className="text-[13px]" style={{ color: tokens.textDim }}>
            {lang === 'ko' ? '비교 중' : 'Comparing'}&nbsp;·&nbsp;
            <span style={{ color: tokens.text }}>
              {session.columns.map((c) => getModel(c.modelId)?.name).join(', ')}
            </span>
          </span>
          <button
            onClick={handleNewCompare}
            className="text-[12px] transition-colors hover:opacity-70"
            style={{ color: tokens.accent }}
          >
            {t.newCompare}
          </button>
        </div>
      )}

      {/* ── Main scroll area ── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">

        {/* Empty state — hero + model selector */}
        {!hasSession && (
          <div
            className="mx-auto w-full max-w-3xl flex-1 px-5 pb-6 pt-12 md:pt-16"
          >
            {/* Hero */}
            <div className="mb-10 text-center">
              <h1
                className="font-medium leading-[1.1]"
                style={{
                  fontFamily: '"Instrument Serif", Georgia, serif',
                  fontSize: 'clamp(32px, 4vw, 52px)',
                  color: tokens.text,
                }}
              >
                {t.title}
              </h1>
              <p
                className="mt-3 text-[15px] md:text-[17px]"
                style={{ color: tokens.textDim }}
              >
                {t.subtitle}
              </p>
            </div>

            {/* Model selector */}
            <p
              className="mb-4 text-[12px] font-medium uppercase tracking-[0.07em]"
              style={{ color: tokens.textFaint }}
            >
              {t.selectGuide}
            </p>

            <div className="flex flex-col gap-5">
              {FEATURED_PROVIDER_ORDER.map((provider) => {
                const models = MODELS_BY_PROVIDER[provider];
                if (!models || models.length === 0) return null;
                return (
                  <div key={provider}>
                    <p
                      className="mb-2 text-[11px] font-semibold uppercase tracking-[0.09em]"
                      style={{ color: tokens.textFaint }}
                    >
                      {PROVIDER_LABELS[provider][lang]}
                    </p>
                    <div className="flex flex-col gap-1">
                      {models.map((m) => {
                        const checked = selectedIds.includes(m.id);
                        const provColor = BRAND_COLORS[m.provider] ?? tokens.textFaint;
                        const userHasKey = hasKey(m.apiProv);
                        const canTrial = m.isTrial && !userHasKey && TRIAL_KEY_AVAILABLE;
                        return (
                          <button
                            key={m.id}
                            onClick={() => toggleModel(m.id)}
                            className="flex items-center gap-3 rounded-[10px] border px-3.5 py-2.5 text-left transition-all duration-150"
                            style={{
                              borderColor: checked ? provColor : tokens.border,
                              background: checked ? `${provColor}0d` : tokens.surface,
                            }}
                          >
                            {/* Checkbox */}
                            <span
                              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-all"
                              style={{
                                borderColor: checked ? provColor : tokens.borderStrong,
                                background: checked ? provColor : 'transparent',
                              }}
                            >
                              {checked && (
                                <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
                                  <path d="M2 5l2.5 2.5L8 3" stroke="#fff" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </span>

                            {/* Provider dot */}
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ background: provColor }}
                            />

                            {/* Name + desc */}
                            <span className="min-w-0 flex-1">
                              <span
                                className="text-[13.5px] font-medium"
                                style={{ color: tokens.text }}
                              >
                                {m.name}
                              </span>
                              <span
                                className="ml-2.5 text-[12px]"
                                style={{ color: tokens.textFaint }}
                              >
                                {lang === 'ko' ? m.desc_ko : m.desc_en}
                              </span>
                            </span>

                            {/* Badge */}
                            {canTrial && (
                              <span
                                className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium"
                                style={{
                                  background: `${BRAND_COLORS.google}1a`,
                                  color: BRAND_COLORS.google,
                                }}
                              >
                                {t.trialBadge}
                              </span>
                            )}
                            {!userHasKey && !canTrial && (
                              <span
                                className="shrink-0 text-[11px]"
                                style={{ color: tokens.textFaint }}
                              >
                                {t.noKey}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Active session — N columns */}
        {hasSession && session && (
          <div
            className={`flex min-h-0 flex-1 ${isMobile ? 'flex-col' : colCount === 2 ? 'flex-row' : 'flex-row'}`}
          >
            {session.columns.map((col, idx) => {
              const model = getModel(col.modelId);
              const provColor = model ? (BRAND_COLORS[model.provider] ?? tokens.textFaint) : tokens.textFaint;
              const isLast = idx === session.columns.length - 1;

              return (
                <div
                  key={col.modelId}
                  // [2026-05-04 Roy] 모바일은 column 자체 overflow 제거 — body가 max-h로
                  // 자체 스크롤. 데스크탑은 기존 그대로(가로 비교 시 column 전체 스크롤).
                  className={`flex min-h-0 flex-col ${isMobile ? '' : 'overflow-y-auto'}`}
                  style={{
                    flex: 1,
                    borderRight: !isMobile && !isLast ? `1px solid ${tokens.border}` : undefined,
                    borderBottom: isMobile && !isLast ? `1px solid ${tokens.border}` : undefined,
                    minWidth: 0,
                  }}
                >
                  {/* Column header */}
                  <div
                    className="flex shrink-0 items-center gap-2.5 border-b px-4 py-3"
                    style={{ borderColor: tokens.border, position: isMobile ? 'sticky' : undefined, top: 0, background: tokens.bg, zIndex: 1 }}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: provColor }}
                    />
                    <div className="min-w-0 flex-1">
                      <span
                        className="block truncate text-[13.5px] font-medium"
                        style={{ color: tokens.text }}
                      >
                        {model?.name ?? col.modelId}
                      </span>
                      <span
                        className="block truncate text-[11px] uppercase tracking-[0.05em]"
                        style={{ color: tokens.textFaint }}
                      >
                        {model ? PROVIDER_LABELS[model.provider][lang] : ''}
                      </span>
                    </div>
                    {col.isStreaming && (
                      <span className="text-[11px]" style={{ color: tokens.textFaint }}>
                        {t.streaming}
                      </span>
                    )}
                  </div>

                  {/* [2026-05-05 Roy PM-33] Column body — 모바일 기본 6줄(약 132px,
                      이전 4줄 88px에서 50% 증가). 답변 길면 10줄(260px)까지 자동 확장,
                      그 이상은 우측 스크롤. 데스크탑은 flex-1 그대로. */}
                  <div
                    className="overflow-y-auto px-4 py-4"
                    style={
                      isMobile
                        ? { minHeight: 132, maxHeight: 260 }
                        : { flex: 1 }
                    }
                  >
                    {col.error ? (
                      <p className="text-[13px]" style={{ color: tokens.textFaint }}>
                        {col.error}
                      </p>
                    ) : col.content ? (
                      <div className="prose-d1">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {col.isStreaming ? col.content + '│' : col.content}
                        </ReactMarkdown>
                      </div>
                    ) : col.isStreaming ? (
                      <span
                        className="inline-block animate-pulse text-[13px]"
                        style={{ color: tokens.textFaint }}
                      >
                        │
                      </span>
                    ) : null}
                  </div>

                  {/* Column footer */}
                  {col.done && !col.error && (
                    <div
                      className="flex shrink-0 items-center gap-2 border-t px-4 py-2.5"
                      style={{ borderColor: tokens.border }}
                    >
                      {/* Tokens + cost */}
                      <span className="text-[11.5px]" style={{ color: tokens.textFaint }}>
                        {[
                          formatTokens(col.tokens, lang),
                          formatKRW(col.cost, lang),
                        ].filter(Boolean).join(' · ')}
                      </span>

                      <div className="ml-auto flex items-center gap-1.5">
                        {/* Regenerate */}
                        <button
                          onClick={() => handleRegenerate(col.modelId)}
                          className="rounded-[8px] px-2.5 py-1 text-[12px] transition-colors hover:bg-black/5"
                          style={{ color: tokens.textDim }}
                          title={t.regen}
                        >
                          ↻
                        </button>

                        {/* Continue in chat */}
                        <button
                          onClick={() => onContinueInChat?.(col.modelId)}
                          className="rounded-[8px] px-2.5 py-1 text-[12px] transition-colors hover:bg-black/5"
                          style={{ color: tokens.accent }}
                        >
                          {t.continueInChat}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Bottom input bar ── */}
      <div
        className="shrink-0 border-t px-4 pb-4 pt-3"
        style={{ borderColor: tokens.border, background: tokens.bg }}
      >
        {/* Selected model chips */}
        {!hasSession && selectedIds.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {selectedIds.map((id) => {
              const m = getModel(id);
              const pColor = m ? (BRAND_COLORS[m.provider] ?? tokens.textFaint) : tokens.textFaint;
              return (
                <span
                  key={id}
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px]"
                  style={{ background: `${pColor}18`, color: pColor }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: pColor }} />
                  {m?.name ?? id}
                  <button
                    onClick={() => toggleModel(id)}
                    className="ml-0.5 opacity-60 hover:opacity-100"
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        )}

        <div
          className="flex items-end gap-2 rounded-[16px] border px-3 py-2.5 transition-shadow"
          style={{
            borderColor: tokens.borderStrong,
            background: tokens.surface,
            boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
          }}
        >
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={selectedIds.length < 2 ? t.selectFirst : t.placeholder}
            disabled={selectedIds.length < 2}
            rows={1}
            className="flex-1 resize-none bg-transparent text-[14px] leading-[1.5] outline-none placeholder:transition-colors"
            style={{
              color: tokens.text,
              minHeight: 24,
              maxHeight: 160,
            }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
            }}
          />
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] transition-all"
            style={{
              background: canSend ? tokens.accent : 'transparent',
              color: canSend ? '#fff' : tokens.textFaint,
              border: canSend ? 'none' : `1px solid ${tokens.borderStrong}`,
            }}
            title={t.send}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Toast ── */}
      {toastMsg && (
        <div
          className="pointer-events-none fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-[13px] text-white"
          style={{
            background: 'rgba(10,10,10,0.82)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          {toastMsg}
        </div>
      )}

      {/* ── Prose styles ── */}
      <style dangerouslySetInnerHTML={{ __html: `
        .prose-d1 { font-size: 14px; line-height: 1.65; color: ${tokens.text}; }
        .prose-d1 p { margin: 0 0 0.75em; }
        .prose-d1 p:last-child { margin-bottom: 0; }
        .prose-d1 h1,.prose-d1 h2,.prose-d1 h3 { font-weight: 600; margin: 1em 0 0.4em; }
        .prose-d1 h1 { font-size: 17px; }
        .prose-d1 h2 { font-size: 15px; }
        .prose-d1 h3 { font-size: 14px; }
        .prose-d1 code { font-family: 'Geist Mono', monospace; font-size: 12.5px; background: ${tokens.surfaceAlt}; border-radius: 4px; padding: 1px 5px; }
        .prose-d1 pre { background: ${tokens.surfaceAlt}; border-radius: 10px; padding: 14px; overflow-x: auto; margin: 0.75em 0; }
        .prose-d1 pre code { background: none; padding: 0; }
        .prose-d1 ul,.prose-d1 ol { padding-left: 1.5em; margin: 0.5em 0; }
        .prose-d1 li { margin: 0.25em 0; }
        .prose-d1 strong { font-weight: 600; }
        .prose-d1 blockquote { border-left: 3px solid ${tokens.border}; padding-left: 12px; color: ${tokens.textDim}; margin: 0.75em 0; }
        .prose-d1 table { border-collapse: collapse; font-size: 13px; }
        .prose-d1 th,.prose-d1 td { border: 1px solid ${tokens.border}; padding: 5px 10px; }
        .prose-d1 th { background: ${tokens.surfaceAlt}; font-weight: 600; }
        .prose-d1 a { color: ${tokens.accent}; text-decoration: underline; text-decoration-color: rgba(198,90,60,0.4); }
        .prose-d1 hr { border: none; border-top: 1px solid ${tokens.border}; margin: 1em 0; }
      ` }} />
    </div>
  );
}
