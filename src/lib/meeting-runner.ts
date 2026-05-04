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
import { getAutoFallbackChain } from '@/data/available-models';
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
  /** 'ko' | 'en' | 'ph' — 'ph'는 내부적으로 영어 메시지로 처리 (Filipino UX는 영어 fallback). */
  lang: 'ko' | 'en' | 'ph';
  /** view에서 가져온 키 lookup — 클로저로 capture해 module이 store 의존 없이 사용 */
  getKey: (provider: AIProvider) => string | undefined;
  hasKey: (provider: AIProvider) => boolean;
  /** view에서 결정한 분석 모델 — 동일 정책을 module이 다시 추정 안 함 */
  picked: { id: string; provider: AIProvider; usingTrial: boolean };
  /** ko/en별 system prompt — view에서 정의된 prompt 그대로 사용 */
  systemPrompt: string;
}

// ── 사용자 친화 에러 메시지 ─────────────────────────────────────────
// [2026-05-04 PM-26] regex hole 보강 — Gemini는 status 401 대신 body에 'API key not
// valid' 문구로 줌. 'invalid.*key'만 검사하면 'not valid' 못 잡아 raw 영문 노출됨.
// AI 서비스로서 책임감 있는 가이드 제공이 원칙. 모든 fallback 다 시도 후에도
// 실패 시 어떤 키 등록하면 되는지·발급 링크까지 명시.
function friendlyAnalyzeError(e: unknown, lang: 'ko' | 'en'): string {
  const err = e as Error & { status?: number; name?: string };
  const msg = (err?.message || '').toLowerCase();
  const ko = lang === 'ko';
  if (err?.message === 'parse' || /json|parse/.test(msg)) {
    return ko
      ? 'AI가 형식에 맞는 분석을 못 만들었어요. 다른 모델로 시도해주세요 (설정 → 모델).'
      : "AI didn't return a valid analysis format. Try a different model (Settings → Models).";
  }
  // Auth / invalid key — Gemini 'API key not valid', OpenAI 'invalid_api_key',
  // Anthropic 'authentication_error', 'API_KEY_INVALID', 'PERMISSION_DENIED' 모두 매칭.
  if (
    err?.status === 401 ||
    err?.status === 403 ||
    /unauthorized|invalid.*key|key.*invalid|key not valid|not.*valid.*key|api_key_invalid|permission_denied|authentication.?error|forbidden/i.test(msg)
  ) {
    return ko
      ? '등록된 모든 AI 키가 유효하지 않거나 만료됐어요.\n\n해결:\n• 설정 → API 키에서 OpenAI 또는 Anthropic 키를 새로 등록 (가장 안정적)\n• Google Gemini 무료 키 발급: https://aistudio.google.com/app/apikey\n• OpenAI 키 발급: https://platform.openai.com/api-keys\n• Anthropic 키 발급: https://console.anthropic.com/settings/keys'
      : 'All registered AI keys are invalid or expired.\n\nFix:\n• Settings → API keys: register a new OpenAI or Anthropic key (most reliable)\n• Free Google Gemini key: https://aistudio.google.com/app/apikey\n• OpenAI key: https://platform.openai.com/api-keys\n• Anthropic key: https://console.anthropic.com/settings/keys';
  }
  if (err?.status === 429 || /rate.?limit|quota|429/.test(msg)) {
    return ko
      ? 'AI 사용 한도 초과. 1~2분 뒤 다시 시도하거나, 설정에서 다른 provider 키를 추가하면 자동으로 다음 제공자로 분산돼요.'
      : 'API rate limit exceeded. Retry in 1-2 min, or add another provider key in Settings to spread load.';
  }
  if (/paus|일시정지|한도/.test(msg)) {
    return ko ? '비용 한도 도달로 일시 정지됨. 설정에서 한도를 늘려주세요.' : 'Paused: cost limit reached. Increase limit in Settings.';
  }
  if (/trial|체험/.test(msg)) {
    return ko
      ? '무료 체험 한도를 모두 썼어요. 설정 → API 키에서 OpenAI/Anthropic/Gemini 중 하나만 등록하면 계속 쓸 수 있어요.\n→ Gemini 무료 키: https://aistudio.google.com/app/apikey'
      : 'Trial used up. Add one key in Settings → API keys (OpenAI / Anthropic / Gemini) to continue.\n→ Free Gemini key: https://aistudio.google.com/app/apikey';
  }
  if (err?.name === 'AbortError') {
    return ko ? '분석이 중단되었어요.' : 'Analysis aborted.';
  }
  if (/network|fetch|load failed|cors/i.test(msg)) {
    return ko ? '네트워크 연결을 확인해주세요. (Wi-Fi/모바일 데이터 신호, VPN 차단 여부)' : 'Check your network connection (Wi-Fi/data, VPN block).';
  }
  if (/safety|policy|harmful|harm.?category|blocked/i.test(msg)) {
    return ko ? 'AI가 안전 정책으로 분석을 거부했어요. 텍스트를 다듬어 다시 시도하거나, 다른 모델을 골라주세요 (설정 → 모델).' : 'AI refused due to safety policy. Edit the text or pick another model (Settings → Models).';
  }
  const raw = err?.message ? err.message.slice(0, 160) : '';
  return ko
    ? `분석에 실패했어요${raw ? ` — ${raw}` : ''}\n\n다음을 시도해주세요:\n• 다른 AI 모델 선택 (설정 → 모델)\n• 파일이 손상되지 않았는지 확인\n• 네트워크 재연결 후 재시도`
    : `Analysis failed${raw ? ` — ${raw}` : ''}\n\nTry:\n• Pick a different AI model (Settings → Models)\n• Verify file is not corrupted\n• Check network and retry`;
}

// [2026-05-04 PM-26] LLM 호출 단일화 헬퍼 — 1차 시도 + 자동 fallback chain에서 재사용.
async function callLLM(args: {
  provider: AIProvider;
  modelId: string;
  apiKey: string;
  systemPrompt: string;
  userText: string;
  signal: AbortSignal;
}): Promise<string> {
  let raw = '';
  await new Promise<void>((resolve, reject) => {
    sendChatRequest({
      messages: [
        { role: 'system', content: args.systemPrompt },
        { role: 'user', content: args.userText },
      ],
      apiKey: args.apiKey,
      provider: args.provider,
      model: args.modelId,
      onChunk: (c) => { raw += c; },
      onDone: () => resolve(),
      onError: (e) => reject(new Error(e)),
    });
    args.signal.addEventListener('abort', () => reject(new DOMException('Analyze aborted', 'AbortError')), { once: true });
  });
  return raw;
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
  // labels는 'ko'|'en'만 있음 — 'ph'는 'en' fallback (Filipino UX = Taglish, 영어 OK).
  const labelLang: 'ko' | 'en' = input.lang === 'ph' ? 'en' : input.lang;
  const lbl = labels[labelLang];

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
          const segments = await diarizeSpeakers(transcribed, diarizeKey, diarizeProvider, labelLang);
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
    // [2026-05-04 PM-26] 자동 fallback chain 추가. picked가 invalid 키이거나 trial 만료
    // 시 사용자가 등록한 다른 provider 키로 자동 retry. AI 서비스로서 책임감 있는 동작 —
    // 키 1개가 invalid해도 다른 키 있으면 침묵하지 않고 자동 시도.
    useMeetingJobStore.getState().setStage(jobId, 'analyzing', lbl.analyzing);
    const messages = [{ role: 'user' as const, content: inputText }];
    let raw = '';
    let lastError: unknown = null;
    const attemptedProviders = new Set<AIProvider | 'trial'>();
    void TRIAL_KEY_AVAILABLE; // suppress unused import warning

    // 1차 시도 — picked
    if (input.picked.usingTrial) {
      attemptedProviders.add('trial');
      try {
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
      } catch (e) {
        lastError = e;
        raw = '';
      }
    } else {
      attemptedProviders.add(input.picked.provider);
      const apiKey = input.getKey(input.picked.provider) || '';
      if (!apiKey) {
        lastError = new Error(input.lang === 'ko' ? 'API 키가 없어요.' : 'No API key.');
      } else {
        try {
          raw = await callLLM({
            provider: input.picked.provider,
            modelId: input.picked.id,
            apiKey,
            systemPrompt: input.systemPrompt,
            userText: inputText,
            signal: ctrl.signal,
          });
        } catch (e) {
          lastError = e;
          raw = '';
        }
      }
    }

    // 1차 실패 시 자동 fallback — 사용자가 키 등록한 다른 provider로 순차 시도
    if (!raw && lastError) {
      const errMsg = ((lastError as Error)?.message || '').toLowerCase();
      const isAuthOrTrialIssue =
        /unauthorized|invalid.*key|key.*invalid|key not valid|not.*valid.*key|api_key_invalid|permission_denied|authentication.?error|forbidden|trial|체험|401|403/i.test(errMsg);

      if (isAuthOrTrialIssue || ctrl.signal.aborted === false) {
        const chain = getAutoFallbackChain();
        for (const fb of chain) {
          if (ctrl.signal.aborted) break;
          if (attemptedProviders.has(fb.provider)) continue;
          if (!input.hasKey(fb.provider)) continue;
          const apiKey = input.getKey(fb.provider) || '';
          if (!apiKey) continue;
          attemptedProviders.add(fb.provider);
          try {
            raw = await callLLM({
              provider: fb.provider,
              modelId: fb.apiModel,
              apiKey,
              systemPrompt: input.systemPrompt,
              userText: inputText,
              signal: ctrl.signal,
            });
            console.warn(`[meeting-runner] picked failed, auto-fallback succeeded with ${fb.provider}/${fb.apiModel}`);
            lastError = null;
            break;
          } catch (e) {
            lastError = e;
            raw = '';
          }
        }
      }

      if (!raw && lastError) throw lastError;
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
    const detail = friendlyAnalyzeError(e, labelLang);
    console.error('[meeting-runner] analyze failed:', e);
    useMeetingJobStore.getState().failJob(jobId, detail);
  } finally {
    abortControllers.delete(jobId);
  }
}
