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
  disabled?: boolean;
  lang?: string; // 'ko' | 'en'
}

export function VoiceButton({ onTranscript, onFallbackRecorded, disabled, lang = 'en' }: VoiceButtonProps) {
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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMimes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
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
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setPulseAnim(true);
    } catch (e) {
      console.error('Microphone access error:', e);
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
