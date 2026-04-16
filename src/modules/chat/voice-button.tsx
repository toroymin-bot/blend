'use client';

// [2026-04-16] Voice Chat — Mic button UI component
// Handles recording start/stop and exposes the recorded audio blob via onRecorded callback.

import { useState, useRef, useEffect } from 'react';
import { Mic, Square } from 'lucide-react';

interface VoiceButtonProps {
  onRecorded: (blob: Blob) => void;
  disabled?: boolean;
}

export function VoiceButton({ onRecorded, disabled }: VoiceButtonProps) {
  const [recording, setRecording] = useState(false);
  const [pulseAnim, setPulseAnim] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // [2026-04-17] fallback mimeType for mobile Safari (iOS does not support audio/webm)
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
        // Stop all mic tracks to release microphone
        stream.getTracks().forEach((t) => t.stop());
        onRecorded(blob);
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

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleClick = () => {
    if (recording) {
      stopRecording();
    } else {
      startRecording();
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
      {/* Pulse ring animation when recording */}
      {pulseAnim && (
        <span className="absolute inset-0 rounded-lg bg-red-500 opacity-40 animate-ping" />
      )}
      {recording ? <Square size={15} className="relative z-10" /> : <Mic size={15} />}
    </button>
  );
}
