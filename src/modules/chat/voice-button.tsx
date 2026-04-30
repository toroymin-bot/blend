'use client';

// [2026-04-17] Voice refactor: Web Speech API with real-time interim results
// Primary: SpeechRecognition (browser-native, free, supports ko-KR natively in Chrome/Edge)
// Fallback: MediaRecorder + Whisper API (Firefox / Safari without Web Speech API support)
// Fixes: Korean not working, no real-time transcription

import { useState, useRef, useEffect } from 'react';
import { Mic, Square } from 'lucide-react';

// [2026-04-17] Inline type definitions for Web Speech API (not guaranteed in all TS versions)
interface ISpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): { transcript: string };
  [index: number]: { transcript: string };
}
interface ISpeechRecognitionResultList {
  readonly length: number;
  item(index: number): ISpeechRecognitionResult;
  [index: number]: ISpeechRecognitionResult;
}
interface ISpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: ISpeechRecognitionResultList;
}
interface ISpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: ISpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: Event) => void) | null;
}
interface ISpeechRecognitionConstructor {
  new(): ISpeechRecognition;
}
declare global {
  interface Window {
    SpeechRecognition?: ISpeechRecognitionConstructor;
    webkitSpeechRecognition?: ISpeechRecognitionConstructor;
  }
}

interface VoiceButtonProps {
  /** Called on every interim (isFinal=false) and final (isFinal=true) STT result */
  onTranscript: (text: string, isFinal: boolean) => void;
  /** Fallback: called with audio blob when Web Speech API is not available */
  onFallbackRecorded?: (blob: Blob) => void;
  /** User-facing error (permission denied, unsupported browser, etc.) */
  onError?: (msg: string) => void;
  disabled?: boolean;
  lang?: string; // 'ko' | 'en'
}

export function VoiceButton({ onTranscript, onFallbackRecorded, onError, disabled, lang = 'en' }: VoiceButtonProps) {
  const [recording, setRecording] = useState(false);
  const [pulseAnim, setPulseAnim] = useState(false);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);

  // Fallback refs (MediaRecorder)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  // Resolve SpeechRecognition constructor (handles webkit prefix)
  const getSpeechRecognition = (): ISpeechRecognitionConstructor | null => {
    if (typeof window === 'undefined') return null;
    return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      if (mediaRecorderRef.current?.state !== 'inactive') {
        mediaRecorderRef.current?.stop();
      }
    };
  }, []);

  // ── Web Speech API path ────────────────────────────────────────────────────

  // [2026-04-21] IMP-005 fix: manual stop only — no auto-stop on silence
  // continuous=true keeps recognition alive through natural speech pauses.
  // onend auto-restarts if user hasn't explicitly stopped (handles browser-forced stops).
  const isRecordingRef = useRef(false);

  const startWebSpeech = () => {
    const SpeechRecognitionAPI = getSpeechRecognition();
    if (!SpeechRecognitionAPI) return false;

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = lang === 'ko' ? 'ko-KR' : 'en-US';
    recognition.interimResults = true;  // real-time live text
    recognition.continuous = true;      // [IMP-005] keep recording through pauses
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: ISpeechRecognitionEvent) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += t;
        } else {
          interim += t;
        }
      }
      if (final) {
        onTranscript(final, true);
      } else if (interim) {
        onTranscript(interim, false);
      }
    };

    recognition.onend = () => {
      // [IMP-005] If user hasn't explicitly stopped, restart to survive browser-forced ends
      if (isRecordingRef.current) {
        try {
          recognition.start();
        } catch {
          // Recognition already started or unavailable — treat as genuine stop
          isRecordingRef.current = false;
          setRecording(false);
          setPulseAnim(false);
        }
      } else {
        setRecording(false);
        setPulseAnim(false);
      }
    };

    recognition.onerror = (event: Event) => {
      const errEvent = event as Event & { error?: string };
      // 'no-speech' is not a fatal error — ignore and let onend restart
      if (errEvent.error === 'no-speech') return;
      isRecordingRef.current = false;
      setRecording(false);
      setPulseAnim(false);
    };

    recognition.start();
    recognitionRef.current = recognition;
    isRecordingRef.current = true;
    setRecording(true);
    setPulseAnim(true);
    return true;
  };

  const stopWebSpeech = () => {
    isRecordingRef.current = false;  // signal onend not to restart
    recognitionRef.current?.stop();
    setRecording(false);
    setPulseAnim(false);
  };

  // ── MediaRecorder fallback path ────────────────────────────────────────────

  const startFallback = async () => {
    // [2026-04-30 모바일 음성 픽스] iOS Safari/Android Chrome 호환성 강화 + 사용자 피드백.
    // navigator.mediaDevices가 없으면 브라우저가 미지원 (HTTP 환경 등).
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      onError?.(lang === 'ko'
        ? '이 브라우저는 음성 입력을 지원하지 않아요. 다른 브라우저로 시도해주세요.'
        : 'Voice input is not supported in this browser. Please try a different browser.');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      onError?.(lang === 'ko'
        ? '이 브라우저는 음성 녹음을 지원하지 않아요.'
        : 'This browser does not support voice recording.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // iOS Safari는 audio/mp4만 지원. Android Chrome은 audio/webm. 둘 다 시도.
      const preferredMimes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4;codecs=mp4a.40.2',
        'audio/mp4',
      ];
      const mimeType = preferredMimes.find((m) => MediaRecorder.isTypeSupported(m)) || '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blobType = mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: blobType });
        stream.getTracks().forEach((t) => t.stop());
        onFallbackRecorded?.(blob);
        setRecording(false);
        setPulseAnim(false);
      };
      recorder.onerror = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setPulseAnim(false);
        onError?.(lang === 'ko'
          ? '녹음 중 문제가 생겼어요. 다시 시도해주세요.'
          : 'Recording error. Please try again.');
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setPulseAnim(true);
    } catch (e) {
      const err = e as DOMException;
      // NotAllowedError: 권한 거부. NotFoundError: 마이크 없음. 그 외: 일반 실패.
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        onError?.(lang === 'ko'
          ? '마이크 권한이 필요해요. 브라우저 주소창의 자물쇠 아이콘에서 마이크를 허용해주세요.'
          : 'Microphone access required. Tap the lock icon in the address bar to allow it.');
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        onError?.(lang === 'ko'
          ? '마이크를 찾을 수 없어요. 마이크가 연결되어 있는지 확인해주세요.'
          : 'No microphone found. Please check that one is connected.');
      } else {
        onError?.(lang === 'ko'
          ? '마이크를 시작할 수 없어요. 다시 시도해주세요.'
          : 'Could not start the microphone. Please try again.');
      }
    }
  };

  const stopFallback = () => {
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop();
    }
  };

  // ── Main handler ───────────────────────────────────────────────────────────

  const handleClick = () => {
    if (recording) {
      // Stop whichever is active
      if (recognitionRef.current) {
        stopWebSpeech();
      } else {
        stopFallback();
      }
      return;
    }

    // Try Web Speech API first; fall back to MediaRecorder
    const started = startWebSpeech();
    if (!started) {
      startFallback();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      title={recording ? 'Stop recording' : 'Start voice input'}
      className={`relative flex items-center justify-center w-8 h-8 rounded-lg transition-colors flex-shrink-0 ${
        recording
          ? 'bg-red-600 hover:bg-red-700 text-white'
          : 'text-on-surface-muted hover:text-on-surface hover:bg-surface-2'
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {pulseAnim && (
        <span className="absolute inset-0 rounded-lg bg-red-500 opacity-40 animate-ping" />
      )}
      {recording ? <Square size={15} className="relative z-10" /> : <Mic size={15} />}
    </button>
  );
}
