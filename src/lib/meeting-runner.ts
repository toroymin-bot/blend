// [2026-05-01 Roy] 회의 분석 module-level runner — 컴포넌트 lifecycle 분리.
// 데이터 소스 sync-runner와 동일 패턴: 분석 진행은 module-level에서 처리되고
// 진행 상태/결과는 zustand store(meeting-job-store)에 갱신. 컴포넌트가 unmount
// 돼도 분석은 계속, 다시 마운트되면 store에서 자연 복원.
//
// 새로고침은 JS 메모리 reset이라 분석 끊김 — 모든 SPA 동일. 결과는 IDB/local
// storage에 저장돼 복원 가능하지만 진행 중인 작업은 처음부터 다시 시작.

import { sendChatRequest } from '@/modules/chat/chat-api';
import { sendTrialMessage, TRIAL_KEY_AVAILABLE } from '@/modules/chat/trial-gemini-client';
import { sttOpenAI, sttGoogle } from '@/lib/voice-chat';
import { diarizeSpeakers } from '@/modules/meeting/meeting-plugin';
import { useMeetingJobStore } from '@/stores/meeting-job-store';
import { useTrialStore } from '@/stores/trial-store';
import type { AIProvider } from '@/types';
import type { MeetingResult, TranscriptSegment } from '@/lib/meeting-types';

// ── module-level state — 컴포넌트 unmount해도 살아있음 ────────────────
const abortControllers = new Map<string, AbortController>();

export function isAnalyzing(jobId: string): boolean {
  return abortControllers.has(jobId);
}

export function cancelAnalyze(jobId: string): void {
  abortControllers.get(jobId)?.abort();
  abortControllers.delete(jobId);
  useMeetingJobStore.getState().failJob(jobId, 'cancelled');
}

// ── Inputs / config ─────────────────────────────────────────────────
export interface AnalyzeInput {
  text?: string;
  ytUrl?: string;
  audioFile?: File | null;
  lang: 'ko' | 'en';
  /** view에서 가져온 키 lookup — 클로저로 capture해 module이 store 의존 없이 사용 */
  getKey: (provider: AIProvider) => string | undefined;
  hasKey: (provider: AIProvider) => boolean;
  /** view에서 결정한 분석 모델 — 동일 정책을 module이 다시 추정 안 함 */
  picked: { id: string; provider: AIProvider; usingTrial: boolean };
  /** ko/en별 system prompt — view에서 정의된 prompt 그대로 사용 */
  systemPrompt: string;
}

// ── 사용자 친화 에러 메시지 ─────────────────────────────────────────
function friendlyAnalyzeError(e: unknown, lang: 'ko' | 'en'): string {
  const err = e as Error & { status?: number; name?: string };
  const msg = (err?.message || '').toLowerCase();
  const ko = lang === 'ko';
  if (err?.message === 'parse' || /json|parse/.test(msg)) {
    return ko
      ? 'AI가 형식에 맞는 분석을 못 만들었어요. 다른 모델로 시도해주세요 (설정 → 모델).'
      : "AI didn't return a valid analysis format. Try a different model (Settings → Models).";
  }
  if (err?.status === 401 || /unauthorized|invalid.*key/.test(msg)) {
    return ko ? 'API 키가 유효하지 않아요. 설정에서 확인해주세요.' : 'API key invalid. Check Settings.';
  }
  if (err?.status === 429 || /rate.?limit|quota|429/.test(msg)) {
    return ko ? 'API 사용 한도 초과. 잠시 후 다시 시도해주세요.' : 'API rate limit exceeded. Try again shortly.';
  }
  if (/paus|일시정지|한도/.test(msg)) {
    return ko ? '비용 한도 도달로 일시 정지됨. 설정에서 한도를 늘려주세요.' : 'Paused: cost limit reached. Increase limit in Settings.';
  }
  if (/trial|체험/.test(msg)) {
    return ko ? '무료 체험 한도를 모두 썼어요. API 키를 설정하면 계속 쓸 수 있어요.' : 'Trial used up. Add an API key in Settings to continue.';
  }
  if (err?.name === 'AbortError') {
    return ko ? '분석이 중단되었어요.' : 'Analysis aborted.';
  }
  if (/network|fetch|load failed/.test(msg)) {
    return ko ? '네트워크 연결을 확인해주세요.' : 'Check your network connection.';
  }
  const raw = err?.message ? err.message.slice(0, 160) : '';
  return ko
    ? `분석에 실패했어요${raw ? ` — ${raw}` : ''}`
    : `Analysis failed${raw ? ` — ${raw}` : ''}`;
}

function tryParseJson(s: string): Record<string, unknown> | null {
  const cleaned = s.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch {}
  }
  return null;
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

// ── 라벨 (i18n) ────────────────────────────────────────────────────
const labels = {
  ko: {
    transcribing: '음성 변환 중',
    diarizing:    '화자 분리 중',
    analyzing:    '분석 중',
  },
  en: {
    transcribing: 'Transcribing',
    diarizing:    'Diarizing speakers',
    analyzing:    'Analyzing',
  },
};

// ── 메인 진입점 ─────────────────────────────────────────────────────
export async function startAnalyze(input: AnalyzeInput): Promise<void> {
  const jobId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const ctrl = new AbortController();
  abortControllers.set(jobId, ctrl);
  const store = useMeetingJobStore.getState();
  const lbl = labels[input.lang];

  store.beginJob(jobId, lbl.analyzing);

  try {
    let inputText = input.text?.trim() ?? '';
    let transcriptSegments: TranscriptSegment[] | undefined;

    // ── 1) 음성 STT ────────────────────────────────────────────────
    if (!inputText && input.audioFile) {
      const audioFile = input.audioFile;
      const SUPPORTED = ['mp3','wav','m4a','webm','ogg','mp4','flac','aac'];
      const ext = (audioFile.name.split('.').pop() || '').toLowerCase();
      if (audioFile.size > 25 * 1024 * 1024) {
        throw new Error(input.lang === 'ko' ? '파일이 25MB를 초과해요.' : 'File exceeds 25MB.');
      }
      if (ext && !SUPPORTED.includes(ext)) {
        throw new Error(input.lang === 'ko' ? '지원하지 않는 파일 형식이에요.' : 'Unsupported file format.');
      }
      const openaiKey = input.getKey('openai') || '';
      const googleKey = input.getKey('google') || '';
      if (!openaiKey && !googleKey) {
        throw new Error(input.lang === 'ko'
          ? '음성 변환에는 OpenAI 키가 필요해요. 설정에서 등록해주세요.'
          : 'Voice transcription requires an OpenAI key. Add it in Settings.');
      }

      // STT
      useMeetingJobStore.getState().setStage(jobId, 'transcribing', lbl.transcribing);
      const sttLang = input.lang === 'ko' ? 'ko' : 'en';
      let transcribed = '';
      try {
        transcribed = openaiKey
          ? await sttOpenAI(audioFile, openaiKey, sttLang)
          : await sttGoogle(audioFile, googleKey, sttLang);
      } catch (e) {
        const err = e as Error & { status?: number; name?: string };
        const ko = input.lang === 'ko';
        if (err.status === 401)             throw new Error(ko ? 'OpenAI 키가 유효하지 않아요. 키를 확인해주세요.' : 'OpenAI key invalid.');
        if (err.status === 429)             throw new Error(ko ? 'OpenAI 사용 한도를 초과했어요.' : 'OpenAI rate limit exceeded.');
        if (err.name === 'AbortError')      throw new Error(ko ? '변환에 시간이 너무 걸렸어요.' : 'Transcription timed out.');
        throw new Error(ko ? '음성 변환에 실패했어요. 파일이 손상됐을 수 있어요.' : 'Transcription failed.');
      }
      if (!transcribed.trim()) {
        throw new Error(input.lang === 'ko'
          ? '음성 변환에 실패했어요. 파일이 손상됐을 수 있어요.'
          : 'Transcription failed — file may be corrupted.');
      }

      // 화자 분리 (실패해도 fallback)
      useMeetingJobStore.getState().setStage(jobId, 'diarizing', lbl.diarizing);
      const diarizeProvider = openaiKey ? 'openai' : 'anthropic';
      const diarizeKey      = openaiKey || (input.getKey('anthropic') || '');
      if (diarizeKey) {
        try {
          const segments = await diarizeSpeakers(transcribed, diarizeKey, diarizeProvider, input.lang);
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
    }

    // ── 2) YouTube 자막 ────────────────────────────────────────────
    if (!inputText && input.ytUrl?.trim()) {
      useMeetingJobStore.getState().setStage(jobId, 'analyzing', lbl.analyzing);
      inputText = await fetchYoutubeTranscript(input.ytUrl.trim());
      if (inputText) transcriptSegments = [{ text: inputText }];
    }

    // ── 3) Plain text ──────────────────────────────────────────────
    if (!transcriptSegments && inputText) {
      transcriptSegments = [{ text: inputText }];
    }

    if (!inputText) {
      throw new Error(input.lang === 'ko'
        ? '회의록 텍스트, 음성 파일, 또는 YouTube URL이 필요해요.'
        : 'Need meeting text, audio file, or YouTube URL.');
    }

    if (!input.picked.id) {
      throw new Error(input.lang === 'ko'
        ? 'AI 분석을 위해 API 키 또는 무료 체험이 필요해요.'
        : 'Need API key or free trial for AI analysis.');
    }

    // ── 4) LLM 분석 ────────────────────────────────────────────────
    useMeetingJobStore.getState().setStage(jobId, 'analyzing', lbl.analyzing);
    const messages = [{ role: 'user' as const, content: inputText }];
    let raw = '';

    if (input.picked.usingTrial) {
      await new Promise<void>((resolve, reject) => {
        sendTrialMessage({
          messages,
          systemPrompt: input.systemPrompt,
          onChunk: (c) => { raw += c; },
          onDone:  () => resolve(),
          // [2026-05-01 Roy] sendTrialMessage onError는 Error 객체 — 그대로 reject.
          onError: (e) => reject(e),
        });
      });
      useTrialStore.getState().useTrial();
    } else {
      const apiKey = input.getKey(input.picked.provider) || '';
      if (!apiKey) throw new Error(input.lang === 'ko' ? 'API 키가 없어요.' : 'No API key.');
      void TRIAL_KEY_AVAILABLE; // suppress unused import warning when not using trial
      await new Promise<void>((resolve, reject) => {
        sendChatRequest({
          messages: [{ role: 'system', content: input.systemPrompt }, ...messages],
          apiKey,
          provider: input.picked.provider,
          model: input.picked.id,
          onChunk: (c) => { raw += c; },
          onDone:  () => resolve(),
          onError: (e) => reject(new Error(e)),
        });
      });
    }

    if (ctrl.signal.aborted) {
      throw new DOMException('Analyze aborted', 'AbortError');
    }

    // ── 5) Parse + Result 생성 ────────────────────────────────────
    const parsed = tryParseJson(raw);
    if (!parsed) throw new Error('parse');

    const result: MeetingResult = {
      id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
      createdAt: Date.now(),
      title:        (parsed.title as string) || (input.lang === 'ko' ? '회의' : 'Meeting'),
      duration:     (parsed.duration as string) || '',
      participants: typeof parsed.participants === 'number' ? parsed.participants : 0,
      summary:      Array.isArray(parsed.summary)      ? (parsed.summary as string[]) : [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      actionItems:  Array.isArray(parsed.actionItems)  ? (parsed.actionItems as any[]).map((a: any) => ({ ...a, done: false })) : [],
      decisions:    Array.isArray(parsed.decisions)    ? (parsed.decisions as string[]) : [],
      topics:       Array.isArray(parsed.topics)       ? (parsed.topics as string[]) : [],
      fullSummary:  String(parsed.fullSummary || ''),
      isActive:     true,
      transcript:   transcriptSegments,
    };

    useMeetingJobStore.getState().finishJob(jobId, result);
  } catch (e) {
    const detail = friendlyAnalyzeError(e, input.lang);
    console.error('[meeting-runner] analyze failed:', e);
    useMeetingJobStore.getState().failJob(jobId, detail);
  } finally {
    abortControllers.delete(jobId);
  }
}
