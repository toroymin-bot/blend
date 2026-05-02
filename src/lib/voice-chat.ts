// Blend — Voice Chat Core Library
// STT (Speech-to-Text) + TTS (Text-to-Speech) pipeline
// Language-aware provider selection:
//   ko → Google STT / Google TTS WaveNet (fallback: OpenAI Whisper / OpenAI tts-1)
//   en → OpenAI Whisper / OpenAI tts-1 (fallback: Google STT / Google TTS)
// [2026-04-16] New feature

import { recordApiUsage } from '@/lib/analytics';

// [2026-05-02 Roy] Voice 가격표 (USD) — 사용량 추적용.
// Whisper STT: $0.006 / 분 → 초 단위로 산출.
// OpenAI tts-1: $15 / 1M chars (tts-1-hd: $30/M).
// Google Cloud STT: 무료 60분/월 후 $0.024/분.
// Google TTS WaveNet: $16/M chars (Standard: $4/M).
const PRICE = {
  whisperPerMin: 0.006,
  ttsOpenaiStandard: 15 / 1_000_000,    // per char
  ttsOpenaiHd:       30 / 1_000_000,
  googleSttPerMin:   0.024,             // 무료 60분 무시 — 보수적 추정
  googleTtsWavenet:  16 / 1_000_000,    // per char
} as const;

// Blob 길이(초) 측정 — Audio 객체 metadata 로드. 실패 시 fallback (1MB ≈ 60초 추정).
async function getAudioDurationSec(blob: Blob): Promise<number> {
  if (typeof window === 'undefined') return 0;
  try {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.src = url;
    await new Promise<void>((resolve, reject) => {
      audio.onloadedmetadata = () => resolve();
      audio.onerror = () => reject(new Error('audio metadata load failed'));
      // 5초 timeout — 어떤 브라우저는 metadata 안 줌
      setTimeout(() => resolve(), 5000);
    });
    URL.revokeObjectURL(url);
    const dur = audio.duration;
    if (!isFinite(dur) || dur <= 0) {
      // fallback: 16kHz mono ≈ 32KB/sec 가정
      return Math.round(blob.size / 32000);
    }
    return dur;
  } catch {
    return Math.round(blob.size / 32000);
  }
}

// [2026-05-02 Roy] TTS 언어 자동 감지 + 품질별 voice 선택.
// 사용자가 매번 voice ID 고를 필요 없음 — 답변 텍스트 분석 후 자동 매칭.
export type DetectedLang =
  | 'ko' | 'en' | 'ja' | 'zh' | 'fil' | 'vi' | 'th'
  | 'es' | 'fr' | 'de' | 'pt' | 'hi' | 'ar' | 'id';

export function detectLanguageFromText(text: string): DetectedLang {
  const t = text.slice(0, 500); // 첫 500자만 분석 (성능)
  // CJK 우선 (확실한 시그널)
  if (/[가-힯ᄀ-ᇿ㄰-㆏]/.test(t)) return 'ko';     // Hangul
  if (/[぀-ゟ゠-ヿ]/.test(t)) return 'ja';                  // Hiragana/Katakana
  if (/[一-鿿]/.test(t)) return 'zh';                               // Han (중국어, ja에 없으면)
  if (/[฀-๿]/.test(t)) return 'th';                               // Thai
  if (/[ऀ-ॿ]/.test(t)) return 'hi';                               // Devanagari
  if (/[؀-ۿ]/.test(t)) return 'ar';                               // Arabic
  // 라틴 문자 — 키워드 휴리스틱 (uncommon scripts 부재 시)
  if (/\b(ako|nga|hindi|mga|sino|ano|bakit|paano|kayo|niya|nila|tayo|sila|salamat|kumusta|kailan)\b/i.test(t)) return 'fil';
  if (/[áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ]/i.test(t)) return 'vi';
  if (/\b(yo|tu|el|ella|nosotros|porque|gracias|hola|adios|por\s+favor)\b/i.test(t) || /[ñ¿¡]/.test(t)) return 'es';
  if (/\b(je|tu|il|elle|nous|vous|merci|bonjour|s'il\s+vous\s+plaît|pourquoi)\b/i.test(t) || /[œ]/.test(t)) return 'fr';
  if (/[äöüß]/i.test(t) || /\b(ich|du|er|sie|wir|warum|danke|hallo|bitte)\b/i.test(t)) return 'de';
  if (/\b(você|obrigado|ola|por\s+favor|porque|aqui|nao)\b/i.test(t) || /[ãõç]/i.test(t)) return 'pt';
  if (/\b(saya|anda|kamu|terima\s+kasih|halo|kenapa|bagaimana)\b/i.test(t)) return 'id';
  return 'en';
}

// [2026-05-02 Roy] 모든 TTS provider 여자 목소리 통일 — "활기차지만 부드러운"
// 톤. 영어든 한국어든 다른 언어든 일관된 캐릭터 유지.
//
// Google Chirp3-HD (2025 GA): 'Aoede' = 그리스 신화 뮤즈, feminine + lively + warm.
// 모든 언어에 Aoede 사용 → 사용자가 어느 언어로 답변받아도 같은 캐릭터.
// $60 / 1M chars (premium).
const CHIRP3_HD_VOICE: Partial<Record<DetectedLang, string>> = {
  ko: 'ko-KR-Chirp3-HD-Aoede',
  en: 'en-US-Chirp3-HD-Aoede',
  ja: 'ja-JP-Chirp3-HD-Aoede',
  zh: 'cmn-CN-Chirp3-HD-Aoede',
  vi: 'vi-VN-Chirp3-HD-Aoede',
  th: 'th-TH-Chirp3-HD-Aoede',
  hi: 'hi-IN-Chirp3-HD-Aoede',
  es: 'es-ES-Chirp3-HD-Aoede',
  fr: 'fr-FR-Chirp3-HD-Aoede',
  de: 'de-DE-Chirp3-HD-Aoede',
  pt: 'pt-BR-Chirp3-HD-Aoede',
  ar: 'ar-XA-Chirp3-HD-Aoede',
  id: 'id-ID-Chirp3-HD-Aoede',
  // fil 미지원 → fallback
};

// 표준 품질 — Wavenet/Neural2. 언어마다 다른 ID 체계라 일관 voice ID 사용 불가.
// 각 언어별 가장 자연스러운 여자 voice (Wavenet-A는 대부분 언어에서 female 기본).
// $16 / 1M chars.
const STANDARD_GOOGLE_VOICE: Record<DetectedLang, string> = {
  ko: 'ko-KR-Wavenet-A',           // female, warm
  en: 'en-US-Neural2-F',           // female, lively
  ja: 'ja-JP-Wavenet-A',           // female
  zh: 'cmn-CN-Wavenet-A',          // female
  fil: 'fil-PH-Wavenet-A',         // female
  vi: 'vi-VN-Wavenet-A',           // female
  th: 'th-TH-Neural2-C',           // female (Thai 한정)
  hi: 'hi-IN-Wavenet-A',           // female
  es: 'es-ES-Wavenet-C',           // female
  fr: 'fr-FR-Wavenet-C',           // female
  de: 'de-DE-Wavenet-A',           // female
  pt: 'pt-BR-Wavenet-A',           // female
  ar: 'ar-XA-Wavenet-A',           // female
  id: 'id-ID-Wavenet-A',           // female
};

// 언어 코드 매핑 — Google TTS API용 (BCP-47).
const LANG_TO_BCP47: Record<DetectedLang, string> = {
  ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', zh: 'cmn-CN', fil: 'fil-PH',
  vi: 'vi-VN', th: 'th-TH', hi: 'hi-IN', es: 'es-ES', fr: 'fr-FR',
  de: 'de-DE', pt: 'pt-BR', ar: 'ar-XA', id: 'id-ID',
};

export type TTSQuality = 'premium' | 'standard';

// [2026-05-02 Roy] TTS 재생 속도 + 톤(피치) — 모든 provider 통일.
// 속도: 1.0 = 정상, 1.15 = 약간 빠름. OpenAI/Google 모두 0.25-4.0 지원.
// 피치: Google semitones (0 = 기본). +2.0 = 약간 높은 톤. -20~20 범위.
//   OpenAI tts-1/gpt-4o-mini-tts는 직접 pitch 파라미터 X — 'instructions' 필드에
//   "Speak with a slightly bright, lively tone" 식으로 voice steering. 단 tts-1은
//   instructions 무시 (gpt-4o-mini-tts만 지원).
const TTS_SPEED = 1.15;
const TTS_PITCH_GOOGLE = 2.0; // Google semitones
const TTS_INSTRUCTIONS_OPENAI = 'Speak with a slightly bright and uplifted tone, lively but soft and warm. Female voice.';

export type VoiceProvider = 'openai' | 'google';

export interface VoiceProviderConfig {
  stt: VoiceProvider;
  tts: VoiceProvider;
}

/**
 * Determine STT/TTS provider based on app language and available API keys.
 */
export function getVoiceProviderConfig(
  language: 'ko' | 'en',
  hasOpenAIKey: boolean,
  hasGoogleKey: boolean,
): VoiceProviderConfig | null {
  if (language === 'ko') {
    if (hasGoogleKey) return { stt: 'google', tts: 'google' };
    if (hasOpenAIKey) return { stt: 'openai', tts: 'openai' };
  } else {
    if (hasOpenAIKey) return { stt: 'openai', tts: 'openai' };
    if (hasGoogleKey) return { stt: 'google', tts: 'google' };
  }
  return null; // no keys available
}

// ── STT: Speech → Text ────────────────────────────────────────────────────────

/**
 * Transcribe audio blob using OpenAI Whisper API (gpt-4o-transcribe or whisper-1).
 * Compatible with static export (browser-side only).
 */
export async function sttOpenAI(audioBlob: Blob, apiKey: string, language: string): Promise<string> {
  // Tori 명세: 파일명을 원본 그대로 보존해야 Whisper가 m4a/mp4를 정상 인식
  // - File 객체 (Documents/회의 업로드)면 .name 보존
  // - 익명 Blob (마이크 녹음)이면 MIME → ext 매핑
  const isFile = (audioBlob as File).name !== undefined;
  const filename = isFile
    ? (audioBlob as File).name
    : `recording.${guessAudioExt(audioBlob.type)}`;
  const formData = new FormData();
  formData.append('file', audioBlob, filename);
  formData.append('model', 'whisper-1');
  // [2026-05-02 Roy] language='auto' (또는 빈 문자열)이면 Whisper 자동 감지 모드.
  // language 파라미터를 omit하면 Whisper가 발화 내용 분석해 100+개 언어 자동 분류
  // (한국어/영어/필리핀어/일본어/중국어 등). UI lang 강제로 묶지 않음 — 채팅 환경
  // 셋팅(KO/EN)과 무관하게 사용자가 말한 언어 그대로 변환.
  // 'ko'/'ko-KR' 또는 'en'/'en-US' 명시 시엔 그 언어로 강제 (회의 분석 등 명확한
  // 케이스에서 사용).
  const lang = language.toLowerCase();
  if (lang && lang !== 'auto') {
    formData.append('language', lang.startsWith('ko') ? 'ko' : 'en');
  }

  // 2분 timeout (대용량 파일 대비)
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120_000);
  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message = (err as { error?: { message?: string } })?.error?.message || `OpenAI STT error: ${res.status}`;
    // status 보존하여 호출자가 분기 가능하도록
    const e = new Error(message) as Error & { status?: number };
    e.status = res.status;
    throw e;
  }
  const data = await res.json();
  // [2026-05-02 Roy] Whisper 사용량 추적 — 초 단위 비례 비용.
  // duration metadata 로드는 best-effort (실패 시 size 기반 추정).
  getAudioDurationSec(audioBlob).then((sec) => {
    if (sec > 0) {
      recordApiUsage({
        provider: 'openai',
        model: 'whisper-1',
        inputTokens: 0,
        outputTokens: 0,
        cost: (sec / 60) * PRICE.whisperPerMin,
      });
    }
  }).catch(() => {});
  return (data as { text?: string }).text ?? '';
}

function guessAudioExt(mime: string): string {
  if (mime.includes('webm'))   return 'webm';
  if (mime.includes('m4a') || mime.includes('mp4') || mime.includes('aac')) return 'm4a';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('ogg'))    return 'ogg';
  if (mime.includes('flac'))   return 'flac';
  return 'wav';
}

/**
 * Transcribe audio blob using Google Speech-to-Text REST API.
 * Sends raw base64 audio to Google Cloud Speech API.
 */
export async function sttGoogle(audioBlob: Blob, apiKey: string, language: string): Promise<string> {
  const arrayBuffer = await audioBlob.arrayBuffer();

  // [2026-04-17] Fix: btoa spread overflow — chunked encoding for large audio buffers
  // (String.fromCharCode(...largeArray) throws "Maximum call stack size exceeded")
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const base64 = btoa(binary);

  const langCode = language === 'ko' ? 'ko-KR' : 'en-US';

  // [2026-04-17] Fix: detect encoding from blob MIME type instead of hardcoding WEBM_OPUS
  // iOS/Safari records audio/mp4 (AAC) — Google STT v1 doesn't support MP4/AAC natively,
  // so fall back to OpenAI Whisper for mp4 by throwing an error here (caller should catch).
  const mimeType = audioBlob.type.toLowerCase();
  if (mimeType.includes('mp4') || mimeType.includes('m4a') || mimeType.includes('aac')) {
    throw new Error('Google STT: mp4/aac format not supported — use OpenAI Whisper instead');
  }
  const encoding = mimeType.includes('ogg') ? 'OGG_OPUS' : 'WEBM_OPUS';

  const body = {
    config: {
      encoding,
      sampleRateHertz: 48000,
      languageCode: langCode,
    },
    audio: { content: base64 },
  };

  const res = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Google STT error: ${res.status} — ${JSON.stringify(err)}`);
  }
  const data = await res.json() as { results?: { alternatives?: { transcript?: string }[] }[] };
  // 사용량 추적 (Google Cloud Speech)
  getAudioDurationSec(audioBlob).then((sec) => {
    if (sec > 0) {
      recordApiUsage({
        provider: 'google',
        model: 'cloud-speech-v1',
        inputTokens: 0,
        outputTokens: 0,
        cost: (sec / 60) * PRICE.googleSttPerMin,
      });
    }
  }).catch(() => {});
  return data.results?.[0]?.alternatives?.[0]?.transcript ?? '';
}

/**
 * Transcribe audio blob using Gemini multimodal API (gemini-2.5-flash).
 * Accepts audio/mp4, audio/m4a, audio/aac, audio/wav, audio/mp3, audio/ogg, audio/flac.
 *
 * Use cases:
 *   1. User has Google API key but not OpenAI — use their key here
 *   2. Trial users with no keys — pass NEXT_PUBLIC_BLEND_TRIAL_GEMINI_KEY
 *
 * Why Gemini and not Google Cloud Speech (sttGoogle)?
 *   - sttGoogle requires Google Cloud Speech API enabled — most user keys don't
 *     have this. Gemini API is enabled by default on the same key.
 *   - sttGoogle rejects mp4/aac (iOS Safari recordings) — Gemini accepts them.
 */
export async function sttGeminiAudio(audioBlob: Blob, apiKey: string, language: 'ko' | 'en' | 'auto'): Promise<string> {
  // Chunked base64 encoding — String.fromCharCode(...largeArray) overflows
  const arrayBuffer = await audioBlob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const base64 = btoa(binary);

  // Normalize blob mime to a Gemini-supported audio mimeType
  const raw = audioBlob.type.toLowerCase();
  let mimeType = 'audio/mp4'; // safe default for iOS Safari recordings
  if (raw.includes('mp4') || raw.includes('m4a') || raw.includes('aac')) mimeType = 'audio/mp4';
  else if (raw.includes('ogg') || raw.includes('opus')) mimeType = 'audio/ogg';
  else if (raw.includes('mp3') || raw.includes('mpeg')) mimeType = 'audio/mpeg';
  else if (raw.includes('wav')) mimeType = 'audio/wav';
  else if (raw.includes('flac')) mimeType = 'audio/flac';
  // Note: audio/webm not in Gemini's official supported list — Android Chrome
  // typically uses Web Speech API path so doesn't reach here. If it does,
  // the call will likely fail and the caller's catch will surface a friendly toast.

  // [2026-05-02 Roy] 'auto'는 multilingual 자동 감지 — 한국어/영어/필리핀어/일본어
  // 등 발화 언어 그대로 옮겨 적기. 'ko'/'en'은 명시 강제 (회의 분석 등).
  const prompt = language === 'ko'
    ? '이 음성을 한국어 텍스트로 정확하게 옮겨 적어줘. 텍스트만 반환하고 다른 설명은 하지 마.'
    : language === 'en'
      ? 'Transcribe this audio to English text accurately. Return only the text, no other explanation.'
      : 'Transcribe this audio in the SAME language the speaker uses (Korean, English, Filipino, Japanese, Chinese, etc.). Detect the language automatically. Return only the transcribed text — no translation, no explanation, no language label.';

  const body = {
    contents: [{
      role: 'user',
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: base64 } },
      ],
    }],
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120_000);
  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      },
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const e = new Error(`Gemini STT ${res.status}: ${errText.slice(0, 200)}`) as Error & { status?: number };
    e.status = res.status;
    throw e;
  }
  const data = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
  };
  // Gemini 2.5 Flash 가격 (audio input): $0.30/M input + $2.50/M output (대략).
  // usage 있으면 그대로, 없으면 audio 길이 기반 추정.
  const inTok = data.usageMetadata?.promptTokenCount ?? 0;
  const outTok = data.usageMetadata?.candidatesTokenCount ?? 0;
  if (inTok > 0 || outTok > 0) {
    const cost = (inTok * 0.30 + outTok * 2.50) / 1_000_000;
    recordApiUsage({
      provider: 'google',
      model: 'gemini-2.5-flash',
      inputTokens: inTok,
      outputTokens: outTok,
      cost,
    });
  }
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
}

// ── TTS: Text → Speech ────────────────────────────────────────────────────────

// [2026-05-02 Roy] gpt-4o-mini-tts 추가 — 멀티링구얼 자동 (영어 voice가 한국어
// 발음도 자연스럽게 처리). $15/1M chars. 표준 품질 OpenAI fallback에 사용.
export type OpenAITTSVoice =
  | 'alloy' | 'nova' | 'shimmer' | 'echo' | 'fable' | 'onyx'
  | 'coral' | 'verse' | 'ballad' | 'ash' | 'sage';                  // gpt-4o-mini-tts 신규 voice
export type GoogleTTSVoice = string;                                  // Chirp3-HD/Neural2/Wavenet 동적 — 자유 형식

export interface TTSOptions {
  voice?: OpenAITTSVoice | GoogleTTSVoice;
  speed?: number; // 0.25–4.0 (OpenAI)
}

/**
 * Generate speech audio URL using OpenAI TTS API.
 * Returns an object URL that should be revoked after playback.
 * [2026-05-02 Roy] 표준 품질 default = gpt-4o-mini-tts + 'nova' voice
 * (활기차고 친근한 여자 목소리, 멀티링구얼, 한국어/영어 모두 자연스러움).
 * Chirp3-HD Aoede와 비슷한 캐릭터로 통일.
 */
export async function ttsOpenAI(
  text: string,
  apiKey: string,
  options: TTSOptions = {},
): Promise<string> {
  const voice = (options.voice as OpenAITTSVoice) || 'nova';
  // gpt-4o-mini-tts 우선 — 더 자연스러움. 실패 시 tts-1 fallback (구 voice도 호환).
  const model = 'gpt-4o-mini-tts';
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: text.slice(0, 4096),
      voice,
      // Roy 결정: 약간 빠른 속도 + 밝고 살짝 높은 톤. instructions는 gpt-4o-mini-tts
      // 전용 voice steering — tts-1은 무시함.
      speed: options.speed ?? TTS_SPEED,
      instructions: TTS_INSTRUCTIONS_OPENAI,
    }),
  });
  if (!res.ok) {
    // gpt-4o-mini-tts 미지원 계정/region이면 tts-1로 fallback
    if (res.status === 404 || res.status === 400) {
      const r2 = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'tts-1',
          input: text.slice(0, 4096),
          voice: ['alloy', 'nova', 'shimmer', 'echo', 'fable', 'onyx'].includes(voice) ? voice : 'nova',
          speed: options.speed ?? TTS_SPEED,
          // tts-1은 instructions 미지원 → 속도/voice 선택만으로 처리
        }),
      });
      if (!r2.ok) {
        const err = await r2.json().catch(() => ({}));
        throw new Error((err as { error?: { message?: string } })?.error?.message || `OpenAI TTS error: ${r2.status}`);
      }
      const blob2 = await r2.blob();
      recordApiUsage({
        provider: 'openai', model: 'tts-1',
        inputTokens: text.length, outputTokens: 0,
        cost: text.slice(0, 4096).length * PRICE.ttsOpenaiStandard,
      });
      return URL.createObjectURL(blob2);
    }
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } })?.error?.message || `OpenAI TTS error: ${res.status}`);
  }
  const blob = await res.blob();
  // 성공 시 추적 — chars 단위 비례 비용 (gpt-4o-mini-tts ≈ $15/M chars).
  recordApiUsage({
    provider: 'openai',
    model,
    inputTokens: text.length, // chars (token 단위 아님 — Billing 표시용 근사)
    outputTokens: 0,
    cost: text.slice(0, 4096).length * PRICE.ttsOpenaiStandard,
  });
  return URL.createObjectURL(blob);
}

/**
 * Generate speech audio URL using Google Text-to-Speech REST API.
 * [2026-05-02 Roy] explicitVoiceId 우선 — Chirp3-HD/Neural2/Wavenet 자유 지정.
 * 미지정 시 language 기반 fallback (구버전 호환).
 */
export async function ttsGoogle(
  text: string,
  apiKey: string,
  language: 'ko' | 'en',
  options: TTSOptions = {},
  explicitVoiceId?: string,
  langCodeOverride?: string,
): Promise<string> {
  const langCode = langCodeOverride ?? (language === 'ko' ? 'ko-KR' : 'en-US');
  const voiceName = explicitVoiceId
    ?? (options.voice as GoogleTTSVoice)
    ?? (language === 'ko' ? 'ko-KR-Neural2-A' : 'en-US-Neural2-J');
  // 가격 책정 — Chirp3-HD voice면 $60/M, 그 외(Neural2/Wavenet) $16/M.
  const isChirp3HD = /Chirp3-HD/.test(voiceName);
  const pricePerChar = isChirp3HD ? 60 / 1_000_000 : PRICE.googleTtsWavenet;

  const body = {
    input: { text: text.slice(0, 5000) },
    voice: { languageCode: langCode, name: voiceName },
    // [2026-05-02 Roy] speakingRate 1.15 (약간 빠름) + pitch +2 semitones (약간 높음).
    // 활기 + 부드러움 톤 강조. Chirp3-HD는 pitch 무시할 수 있으나 (Chirp 전용 prosody)
    // speakingRate는 모든 voice에서 동작.
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: TTS_SPEED,
      pitch: TTS_PITCH_GOOGLE,
    },
  };

  const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Google TTS error: ${res.status} — ${JSON.stringify(err)}`);
  }
  const data = await res.json() as { audioContent?: string };
  const b64 = data.audioContent;
  if (!b64) throw new Error('Google TTS: no audio content returned');
  // 성공 시 추적 (Chirp3-HD: $60/M, Neural2/Wavenet: $16/M).
  recordApiUsage({
    provider: 'google',
    model: voiceName, // ko-KR-Chirp3-HD-Achird / ko-KR-Neural2-A 등
    inputTokens: text.length,
    outputTokens: 0,
    cost: text.slice(0, 5000).length * pricePerChar,
  });
  return `data:audio/mp3;base64,${b64}`;
}

/**
 * High-level TTS dispatcher — picks provider based on config.
 */
export async function speakText(
  text: string,
  config: VoiceProviderConfig,
  openaiKey: string | null,
  googleKey: string | null,
  language: 'ko' | 'en',
  options: TTSOptions = {},
): Promise<string> {
  if (config.tts === 'google' && googleKey) {
    return ttsGoogle(text, googleKey, language, options);
  }
  if (config.tts === 'openai' && openaiKey) {
    return ttsOpenAI(text, openaiKey, options);
  }
  throw new Error('No TTS API key available');
}

// [2026-05-02 Roy] 품질 + 답변 텍스트 기반 자동 voice/provider 선택 dispatcher.
// 사용자는 'premium' 또는 'standard'만 고르면 됨 — 나머지는 모두 자동:
//   1. 답변 언어 자동 감지 (한국어/영어/필리핀/일본 등)
//   2. premium → Google Chirp3-HD (해당 언어 voice). 미지원 언어/키 없음 → standard로 fallback
//   3. standard → Google Neural2/Wavenet 우선, Google 키 없거나 401 → OpenAI gpt-4o-mini-tts
// 비용 추적은 ttsGoogle/ttsOpenAI 내부에서 자동.
export async function synthesizeTTS(
  rawText: string,
  quality: TTSQuality,
  openaiKey: string | null,
  googleKey: string | null,
): Promise<string> {
  const detected = detectLanguageFromText(rawText);
  const langCode = LANG_TO_BCP47[detected];

  // Premium 시도 — Chirp3-HD 사용
  if (quality === 'premium' && googleKey) {
    const chirpVoice = CHIRP3_HD_VOICE[detected];
    if (chirpVoice) {
      try {
        return await ttsGoogle(rawText, googleKey, detected === 'en' ? 'en' : detected === 'ko' ? 'ko' : 'en', {}, chirpVoice, langCode);
      } catch (e) {
        // Chirp3-HD 실패 (해당 region 미출시 등) → standard로 fallback
        if (typeof window !== 'undefined') console.warn('[TTS] Chirp3-HD failed, fallback to standard:', e);
      }
    }
  }

  // Standard — Google 우선, OpenAI fallback
  if (googleKey) {
    try {
      const stdVoice = STANDARD_GOOGLE_VOICE[detected];
      return await ttsGoogle(rawText, googleKey, detected === 'en' ? 'en' : detected === 'ko' ? 'ko' : 'en', {}, stdVoice, langCode);
    } catch (e) {
      // Google Cloud TTS API 권한 없거나 키 잘못된 경우 → OpenAI fallback
      if (typeof window !== 'undefined') console.warn('[TTS] Google failed, fallback to OpenAI:', e);
    }
  }
  if (openaiKey) {
    // [2026-05-02 Roy] nova — 활기차고 친근한 여자 목소리. Chirp3-HD Aoede와 통일.
    return ttsOpenAI(rawText, openaiKey, { voice: 'nova' });
  }
  throw new Error('No TTS API key available');
}
