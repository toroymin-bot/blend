// Blend — Voice Chat Core Library
// STT (Speech-to-Text) + TTS (Text-to-Speech) pipeline
// Language-aware provider selection:
//   ko → Google STT / Google TTS WaveNet (fallback: OpenAI Whisper / OpenAI tts-1)
//   en → OpenAI Whisper / OpenAI tts-1 (fallback: Google STT / Google TTS)
// [2026-04-16] New feature

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
  const ext = audioBlob.type.includes('webm') ? 'webm' : 'wav';
  const formData = new FormData();
  formData.append('file', audioBlob, `recording.${ext}`);
  formData.append('model', 'whisper-1');
  formData.append('language', language === 'ko' ? 'ko' : 'en');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } })?.error?.message || `OpenAI STT error: ${res.status}`);
  }
  const data = await res.json();
  return (data as { text?: string }).text ?? '';
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
  return data.results?.[0]?.alternatives?.[0]?.transcript ?? '';
}

// ── TTS: Text → Speech ────────────────────────────────────────────────────────

export type OpenAITTSVoice = 'alloy' | 'nova' | 'shimmer' | 'echo' | 'fable' | 'onyx';
export type GoogleTTSVoice = 'ko-KR-Wavenet-A' | 'ko-KR-Wavenet-B' | 'en-US-Wavenet-D' | 'en-US-Neural2-J';

export interface TTSOptions {
  voice?: OpenAITTSVoice | GoogleTTSVoice;
  speed?: number; // 0.25–4.0 (OpenAI)
}

/**
 * Generate speech audio URL using OpenAI TTS API.
 * Returns an object URL that should be revoked after playback.
 */
export async function ttsOpenAI(
  text: string,
  apiKey: string,
  options: TTSOptions = {},
): Promise<string> {
  const voice = (options.voice as OpenAITTSVoice) || 'nova';
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text.slice(0, 4096),
      voice,
      speed: options.speed ?? 1.0,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } })?.error?.message || `OpenAI TTS error: ${res.status}`);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/**
 * Generate speech audio URL using Google Text-to-Speech REST API.
 * Returns a data URL (base64 MP3).
 */
export async function ttsGoogle(
  text: string,
  apiKey: string,
  language: 'ko' | 'en',
  options: TTSOptions = {},
): Promise<string> {
  const langCode = language === 'ko' ? 'ko-KR' : 'en-US';
  const voiceName = (options.voice as GoogleTTSVoice) || (language === 'ko' ? 'ko-KR-Wavenet-A' : 'en-US-Neural2-J');

  const body = {
    input: { text: text.slice(0, 5000) },
    voice: { languageCode: langCode, name: voiceName },
    audioConfig: { audioEncoding: 'MP3' },
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
