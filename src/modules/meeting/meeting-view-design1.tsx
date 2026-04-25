'use client';

/**
 * D1MeetingView — Design1 Meeting Analysis view
 * "녹음하거나 붙여넣으면, AI가 정리해드려요."
 *
 * Self-contained. 텍스트 입력 + YouTube 자막 추출 → AI 분석 → 5섹션 렌더.
 */

import { useEffect, useState } from 'react';
import { useAPIKeyStore } from '@/stores/api-key-store';
import { sendChatRequest } from '@/modules/chat/chat-api';
import { sendTrialMessage, TRIAL_KEY_AVAILABLE } from '@/modules/chat/trial-gemini-client';
import { useTrialStore } from '@/stores/trial-store';
import { getFeaturedModels } from '@/data/available-models';
import type { AIProvider } from '@/types';

// ── Tokens ───────────────────────────────────────────────────────
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
  danger:       'var(--d1-danger)',
} as const;

// ── Types ────────────────────────────────────────────────────────
type ActionItem = { owner?: string; task: string; dueDate?: string; done?: boolean };

type MeetingResult = {
  id: string;
  createdAt: number;
  title: string;
  duration?: string;
  participants?: number;
  summary: string[];
  actionItems: ActionItem[];
  decisions: string[];
  topics: string[];
  fullSummary: string;
};

const STORAGE_KEY = 'd1:meetings';

// ── Copy ─────────────────────────────────────────────────────────
const copy = {
  ko: {
    title:        '회의 분석',
    subtitle:     '녹음하거나 붙여넣으면, AI가 정리해드려요.',
    pasteLabel:   '회의록 붙여넣기',
    placeholder:  '회의록을 여기에...',
    or:           '또는',
    youtube:      'YouTube 링크',
    youtubeHint:  '예: https://youtube.com/watch?v=...',
    analyze:      '분석 시작',
    analyzing:    '분석 중...',
    fetchingYT:   'YouTube 자막을 가져오는 중...',
    back:         '← 뒤로',
    pdf:          'PDF',
    share:        '공유',
    summary:      '요약',
    actionItems:  '액션 아이템',
    decisions:    '결정 사항',
    topics:       '토픽',
    fullSummary:  '전체 요약',
    needContent:  '먼저 회의 내용을 붙여넣거나 YouTube 링크를 입력하세요',
    error:        '분석에 실패했어요',
    needKey:      'API 키를 설정해야 분석할 수 있어요 (또는 무료 체험 사용)',
    recent:       '최근 회의',
    noRecent:     '아직 분석한 회의가 없어요',
    delete:       '삭제',
    confirmDel:   '이 회의 분석을 삭제할까요?',
    cancel:       '취소',
    yesDelete:    '삭제',
  },
  en: {
    title:        'Meeting Analysis',
    subtitle:     'Record or paste — AI organizes it.',
    pasteLabel:   'Paste transcript',
    placeholder:  'Paste transcript...',
    or:           'or',
    youtube:      'YouTube link',
    youtubeHint:  'e.g. https://youtube.com/watch?v=...',
    analyze:      'Analyze',
    analyzing:    'Analyzing...',
    fetchingYT:   'Fetching YouTube transcript...',
    back:         '← Back',
    pdf:          'PDF',
    share:        'Share',
    summary:      'Summary',
    actionItems:  'Action items',
    decisions:    'Decisions',
    topics:       'Topics',
    fullSummary:  'Full summary',
    needContent:  'Paste transcript or enter a YouTube link first',
    error:        'Analysis failed',
    needKey:      'Set an API key to analyze (or use free trial)',
    recent:       'Recent meetings',
    noRecent:     'No analyzed meetings yet',
    delete:       'Delete',
    confirmDel:   'Delete this meeting analysis?',
    cancel:       'Cancel',
    yesDelete:    'Delete',
  },
} as const;

// ── Helpers ──────────────────────────────────────────────────────
function loadResults(): MeetingResult[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MeetingResult[]) : [];
  } catch { return []; }
}

function saveResults(rs: MeetingResult[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rs)); } catch {}
}

function buildSystemPrompt(lang: 'ko' | 'en'): string {
  if (lang === 'ko') {
    return `당신은 회의록 분석 전문가입니다. 다음 텍스트를 분석하여 정확히 다음 JSON 구조로만 응답하세요. 다른 설명이나 마크다운 없이 JSON만:
{
  "title": "회의 제목 (10자 이내)",
  "duration": "1시간 12분 형식, 알 수 없으면 빈 문자열",
  "participants": 참석자 수 (정수, 알 수 없으면 0),
  "summary": ["3줄 요약 1", "3줄 요약 2", "3줄 요약 3"],
  "actionItems": [{"owner": "담당자", "task": "할 일", "dueDate": "MM/DD"}],
  "decisions": ["결정사항 1", "결정사항 2"],
  "topics": ["토픽 1", "토픽 2"],
  "fullSummary": "전체 내용 한 단락 요약"
}`;
  }
  return `You are a meeting analysis expert. Analyze the text and respond with ONLY this JSON structure, no other text or markdown:
{
  "title": "Meeting title (under 10 words)",
  "duration": "e.g. 1h 12m, empty if unknown",
  "participants": participant count (integer, 0 if unknown),
  "summary": ["3-line summary 1", "2", "3"],
  "actionItems": [{"owner": "name", "task": "task", "dueDate": "MM/DD"}],
  "decisions": ["decision 1", "decision 2"],
  "topics": ["topic 1", "topic 2"],
  "fullSummary": "Full content in one paragraph"
}`;
}

function tryParseJson(s: string): any | null {
  // Strip markdown fences if any
  const cleaned = s.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  // Try first {...} blob
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch {}
  }
  return null;
}

function inferProvider(modelId: string): AIProvider {
  const lc = modelId.toLowerCase();
  if (lc.startsWith('gemini') || lc.startsWith('gemma')) return 'google';
  if (lc.startsWith('claude'))   return 'anthropic';
  if (lc.startsWith('deepseek')) return 'deepseek';
  if (lc.includes('llama') || lc.includes('mixtral')) return 'groq';
  return 'openai';
}

async function fetchYoutubeTranscript(url: string): Promise<string> {
  const res = await fetch('/api/youtube-transcript', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error('YouTube transcript failed');
  const data = await res.json();
  return data.transcript ?? data.text ?? '';
}

// ── Main view ───────────────────────────────────────────────────
export default function D1MeetingView({ lang }: { lang: 'ko' | 'en' }) {
  const t = copy[lang];

  const [text, setText]               = useState('');
  const [ytUrl, setYtUrl]             = useState('');
  const [analyzing, setAnalyzing]     = useState(false);
  const [phase, setPhase]             = useState<'input' | 'result'>('input');
  const [active, setActive]           = useState<MeetingResult | null>(null);
  const [history, setHistory]         = useState<MeetingResult[]>([]);
  const [errorMsg, setErrorMsg]       = useState<string | null>(null);
  const [confirmDelId, setConfirmDel] = useState<string | null>(null);

  const { hasKey, getKey } = useAPIKeyStore();
  const trialDailyCount = useTrialStore((s) => s.dailyCount);
  const trialMaxPerDay  = useTrialStore((s) => s.maxPerDay);
  const trialRemaining  = Math.max(0, trialMaxPerDay - trialDailyCount);

  useEffect(() => {
    setHistory(loadResults());
  }, []);

  function pickModel(): { id: string; provider: AIProvider; usingTrial: boolean } {
    // Prefer Google for long docs; fallback to first available BYOK
    const featured = getFeaturedModels();
    const googleId = 'gemini-2.5-pro';
    if (hasKey('google')) return { id: googleId, provider: 'google', usingTrial: false };
    for (const p of ['anthropic', 'openai', 'deepseek', 'groq'] as AIProvider[]) {
      if (hasKey(p)) {
        const m = featured.find((x) => x.provider === p);
        if (m) return { id: m.id, provider: p, usingTrial: false };
      }
    }
    // Trial fallback
    if (TRIAL_KEY_AVAILABLE && trialRemaining > 0) {
      return { id: 'gemini-2.5-flash', provider: 'google', usingTrial: true };
    }
    return { id: '', provider: 'openai', usingTrial: false };
  }

  async function runAnalyze() {
    setErrorMsg(null);

    let inputText = text.trim();
    if (!inputText && ytUrl.trim()) {
      try {
        setAnalyzing(true);
        inputText = await fetchYoutubeTranscript(ytUrl.trim());
      } catch {
        setErrorMsg(t.error);
        setAnalyzing(false);
        return;
      }
    }

    if (!inputText) {
      setErrorMsg(t.needContent);
      return;
    }

    const picked = pickModel();
    if (!picked.id) {
      setErrorMsg(t.needKey);
      return;
    }

    setAnalyzing(true);
    let raw = '';

    try {
      const systemPrompt = buildSystemPrompt(lang);
      const messages = [{ role: 'user' as const, content: inputText }];

      if (picked.usingTrial) {
        await new Promise<void>((resolve, reject) => {
          sendTrialMessage({
            messages,
            systemPrompt,
            onChunk: (c) => { raw += c; },
            onDone:  () => resolve(),
            onError: (e) => reject(e),
          });
        });
        useTrialStore.getState().useTrial();
      } else {
        const apiKey = getKey(picked.provider) || '';
        await new Promise<void>((resolve, reject) => {
          sendChatRequest({
            messages: [{ role: 'system', content: systemPrompt }, ...messages],
            apiKey,
            provider: picked.provider,
            model: picked.id,
            onChunk: (c) => { raw += c; },
            onDone:  () => resolve(),
            onError: (e) => reject(new Error(e)),
          });
        });
      }

      const parsed = tryParseJson(raw);
      if (!parsed) throw new Error('parse');

      const result: MeetingResult = {
        id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
        createdAt: Date.now(),
        title:        parsed.title || t.title,
        duration:     parsed.duration || '',
        participants: typeof parsed.participants === 'number' ? parsed.participants : 0,
        summary:      Array.isArray(parsed.summary)      ? parsed.summary      : [],
        actionItems:  Array.isArray(parsed.actionItems)  ? parsed.actionItems.map((a: any) => ({ ...a, done: false })) : [],
        decisions:    Array.isArray(parsed.decisions)    ? parsed.decisions    : [],
        topics:       Array.isArray(parsed.topics)       ? parsed.topics       : [],
        fullSummary:  String(parsed.fullSummary || ''),
      };

      const next = [result, ...history].slice(0, 30);
      setHistory(next);
      saveResults(next);
      setActive(result);
      setPhase('result');
      setText('');
      setYtUrl('');
    } catch {
      setErrorMsg(t.error);
    } finally {
      setAnalyzing(false);
    }
  }

  function toggleAction(idx: number) {
    if (!active) return;
    const next = {
      ...active,
      actionItems: active.actionItems.map((a, i) => i === idx ? { ...a, done: !a.done } : a),
    };
    setActive(next);
    const updated = history.map((h) => h.id === next.id ? next : h);
    setHistory(updated);
    saveResults(updated);
  }

  function openResult(r: MeetingResult) {
    setActive(r);
    setPhase('result');
  }

  function backToInput() {
    setActive(null);
    setPhase('input');
    setErrorMsg(null);
  }

  function deleteResult(id: string) {
    const next = history.filter((h) => h.id !== id);
    setHistory(next);
    saveResults(next);
    setConfirmDel(null);
    if (active?.id === id) backToInput();
  }

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ background: tokens.bg, color: tokens.text, fontFamily: lang === 'ko' ? 'Pretendard, sans-serif' : 'Geist, sans-serif' }}
    >
      <div className="mx-auto w-full max-w-3xl px-6 py-12 md:py-16">
        {phase === 'input' && (
          <InputPhase
            t={t}
            text={text}
            setText={setText}
            ytUrl={ytUrl}
            setYtUrl={setYtUrl}
            analyzing={analyzing}
            errorMsg={errorMsg}
            history={history}
            onAnalyze={runAnalyze}
            onOpen={openResult}
            onAskDelete={(id) => setConfirmDel(id)}
            lang={lang}
          />
        )}

        {phase === 'result' && active && (
          <ResultPhase
            t={t}
            result={active}
            onBack={backToInput}
            onToggleAction={toggleAction}
          />
        )}
      </div>

      {confirmDelId && (
        <ConfirmModal
          message={t.confirmDel}
          confirmLabel={t.yesDelete}
          cancelLabel={t.cancel}
          onConfirm={() => deleteResult(confirmDelId)}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </div>
  );
}

// ── Input phase ──────────────────────────────────────────────────
function InputPhase({
  t, text, setText, ytUrl, setYtUrl, analyzing, errorMsg, history, onAnalyze, onOpen, onAskDelete, lang,
}: {
  t: typeof copy[keyof typeof copy];
  text: string;
  setText: (v: string) => void;
  ytUrl: string;
  setYtUrl: (v: string) => void;
  analyzing: boolean;
  errorMsg: string | null;
  history: MeetingResult[];
  onAnalyze: () => void;
  onOpen: (r: MeetingResult) => void;
  onAskDelete: (id: string) => void;
  lang: 'ko' | 'en';
}) {
  return (
    <>
      <header className="mb-8">
        <h1 className="text-[32px] md:text-[40px] font-medium leading-[1.15] tracking-tight">
          {t.title}
        </h1>
        <p className="mt-3 text-[15px]" style={{ color: tokens.textDim }}>
          {t.subtitle}
        </p>
      </header>

      <div className="rounded-2xl border p-6 md:p-8" style={{ background: tokens.surface, borderColor: tokens.border }}>
        <label className="mb-2 block text-[12px]" style={{ color: tokens.textDim }}>{t.pasteLabel}</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t.placeholder}
          rows={8}
          className="w-full rounded-lg border px-3 py-2.5 text-[14px] leading-[1.6] outline-none focus:border-current"
          style={{ borderColor: tokens.borderStrong, background: tokens.bg, color: tokens.text }}
        />

        {/*
         * YouTube link input: v1에서 UI 비활성화 (디자인 v1 결정).
         * fetchYoutubeTranscript / ytUrl state / runAnalyze 분기는 유지하여
         * 향후 재활성화 시 UI만 복원하면 동작하도록 함.
         */}

        {errorMsg && (
          <div className="mt-4 rounded-lg px-4 py-2.5 text-[13px]" style={{ background: 'rgba(204,68,68,0.08)', color: tokens.danger }}>
            {errorMsg}
          </div>
        )}

        <button
          type="button"
          onClick={onAnalyze}
          disabled={analyzing || (!text.trim() && !ytUrl.trim())}
          className="mt-6 w-full rounded-lg py-3 text-[14px] font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ background: tokens.text, color: tokens.bg }}
        >
          {analyzing ? t.analyzing : t.analyze}
        </button>
      </div>

      {/* Recent */}
      <section className="mt-10">
        <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: tokens.textFaint }}>
          {t.recent}
        </h2>
        {history.length === 0 ? (
          <div
            className="rounded-2xl border p-8 text-center text-[13px]"
            style={{ background: tokens.surface, borderColor: tokens.border, color: tokens.textDim }}
          >
            {t.noRecent}
          </div>
        ) : (
          <ul className="space-y-2">
            {history.map((h: MeetingResult) => (
              <li key={h.id}>
                <div
                  className="group flex items-center gap-3 rounded-xl border p-4"
                  style={{ background: tokens.surface, borderColor: tokens.border }}
                >
                  <button
                    onClick={() => onOpen(h)}
                    className="flex-1 text-left"
                  >
                    <div className="text-[14px] font-medium" style={{ color: tokens.text }}>{h.title}</div>
                    <div className="mt-1 text-[11.5px]" style={{ color: tokens.textFaint }}>
                      {new Date(h.createdAt).toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                      {h.duration && ` · ${h.duration}`}
                      {h.participants ? ` · ${h.participants}${lang === 'ko' ? '명' : ''}` : ''}
                    </div>
                  </button>
                  <button
                    onClick={() => onAskDelete(h.id)}
                    className="rounded-md p-1.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/5"
                    style={{ color: tokens.textFaint }}
                    aria-label={t.delete}
                  >
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
                    </svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

// ── Result phase ─────────────────────────────────────────────────
function ResultPhase({
  t, result, onBack, onToggleAction,
}: {
  t: typeof copy[keyof typeof copy];
  result: MeetingResult;
  onBack: () => void;
  onToggleAction: (idx: number) => void;
}) {
  return (
    <>
      <button
        onClick={onBack}
        className="mb-6 text-[13px] transition-opacity hover:opacity-70"
        style={{ color: tokens.textDim }}
      >
        {t.back}
      </button>

      <h1 className="text-[28px] md:text-[36px] font-medium leading-[1.2] tracking-tight">
        {result.title}
      </h1>
      <div className="mt-2 text-[12px]" style={{ color: tokens.textFaint }}>
        {new Date(result.createdAt).toLocaleString()}
        {result.duration && ` · ${result.duration}`}
        {result.participants ? ` · ${result.participants}` : ''}
      </div>

      {result.summary.length > 0 && (
        <Section title={t.summary}>
          <ul className="space-y-2">
            {result.summary.map((s, i) => (
              <li key={i} className="flex gap-2 text-[14px]" style={{ color: tokens.text }}>
                <span style={{ color: tokens.accent }}>•</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {result.actionItems.length > 0 && (
        <Section title={t.actionItems}>
          <ul className="space-y-2">
            {result.actionItems.map((a, i) => (
              <li key={i}>
                <label className="flex cursor-pointer items-baseline gap-2">
                  <input
                    type="checkbox"
                    checked={!!a.done}
                    onChange={() => onToggleAction(i)}
                    className="mt-0.5 h-4 w-4 accent-current"
                    style={{ accentColor: tokens.accent }}
                  />
                  <span
                    className="text-[14px]"
                    style={{
                      color: a.done ? tokens.textFaint : tokens.text,
                      textDecoration: a.done ? 'line-through' : 'none',
                    }}
                  >
                    {a.owner && (
                      <span className="mr-1.5 text-[11.5px]" style={{ color: tokens.textDim }}>[{a.owner}]</span>
                    )}
                    {a.task}
                    {a.dueDate && (
                      <span className="ml-2 text-[12px]" style={{ color: tokens.textFaint }}>~ {a.dueDate}</span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {result.decisions.length > 0 && (
        <Section title={t.decisions}>
          <ul className="space-y-1.5">
            {result.decisions.map((d, i) => (
              <li key={i} className="flex gap-2 text-[14px]" style={{ color: tokens.text }}>
                <span style={{ color: tokens.accent }}>✓</span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {result.topics.length > 0 && (
        <Section title={t.topics}>
          <div className="flex flex-wrap gap-2">
            {result.topics.map((tp, i) => (
              <span
                key={i}
                className="rounded-full px-3 py-1 text-[12px]"
                style={{ background: tokens.accentSoft, color: tokens.accent }}
              >
                {tp}
              </span>
            ))}
          </div>
        </Section>
      )}

      {result.fullSummary && (
        <Section title={t.fullSummary}>
          <p className="whitespace-pre-wrap text-[14px] leading-[1.7]" style={{ color: tokens.text }}>
            {result.fullSummary}
          </p>
        </Section>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="mt-6 rounded-2xl border p-6 md:p-7"
      style={{ background: tokens.surface, borderColor: tokens.border }}
    >
      <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: tokens.textFaint }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function ConfirmModal({
  message, confirmLabel, cancelLabel, onConfirm, onCancel,
}: {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.32)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-xs rounded-2xl p-6"
        style={{ background: tokens.surface, color: tokens.text }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[15px]">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg px-4 py-2 text-[13px]" style={{ color: tokens.textDim }}>
            {cancelLabel}
          </button>
          <button onClick={onConfirm} className="rounded-lg px-4 py-2 text-[13px] text-white" style={{ background: tokens.danger }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
