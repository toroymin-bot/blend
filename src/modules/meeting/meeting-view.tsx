'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, Link, Mic, Loader2, Trash2, FileAudio, CheckSquare, Square, Tag, AlertCircle } from 'lucide-react';
import { useMeetingStore } from '@/stores/meeting-store';
import { useAPIKeyStore } from '@/stores/api-key-store';
import { MeetingAnalysis, ActionItem } from '@/types';
import { diarizeSpeakers, analyzeMeeting, summarizeMeeting } from './meeting-plugin';
import { useDocumentStore } from '@/stores/document-store';
import { generateEmbeddings } from '@/modules/plugins/document-plugin';

type InputTab = 'file' | 'youtube';
type ResultTab = 'transcript' | 'analysis' | 'summary';
type ProcessStep = 'idle' | 'transcribing' | 'diarizing' | 'analyzing' | 'embedding' | 'done' | 'error';

const ACCEPT_TYPES = '.mp3,.wav,.m4a,.webm,.ogg,.mp4';

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function PriorityBadge({ priority }: { priority: ActionItem['priority'] }) {
  const map = { high: '높음', medium: '보통', low: '낮음' };
  const colors = {
    high: 'bg-red-900/40 text-red-300',
    medium: 'bg-yellow-900/40 text-yellow-300',
    low: 'bg-green-900/40 text-green-300',
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${colors[priority]}`}>
      {map[priority]}
    </span>
  );
}

export function MeetingView() {
  const { meetings, currentMeetingId, addMeeting, deleteMeeting, setCurrentMeeting, loadFromStorage } = useMeetingStore();
  const { getKey } = useAPIKeyStore();
  const { addDocument, updateDocument } = useDocumentStore();

  const [inputTab, setInputTab] = useState<InputTab>('file');
  const [resultTab, setResultTab] = useState<ResultTab>('transcript');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [step, setStep] = useState<ProcessStep>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [completedItems, setCompletedItems] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadFromStorage();
  }, []);

  const currentMeeting = meetings.find((m) => m.id === currentMeetingId) ?? null;

  const processTranscript = useCallback(async (rawTranscript: string, title: string, source: 'file' | 'youtube', sourceUrl?: string) => {
    const openaiKey = getKey('openai');
    const anthropicKey = getKey('anthropic');
    const apiKey = openaiKey || anthropicKey;
    const provider = openaiKey ? 'openai' : 'anthropic';

    if (!apiKey) {
      setErrorMsg('OpenAI 또는 Anthropic API 키를 설정해주세요.');
      setStep('error');
      return;
    }

    try {
      setStep('diarizing');
      const segments = await diarizeSpeakers(rawTranscript, apiKey, provider as 'openai' | 'anthropic');

      setStep('analyzing');
      const [analysisResult, summaryResult] = await Promise.all([
        analyzeMeeting(rawTranscript, apiKey, provider as 'openai' | 'anthropic'),
        summarizeMeeting(rawTranscript, apiKey, provider as 'openai' | 'anthropic'),
      ]);

      const meeting: MeetingAnalysis = {
        id: Math.random().toString(36).slice(2) + Date.now().toString(36),
        title,
        source,
        sourceUrl,
        createdAt: Date.now(),
        rawTranscript,
        segments,
        topics: analysisResult.topics,
        actionItems: analysisResult.actionItems,
        decisions: analysisResult.decisions,
        summary: summaryResult,
      };

      addMeeting(meeting);

      // RAG indexing
      setStep('embedding');
      const CHUNK_SIZE = 1000;
      const chunks: { text: string; source: string }[] = [];
      for (let i = 0; i < rawTranscript.length; i += CHUNK_SIZE) {
        chunks.push({ text: rawTranscript.slice(i, i + CHUNK_SIZE), source: `${title} (${i}~${i + CHUNK_SIZE}자)` });
      }
      const doc = { id: meeting.id, name: `[회의] ${title}`, type: 'meeting', chunks, totalChars: rawTranscript.length };
      addDocument(doc);

      try {
        const embeddedDoc = await generateEmbeddings(doc, openaiKey || getKey('google'), openaiKey ? 'openai' : 'google');
        updateDocument(embeddedDoc);
      } catch {
        // 임베딩 실패해도 회의 저장은 유지
      }

      setStep('done');
      setResultTab('transcript');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '분석 중 오류가 발생했습니다.');
      setStep('error');
    }
  }, [getKey, addMeeting, addDocument, updateDocument]);

  const handleFile = useCallback(async (file: File) => {
    const openaiKey = getKey('openai');
    if (!openaiKey) {
      setErrorMsg('파일 전사에는 OpenAI API 키가 필요합니다.');
      setStep('error');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setErrorMsg('파일 크기가 25MB를 초과합니다. (Whisper 제한)');
      setStep('error');
      return;
    }

    setStep('transcribing');
    setErrorMsg('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'X-API-Key': openaiKey },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `전사 실패: ${res.status}`);
      }
      const { text } = await res.json();
      await processTranscript(text, file.name.replace(/\.[^.]+$/, ''), 'file');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '전사 중 오류가 발생했습니다.');
      setStep('error');
    }
  }, [getKey, processTranscript]);

  const handleYoutube = useCallback(async () => {
    if (!youtubeUrl.trim()) return;
    setStep('transcribing');
    setErrorMsg('');

    try {
      const res = await fetch('/api/youtube-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: youtubeUrl.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `자막 추출 실패: ${res.status}`);
      }
      const { rawText, title } = await res.json();
      await processTranscript(rawText, title || 'YouTube 회의', 'youtube', youtubeUrl.trim());
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '자막 추출 중 오류가 발생했습니다.');
      setStep('error');
    }
  }, [youtubeUrl, processTranscript]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const isProcessing = ['transcribing', 'diarizing', 'analyzing', 'embedding'].includes(step);

  const stepLabel: Record<ProcessStep, string> = {
    idle: '',
    transcribing: '음성 인식 중...',
    diarizing: '화자 분리 중...',
    analyzing: '주제 및 할일 분석 중...',
    embedding: 'RAG 인덱싱 중...',
    done: '분석 완료',
    error: '오류 발생',
  };

  return (
    <div className="flex flex-col md:flex-row h-full overflow-hidden">
      {/* Meeting list sidebar — desktop only */}
      <div className="hidden md:flex md:w-56 flex-shrink-0 bg-surface-2 border-r border-border-token flex-col">
        <div className="p-3 border-b border-border-token">
          <h2 className="text-sm font-semibold text-on-surface flex items-center gap-2">
            <Mic size={14} />
            회의 분석
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {meetings.length === 0 ? (
            <p className="p-3 text-xs text-on-surface-muted">저장된 회의 없음</p>
          ) : (
            meetings.map((m) => (
              <div
                key={m.id}
                onClick={() => { setCurrentMeeting(m.id); setStep('done'); setResultTab('transcript'); }}
                className={`group px-3 py-2.5 cursor-pointer flex items-start justify-between gap-2 transition-colors ${currentMeetingId === m.id ? 'bg-gray-700' : 'hover:bg-gray-700/50'}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {m.source === 'youtube' ? <span className="text-red-400 text-xs flex-shrink-0">YT</span> : <FileAudio size={11} className="text-blue-400 flex-shrink-0" />}
                    <span className="text-xs text-on-surface truncate">{m.title}</span>
                  </div>
                  <span className="text-xs text-on-surface-muted">{new Date(m.createdAt).toLocaleDateString('ko-KR')}</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteMeeting(m.id); }}
                  className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 p-0.5 rounded flex-shrink-0"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))
          )}
        </div>
        <div className="p-3 border-t border-border-token">
          <button
            onClick={() => { setCurrentMeeting(null); setStep('idle'); setErrorMsg(''); setYoutubeUrl(''); }}
            className="w-full text-xs py-1.5 px-2 rounded bg-blue-600 hover:bg-blue-700 text-white"
          >
            + 새 분석
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* New analysis form */}
        {!currentMeeting && (
          <div className="max-w-2xl mx-auto space-y-5">
            <h1 className="text-lg font-semibold text-on-surface">회의/녹음 분석</h1>

            {/* Input tab selector */}
            <div className="flex gap-1 bg-surface-2 rounded-lg p-1 w-fit">
              {([['file', '파일 업로드'], ['youtube', 'YouTube 링크']] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setInputTab(id)}
                  className={`px-4 py-1.5 rounded-md text-sm transition-colors ${inputTab === id ? 'bg-blue-600 text-white' : 'text-on-surface-muted hover:text-on-surface'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* File upload */}
            {inputTab === 'file' && (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => !isProcessing && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${dragOver ? 'border-blue-400 bg-blue-900/20' : 'border-border-token hover:border-blue-500/60'} ${isProcessing ? 'pointer-events-none opacity-60' : ''}`}
              >
                <input ref={fileInputRef} type="file" accept={ACCEPT_TYPES} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                <Upload size={32} className="mx-auto mb-3 text-on-surface-muted" />
                <p className="text-sm text-on-surface mb-1">여기에 오디오/비디오 파일을 드롭하거나 클릭하세요</p>
                <p className="text-xs text-on-surface-muted">지원 형식: mp3, wav, m4a, webm, ogg, mp4 (최대 25MB)</p>
              </div>
            )}

            {/* YouTube URL */}
            {inputTab === 'youtube' && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center gap-2 bg-surface-2 border border-border-token rounded-lg px-3 py-2.5">
                    <Link size={16} className="text-on-surface-muted flex-shrink-0" />
                    <input
                      type="url"
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleYoutube(); }}
                      placeholder="https://youtube.com/watch?v=..."
                      disabled={isProcessing}
                      className="flex-1 bg-transparent text-sm text-on-surface placeholder-on-surface-muted outline-none"
                    />
                  </div>
                  <button
                    onClick={handleYoutube}
                    disabled={!youtubeUrl.trim() || isProcessing}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white rounded-lg text-sm"
                  >
                    분석 시작
                  </button>
                </div>
                <p className="text-xs text-on-surface-muted">한국어 자막 우선, 없으면 영어 자막을 사용합니다. 자막 없는 영상은 지원되지 않습니다.</p>
              </div>
            )}

            {/* Processing status */}
            {isProcessing && (
              <div className="flex items-center gap-3 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                <Loader2 size={18} className="animate-spin text-blue-400 flex-shrink-0" />
                <span className="text-sm text-blue-300">{stepLabel[step]}</span>
              </div>
            )}

            {/* Error */}
            {step === 'error' && (
              <div className="flex items-start gap-3 p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
                <AlertCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-300">오류</p>
                  <p className="text-sm text-red-400 mt-0.5">{errorMsg}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Meeting results */}
        {currentMeeting && (
          <div className="max-w-3xl mx-auto space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {currentMeeting.source === 'youtube' ? <span className="text-red-400 text-sm font-bold">YT</span> : <FileAudio size={16} className="text-blue-400" />}
                  <h1 className="text-lg font-semibold text-on-surface">{currentMeeting.title}</h1>
                </div>
                <p className="text-xs text-on-surface-muted">{new Date(currentMeeting.createdAt).toLocaleString('ko-KR')}</p>
              </div>
            </div>

            {/* Result tabs */}
            <div className="flex gap-1 bg-surface-2 rounded-lg p-1 w-fit">
              {([['transcript', '대화 내용'], ['analysis', '분석'], ['summary', '요약']] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setResultTab(id)}
                  className={`px-4 py-1.5 rounded-md text-sm transition-colors ${resultTab === id ? 'bg-blue-600 text-white' : 'text-on-surface-muted hover:text-on-surface'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Transcript tab */}
            {resultTab === 'transcript' && (
              <div className="space-y-3">
                {currentMeeting.segments.length === 0 ? (
                  <div className="p-4 bg-surface-2 rounded-lg">
                    <p className="text-sm text-on-surface whitespace-pre-wrap">{currentMeeting.rawTranscript}</p>
                  </div>
                ) : (
                  currentMeeting.segments.map((seg, i) => {
                    const isLeft = i % 2 === 0;
                    return (
                      <div key={i} className={`flex gap-3 ${isLeft ? '' : 'flex-row-reverse'}`}>
                        <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-on-surface flex-shrink-0">
                          {seg.speaker.replace(/[^0-9]/g, '') || (i + 1)}
                        </div>
                        <div className={`max-w-[75%] ${isLeft ? '' : 'items-end'} flex flex-col`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-on-surface-muted">{seg.speaker}</span>
                            {seg.startTime !== undefined && (
                              <span className="text-xs text-on-surface-muted/60">{formatTime(seg.startTime)}</span>
                            )}
                          </div>
                          <div className={`p-3 rounded-xl text-sm text-on-surface ${isLeft ? 'bg-surface-2 rounded-tl-sm' : 'bg-blue-900/40 rounded-tr-sm'}`}>
                            {seg.text}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Analysis tab */}
            {resultTab === 'analysis' && (
              <div className="space-y-5">
                {/* Topics */}
                <div>
                  <h3 className="text-sm font-semibold text-on-surface mb-2 flex items-center gap-2"><Tag size={14} />주요 주제</h3>
                  <div className="flex flex-wrap gap-2">
                    {currentMeeting.topics.map((t, i) => (
                      <span key={i} className="px-3 py-1 bg-blue-900/40 text-blue-300 rounded-full text-sm">{t}</span>
                    ))}
                    {currentMeeting.topics.length === 0 && <p className="text-sm text-on-surface-muted">주제를 찾을 수 없습니다</p>}
                  </div>
                </div>

                {/* Action items */}
                <div>
                  <h3 className="text-sm font-semibold text-on-surface mb-2 flex items-center gap-2"><CheckSquare size={14} />할일 목록</h3>
                  <div className="space-y-2">
                    {currentMeeting.actionItems.map((item, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 bg-surface-2 rounded-lg">
                        <button onClick={() => setCompletedItems((prev) => { const next = new Set(prev); next.has(i) ? next.delete(i) : next.add(i); return next; })} className="mt-0.5 flex-shrink-0 text-blue-400 hover:text-blue-300">
                          {completedItems.has(i) ? <CheckSquare size={16} /> : <Square size={16} />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-sm text-on-surface ${completedItems.has(i) ? 'line-through text-on-surface-muted' : ''}`}>{item.task}</span>
                            <PriorityBadge priority={item.priority} />
                          </div>
                          {(item.owner || item.deadline) && (
                            <p className="text-xs text-on-surface-muted mt-0.5">
                              {item.owner && `담당: ${item.owner}`}{item.owner && item.deadline && ' · '}{item.deadline && `기한: ${item.deadline}`}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                    {currentMeeting.actionItems.length === 0 && <p className="text-sm text-on-surface-muted">할일이 없습니다</p>}
                  </div>
                </div>

                {/* Decisions */}
                <div>
                  <h3 className="text-sm font-semibold text-on-surface mb-2">결정사항</h3>
                  <div className="space-y-2">
                    {currentMeeting.decisions.map((d, i) => (
                      <div key={i} className="flex items-start gap-2 p-3 bg-surface-2 rounded-lg">
                        <span className="text-green-400 mt-0.5">✓</span>
                        <span className="text-sm text-on-surface">{d}</span>
                      </div>
                    ))}
                    {currentMeeting.decisions.length === 0 && <p className="text-sm text-on-surface-muted">결정사항이 없습니다</p>}
                  </div>
                </div>
              </div>
            )}

            {/* Summary tab */}
            {resultTab === 'summary' && (
              <div className="space-y-4">
                <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                  <p className="text-sm font-medium text-blue-300 mb-1">한 줄 요약</p>
                  <p className="text-base text-on-surface">{currentMeeting.summary.oneLiner || '—'}</p>
                </div>
                <div className="p-4 bg-surface-2 rounded-lg">
                  <p className="text-sm font-medium text-on-surface mb-3">핵심 요점</p>
                  <ul className="space-y-2">
                    {currentMeeting.summary.bullets.map((b, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-on-surface">
                        <span className="text-blue-400 flex-shrink-0 mt-0.5">•</span>
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
                {currentMeeting.summary.full && (
                  <div className="p-4 bg-surface-2 rounded-lg">
                    <p className="text-sm font-medium text-on-surface mb-2">전체 요약</p>
                    <p className="text-sm text-on-surface whitespace-pre-wrap leading-relaxed">{currentMeeting.summary.full}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
