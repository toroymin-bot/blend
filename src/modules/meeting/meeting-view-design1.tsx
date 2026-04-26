'use client';

/**
 * D1MeetingView — Design1 Meeting Analysis view
 * "녹음하거나 붙여넣으면, AI가 정리해드려요."
 *
 * Self-contained. 텍스트 입력 + YouTube 자막 추출 → AI 분석 → 5섹션 렌더.
 */

import { useEffect, useRef, useState } from 'react';
import { useAPIKeyStore } from '@/stores/api-key-store';
import { sendChatRequest } from '@/modules/chat/chat-api';
import { sendTrialMessage, TRIAL_KEY_AVAILABLE } from '@/modules/chat/trial-gemini-client';
import { useTrialStore } from '@/stores/trial-store';
import { getFeaturedModels } from '@/data/available-models';
import type { AIProvider } from '@/types';
// v3 회귀 복구: 음성 파일 업로드 + STT + 화자 분리 (Tori 명세)
import { sttOpenAI, sttGoogle } from '@/lib/voice-chat';
import { diarizeSpeakers } from '@/modules/meeting/meeting-plugin';
// P1.3 Export
import { exportMeetingPDF } from '@/lib/export/export-meeting-pdf';
import { exportMeetingDocx } from '@/lib/export/export-meeting-docx';

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

type TranscriptSegment = { speaker?: string; text: string };

// Phase 3b (Tori 명세) — 활성 소스 칩 표시용 isActive 필드 추가
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
  // Phase 3b — 활성 소스 칩 표시 (채팅 RAG)
  isActive?: boolean;
  // [2026-04-26] STT/diarization 원본 보존 — Result 화면 + PDF/Word export 용
  transcript?: TranscriptSegment[];
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
    audioUpload:  '음성 파일 업로드',
    audioHint:    'mp3 · wav · m4a · webm · ogg · mp4 — 최대 25MB (약 25-50분 분량)',
    audioDrop:    '여기에 드롭하거나 파일 선택',
    transcribing: '음성을 텍스트로 변환 중...',
    diarizing:    '화자 분리 중...',
    transcript:   '대화 기록',
    // Tori 명세 — 단계별 에러 카피
    errFileSize:  '파일이 25MB를 초과해요. 더 짧은 녹음을 사용해주세요.',
    errFileFormat:'지원하지 않는 파일 형식이에요. (mp3, m4a, wav, webm 등)',
    errSttKey:    '음성 변환에는 OpenAI 키가 필요해요. 설정에서 등록해주세요.',
    errSttInvalid:'OpenAI 키가 유효하지 않아요. 키를 확인해주세요.',
    errSttRate:   'OpenAI 사용 한도를 초과했어요. 잠시 후 다시 시도해주세요.',
    errSttTimeout:'변환에 시간이 너무 걸렸어요. 더 짧은 녹음을 사용해주세요.',
    errSttFail:   '음성 변환에 실패했어요. 파일이 손상됐을 수 있어요.',
    errAnalyze:   '분석에 실패했어요. 다시 시도해주세요.',
    // P1.3 Export 카피
    exportLabel:  '출력',
    exportTitle:  '회의록 출력',
    exportPdf:    'PDF로 저장',
    exportDocx:   'Word로 저장',
    exportFormat: '형식',
    exportPreview:'미리보기',
    exportDownload:'다운로드',
    exporting:    '생성 중...',
    errPdfFail:   'PDF 생성에 실패했어요. 다시 시도해주세요.',
    errDocxFail:  'Word 파일 생성에 실패했어요. 다시 시도해주세요.',
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
    audioUpload:  'Upload audio file',
    audioHint:    'mp3 · wav · m4a · webm · ogg · mp4 — Max 25MB (~25-50 min recording)',
    audioDrop:    'Drop here or choose a file',
    transcribing: 'Transcribing audio...',
    diarizing:    'Identifying speakers...',
    transcript:   'Transcript',
    errFileSize:  'File exceeds 25MB. Please use a shorter recording.',
    errFileFormat:'Unsupported format. Try mp3, m4a, wav, or webm.',
    errSttKey:    'OpenAI key required for transcription. Add it in Settings.',
    errSttInvalid:'Invalid OpenAI key. Please check your key.',
    errSttRate:   'OpenAI rate limit exceeded. Try again in a moment.',
    errSttTimeout:'Transcription took too long. Try a shorter recording.',
    errSttFail:   'Transcription failed. The file may be corrupted.',
    errAnalyze:   'Analysis failed. Please try again.',
    exportLabel:  'Export',
    exportTitle:  'Export Meeting Notes',
    exportPdf:    'Save as PDF',
    exportDocx:   'Save as Word',
    exportFormat: 'Format',
    exportPreview:'Preview',
    exportDownload:'Download',
    exporting:    'Generating...',
    errPdfFail:   'PDF generation failed. Please try again.',
    errDocxFail:  'Word generation failed. Please try again.',
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
// Sprint 3 — IndexedDB 백엔드 + localStorage 호환 (Phase 3b useActiveSourceList가 d1:meetings 직접 읽음)
async function loadResultsFromIDB(): Promise<MeetingResult[]> {
  if (typeof window === 'undefined') return [];
  try {
    const { getDB } = await import('@/lib/db/blend-db');
    const db = getDB();
    const metas = await db.meetings.orderBy('createdAt').reverse().toArray();
    if (metas.length === 0) return [];
    const results: MeetingResult[] = [];
    for (const meta of metas) {
      const a = await db.meetingAnalyses.get(meta.id);
      results.push({
        id: meta.id,
        createdAt: meta.createdAt,
        title: meta.title,
        participants: meta.attendees,
        summary: a?.summary?.points ?? [],
        actionItems: (a?.actionItems ?? []).map((i) => ({
          task: i.text,
          owner: i.assignee,
          dueDate: i.dueDate,
          done: i.done,
        })),
        decisions: a?.decisions ?? [],
        topics: a?.topics ?? [],
        fullSummary: a?.fullSummary ?? '',
        isActive: meta.isActive,
        transcript: a?.transcript,
      });
    }
    return results;
  } catch {
    return [];
  }
}

function loadResults(): MeetingResult[] {
  // 동기 — localStorage 캐시 (IDB 백업본). useEffect 내에서 IDB 로드 후 갱신.
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MeetingResult[]) : [];
  } catch { return []; }
}

function saveResults(rs: MeetingResult[]) {
  try {
    // localStorage — Phase 3b useActiveSourceList 호환
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rs));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('d1:meetings-changed'));
    }
    // Sprint 3 — IndexedDB 동기화 (실패해도 localStorage는 유지)
    (async () => {
      try {
        const { getDB } = await import('@/lib/db/blend-db');
        const db = getDB();
        await db.transaction('rw', db.meetings, db.meetingAnalyses, async () => {
          // 단순 동기화 — 전체 교체. 30개 한도라 비용 작음.
          await db.meetings.clear();
          await db.meetingAnalyses.clear();
          for (const r of rs) {
            await db.meetings.put({
              id: r.id,
              title: r.title,
              createdAt: r.createdAt,
              updatedAt: r.createdAt,
              status: 'completed',
              attendees: r.participants,
              isActive: r.isActive,
            });
            await db.meetingAnalyses.put({
              meetingId: r.id,
              summary: r.summary.length > 0 ? { points: r.summary } : undefined,
              actionItems: r.actionItems.map((a) => ({
                text: a.task,
                assignee: a.owner,
                dueDate: a.dueDate,
                done: a.done,
              })),
              decisions: r.decisions,
              topics: r.topics,
              fullSummary: r.fullSummary,
              transcript: r.transcript,
              createdAt: r.createdAt,
            });
          }
        });
      } catch { /* IDB 실패는 무시 — localStorage는 유지됨 */ }
    })();
  } catch {}
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
  // v3 회귀 복구: 음성 파일 + STT 진행 상태 (Tori 명세)
  const [audioFile, setAudioFile]     = useState<File | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [diarizing, setDiarizing]     = useState(false);
  const audioInputRef                 = useRef<HTMLInputElement>(null);

  const { hasKey, getKey } = useAPIKeyStore();
  const trialDailyCount = useTrialStore((s) => s.dailyCount);
  const trialMaxPerDay  = useTrialStore((s) => s.maxPerDay);
  const trialRemaining  = Math.max(0, trialMaxPerDay - trialDailyCount);

  useEffect(() => {
    // localStorage 캐시 즉시 + IDB에서 갱신 (Sprint 3)
    setHistory(loadResults());
    loadResultsFromIDB().then((idbResults) => {
      if (idbResults.length > 0) setHistory(idbResults);
    });
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
    // [2026-04-26] 원본 보존 — 화자 분리 결과가 있으면 segments, 없으면 단일 chunk
    let transcriptSegments: TranscriptSegment[] | undefined;

    // 1) 음성 파일 STT (Tori 명세 단계별 에러 분기)
    if (!inputText && audioFile) {
      // 1-1. 검증
      const SUPPORTED = ['mp3','wav','m4a','webm','ogg','mp4','flac','aac'];
      const ext = (audioFile.name.split('.').pop() || '').toLowerCase();
      if (audioFile.size > 25 * 1024 * 1024) {
        setErrorMsg(t.errFileSize);
        return;
      }
      if (ext && !SUPPORTED.includes(ext)) {
        setErrorMsg(t.errFileFormat);
        return;
      }

      const openaiKey = getKey('openai') || '';
      const googleKey = getKey('google') || '';
      if (!openaiKey && !googleKey) {
        setErrorMsg(t.errSttKey);
        return;
      }

      // 1-2. STT
      let transcribed = '';
      try {
        setTranscribing(true);
        const sttLang = lang === 'ko' ? 'ko-KR' : 'en-US';
        transcribed = openaiKey
          ? await sttOpenAI(audioFile, openaiKey, sttLang)
          : await sttGoogle(audioFile, googleKey, sttLang);
        setTranscribing(false);
        if (!transcribed.trim()) {
          setErrorMsg(t.errSttFail);
          return;
        }
      } catch (e) {
        setTranscribing(false);
        const err = e as Error & { status?: number; name?: string };
        if (err.status === 401)              setErrorMsg(t.errSttInvalid);
        else if (err.status === 429)         setErrorMsg(t.errSttRate);
        else if (err.name === 'AbortError')  setErrorMsg(t.errSttTimeout);
        else                                  setErrorMsg(t.errSttFail);
        return;
      }

      // 1-3. 화자 분리 (실패 시 fallback — 사용자에게 안 알림)
      setDiarizing(true);
      const diarizeProvider = openaiKey ? 'openai' : 'anthropic';
      const diarizeKey      = openaiKey || (getKey('anthropic') || '');
      if (diarizeKey) {
        try {
          const segments = await diarizeSpeakers(transcribed, diarizeKey, diarizeProvider, lang);
          inputText = segments.map((s) => `${s.speaker}: ${s.text}`).join('\n');
          transcriptSegments = segments.map((s) => ({ speaker: s.speaker, text: s.text }));
        } catch {
          inputText = transcribed;
          transcriptSegments = [{ text: transcribed }];
        }
      } else {
        inputText = transcribed;
        transcriptSegments = [{ text: transcribed }];
      }
      setDiarizing(false);
    }

    // 2) YouTube 자막 (기존)
    if (!inputText && ytUrl.trim()) {
      try {
        setAnalyzing(true);
        inputText = await fetchYoutubeTranscript(ytUrl.trim());
        if (inputText) transcriptSegments = [{ text: inputText }];
      } catch {
        setErrorMsg(t.error);
        setAnalyzing(false);
        return;
      }
    }

    // 3) 텍스트 paste — 화자 정보 없는 단일 chunk로 보존
    if (!transcriptSegments && inputText) {
      transcriptSegments = [{ text: inputText }];
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
        // Phase 3b — 분석 완료 시 자동 활성화 (채팅에서 즉시 활용)
        isActive: true,
        transcript: transcriptSegments,
      };

      const next = [result, ...history].slice(0, 30);
      setHistory(next);
      saveResults(next);
      setActive(result);
      setPhase('result');
      setText('');
      setYtUrl('');
      setAudioFile(null);
      if (audioInputRef.current) audioInputRef.current.value = '';
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
            audioFile={audioFile}
            setAudioFile={setAudioFile}
            audioInputRef={audioInputRef}
            transcribing={transcribing}
            diarizing={diarizing}
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
            lang={lang}
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
  t, text, setText, ytUrl, setYtUrl,
  audioFile, setAudioFile, audioInputRef, transcribing, diarizing,
  analyzing, errorMsg, history, onAnalyze, onOpen, onAskDelete, lang,
}: {
  t: typeof copy[keyof typeof copy];
  text: string;
  setText: (v: string) => void;
  ytUrl: string;
  setYtUrl: (v: string) => void;
  audioFile: File | null;
  setAudioFile: (f: File | null) => void;
  audioInputRef: React.RefObject<HTMLInputElement | null>;
  transcribing: boolean;
  diarizing: boolean;
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

        {/* v3 회귀 복구: 음성 파일 업로드 (Tori P0.1) */}
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-[12px]" style={{ color: tokens.textFaint }}>{t.or}</span>
          <div className="h-px flex-1" style={{ background: tokens.border }} />
        </div>

        <div className="mt-3">
          <input
            ref={audioInputRef}
            type="file"
            accept=".mp3,.wav,.m4a,.webm,.ogg,.mp4,audio/*,video/mp4"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setAudioFile(f);
            }}
            className="hidden"
            aria-label={t.audioUpload}
          />
          {!audioFile ? (
            <AudioDropzone
              t={t}
              onClick={() => audioInputRef.current?.click()}
              onFile={(f) => setAudioFile(f)}
            />
          ) : (
            <div
              className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-[13px]"
              style={{ borderColor: tokens.borderStrong, background: tokens.bg }}
            >
              <span className="truncate" style={{ color: tokens.text }}>
                {audioFile.name}
              </span>
              <span className="shrink-0 text-[11.5px]" style={{ color: tokens.textFaint }}>
                {(audioFile.size / (1024 * 1024)).toFixed(1)} MB
              </span>
              <button
                type="button"
                onClick={() => {
                  setAudioFile(null);
                  if (audioInputRef.current) audioInputRef.current.value = '';
                }}
                className="rounded-md p-1 transition-opacity hover:opacity-70"
                style={{ color: tokens.textFaint }}
                aria-label={t.cancel}
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="mt-4 rounded-lg px-4 py-2.5 text-[13px]" style={{ background: 'rgba(204,68,68,0.08)', color: tokens.danger }}>
            {errorMsg}
          </div>
        )}

        <button
          type="button"
          onClick={onAnalyze}
          disabled={analyzing || transcribing || diarizing || (!text.trim() && !ytUrl.trim() && !audioFile)}
          className="mt-6 w-full rounded-lg py-3 text-[14px] font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ background: tokens.text, color: tokens.bg }}
        >
          {transcribing ? t.transcribing : diarizing ? t.diarizing : analyzing ? t.analyzing : t.analyze}
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
  t, result, onBack, onToggleAction, lang,
}: {
  t: typeof copy[keyof typeof copy];
  result: MeetingResult;
  onBack: () => void;
  onToggleAction: (idx: number) => void;
  lang: 'ko' | 'en';
}) {
  const [exportOpen, setExportOpen] = useState(false);
  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-[13px] transition-opacity hover:opacity-70"
          style={{ color: tokens.textDim }}
        >
          {t.back}
        </button>
        <button
          type="button"
          onClick={() => setExportOpen(true)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors"
          style={{ background: tokens.surfaceAlt, color: tokens.text }}
          aria-label={t.exportLabel}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>{t.exportLabel}</span>
        </button>
      </div>

      <h1 className="text-[28px] md:text-[36px] font-medium leading-[1.2] tracking-tight">
        {result.title}
      </h1>
      <div className="mt-2 text-[12px]" style={{ color: tokens.textFaint }}>
        {new Date(result.createdAt).toLocaleString()}
        {result.duration && ` · ${result.duration}`}
        {result.participants ? ` · ${result.participants}` : ''}
      </div>

      {exportOpen && (
        <MeetingExportModal
          meeting={result}
          lang={lang}
          t={t}
          onClose={() => setExportOpen(false)}
        />
      )}

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

      {result.transcript && result.transcript.length > 0 && (
        <Section title={t.transcript}>
          <div className="space-y-3">
            {result.transcript.map((seg, i) => (
              <div key={i}>
                {seg.speaker && (
                  <div
                    className="mb-1 text-[11px] font-medium uppercase tracking-[0.06em]"
                    style={{ color: tokens.accent }}
                  >
                    {seg.speaker}
                  </div>
                )}
                <p
                  className="whitespace-pre-wrap text-[14px] leading-[1.7]"
                  style={{ color: tokens.text }}
                >
                  {seg.text}
                </p>
              </div>
            ))}
          </div>
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

// P1.3 — 회의록 출력 모달 (PDF / Word)
type ExportFormat = 'pdf' | 'docx';

function MeetingExportModal({
  meeting, lang, t, onClose,
}: {
  meeting: MeetingResult;
  lang: 'ko' | 'en';
  t: typeof copy[keyof typeof copy];
  onClose: () => void;
}) {
  const [format, setFormat]       = useState<ExportFormat>('pdf');
  const [exporting, setExporting] = useState(false);
  const [errMsg, setErrMsg]       = useState<string | null>(null);

  async function handleDownload() {
    setErrMsg(null);
    setExporting(true);
    try {
      if (format === 'pdf') {
        await exportMeetingPDF(meeting, lang);
      } else {
        await exportMeetingDocx(meeting, lang);
      }
      onClose();
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === 'PDF_EXPORT_FAILED') setErrMsg(t.errPdfFail);
      else if (err.code === 'DOCX_EXPORT_FAILED') setErrMsg(t.errDocxFail);
      else setErrMsg(t.errAnalyze);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center px-4 py-12"
      style={{ background: 'rgba(0,0,0,0.32)' }}
      onClick={() => { if (!exporting) onClose(); }}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl"
        style={{ background: tokens.surface, color: tokens.text, boxShadow: '0 24px 60px rgba(0,0,0,0.18)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div
          className="flex items-center justify-between gap-3 border-b px-6 py-4"
          style={{ borderColor: tokens.border }}
        >
          <h2 className="text-[16px] font-medium">{t.exportTitle}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={exporting}
            className="rounded-md p-1.5 transition-opacity hover:opacity-70 disabled:opacity-40"
            style={{ color: tokens.textFaint }}
            aria-label={t.cancel}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 본문 */}
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
          {/* 형식 선택 */}
          <div className="mb-5">
            <div className="mb-2 text-[11px] uppercase tracking-[0.08em]" style={{ color: tokens.textFaint }}>
              {t.exportFormat}
            </div>
            <div className="flex gap-2">
              {(['pdf', 'docx'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className="flex-1 rounded-lg border px-4 py-2.5 text-[13px] transition-colors"
                  style={{
                    background: format === f ? tokens.text : tokens.bg,
                    color:      format === f ? tokens.bg   : tokens.text,
                    borderColor: format === f ? tokens.text : tokens.borderStrong,
                    fontWeight: format === f ? 500 : 400,
                  }}
                >
                  {f === 'pdf' ? t.exportPdf : t.exportDocx}
                </button>
              ))}
            </div>
          </div>

          {/* 미리보기 */}
          <div className="mb-2 text-[11px] uppercase tracking-[0.08em]" style={{ color: tokens.textFaint }}>
            {t.exportPreview}
          </div>
          <div
            className="rounded-lg border p-5 text-[13px]"
            style={{ background: tokens.bg, borderColor: tokens.border, color: tokens.text }}
          >
            <h3 className="text-[18px] font-medium" style={{ color: tokens.text }}>{meeting.title}</h3>
            <div className="mt-1 text-[11.5px]" style={{ color: tokens.textFaint }}>
              {new Date(meeting.createdAt).toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US', { dateStyle: 'long' })}
              {meeting.duration ? ` · ${meeting.duration}` : ''}
              {meeting.participants ? ` · ${meeting.participants}${lang === 'ko' ? '명' : ''}` : ''}
            </div>
            {meeting.summary.length > 0 && (
              <div className="mt-4">
                <div className="text-[12px] font-medium mb-1.5" style={{ color: tokens.text }}>{t.summary}</div>
                <ul className="space-y-1">
                  {meeting.summary.slice(0, 3).map((s, i) => (
                    <li key={i} className="flex gap-1.5 text-[12.5px]" style={{ color: tokens.textDim }}>
                      <span>•</span><span>{s}</span>
                    </li>
                  ))}
                  {meeting.summary.length > 3 && (
                    <li className="text-[11.5px]" style={{ color: tokens.textFaint }}>
                      {lang === 'ko' ? `... 외 ${meeting.summary.length - 3}개` : `... +${meeting.summary.length - 3} more`}
                    </li>
                  )}
                </ul>
              </div>
            )}
            {meeting.actionItems.length > 0 && (
              <div className="mt-3 text-[11.5px]" style={{ color: tokens.textFaint }}>
                {t.actionItems}: {meeting.actionItems.length} · {t.decisions}: {meeting.decisions.length}
              </div>
            )}
          </div>

          {errMsg && (
            <div
              className="mt-4 rounded-lg px-4 py-2.5 text-[12.5px]"
              style={{ background: 'rgba(204,68,68,0.08)', color: tokens.danger }}
            >
              {errMsg}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div
          className="flex justify-end gap-2 border-t px-6 py-4"
          style={{ borderColor: tokens.border }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={exporting}
            className="rounded-lg px-4 py-2 text-[13px] disabled:opacity-40"
            style={{ color: tokens.textDim }}
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={exporting}
            className="rounded-lg px-4 py-2 text-[13px] font-medium transition-opacity disabled:opacity-50"
            style={{ background: tokens.accent, color: '#fff' }}
          >
            {exporting ? t.exporting : t.exportDownload}
          </button>
        </div>
      </div>
    </div>
  );
}

// Tori 명세 — 음성 파일 drag&drop dropzone
function AudioDropzone({
  t, onClick, onFile,
}: {
  t: typeof copy[keyof typeof copy];
  onClick: () => void;
  onFile: (f: File) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className="flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-[13px] transition-colors"
      style={{
        borderColor: isDragging ? tokens.accent : tokens.borderStrong,
        background:  isDragging ? tokens.accentSoft : tokens.bg,
        color:       tokens.textDim,
        cursor:      'pointer',
      }}
    >
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
      </svg>
      <span style={{ color: tokens.text, fontWeight: 500 }}>{t.audioUpload}</span>
      <span className="text-[11.5px]" style={{ color: tokens.textFaint }}>{t.audioDrop}</span>
      <span className="text-[11px]" style={{ color: tokens.textFaint }}>{t.audioHint}</span>
    </button>
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
