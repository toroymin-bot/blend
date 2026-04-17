'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, Link, Mic, Loader2, Trash2, FileAudio, CheckSquare, Square, Tag, AlertCircle } from 'lucide-react';
import { useMeetingStore } from '@/stores/meeting-store';
import { useAPIKeyStore } from '@/stores/api-key-store';
import { MeetingAnalysis, ActionItem } from '@/types';
import { diarizeSpeakers, analyzeMeeting, summarizeMeeting, generateMindmap } from './meeting-plugin';
import { MeetingMindmap } from './meeting-mindmap';
import { useDocumentStore } from '@/stores/document-store';
import { generateEmbeddings } from '@/modules/plugins/document-plugin';
import { useTranslation } from '@/lib/i18n';

type InputTab = 'file' | 'youtube';
type ResultTab = 'transcript' | 'analysis' | 'summary' | 'mindmap';
type ProcessStep = 'idle' | 'transcribing' | 'diarizing' | 'analyzing' | 'embedding' | 'done' | 'error';

const ACCEPT_TYPES = '.mp3,.wav,.m4a,.webm,.ogg,.mp4';

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function PriorityBadge({ priority }: { priority: ActionItem['priority'] }) {
  const { t } = useTranslation();
  const map: Record<ActionItem['priority'], string> = {
    high: t('meeting_view.priority_high'),
    medium: t('meeting_view.priority_medium'),
    low: t('meeting_view.priority_low'),
  };
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
  const { t } = useTranslation();
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

  const stepLabelMap: Record<ProcessStep, string> = {
    idle: '',
    transcribing: t('meeting_view.step_transcribing'),
    diarizing: t('meeting_view.step_diarizing'),
    analyzing: t('meeting_view.step_analyzing'),
    embedding: t('meeting_view.step_embedding'),
    done: t('meeting_view.step_done'),
    error: t('meeting_view.step_error'),
  };

  const processTranscript = useCallback(async (rawTranscript: string, title: string, source: 'file' | 'youtube', sourceUrl?: string) => {
    const openaiKey = getKey('openai');
    const anthropicKey = getKey('anthropic');
    const apiKey = openaiKey || anthropicKey;
    const provider = openaiKey ? 'openai' : 'anthropic';

    if (!apiKey) {
      setErrorMsg(t('meeting_view.no_openai_key'));
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

      // [2026-04-16 01:20] New: generate markdown mindmap after analysis
      let mindmapMarkdown: string | undefined;
      try {
        mindmapMarkdown = await generateMindmap(rawTranscript, title, apiKey, provider as 'openai' | 'anthropic');
      } catch {
        // mindmap failure doesn't block meeting save
      }

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
        mindmap: mindmapMarkdown,
      };

      addMeeting(meeting);

      // RAG indexing
      setStep('embedding');
      const CHUNK_SIZE = 1000;
      const chunks: { text: string; source: string }[] = [];
      for (let i = 0; i < rawTranscript.length; i += CHUNK_SIZE) {
        chunks.push({ text: rawTranscript.slice(i, i + CHUNK_SIZE), source: `${title} (${i}~${i + CHUNK_SIZE})` });
      }
      const docName = t('meeting_view.doc_name_prefix') + title;
      const doc = { id: meeting.id, name: docName, type: 'meeting', chunks, totalChars: rawTranscript.length };
      addDocument(doc);

      try {
        const embeddedDoc = await generateEmbeddings(doc, openaiKey || getKey('google'), openaiKey ? 'openai' : 'google');
        updateDocument(embeddedDoc);
      } catch {
        // Keep meeting even if embedding fails
      }

      setStep('done');
      setResultTab('transcript');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : t('meeting_view.analysis_error'));
      setStep('error');
    }
  }, [getKey, addMeeting, addDocument, updateDocument, t]);

  const handleFile = useCallback(async (file: File) => {
    // [2026-04-18 01:00] Fix: support Google STT as fallback when no OpenAI key
    const openaiKey = getKey('openai');
    const googleKey = getKey('google');

    // [2026-04-18 01:00] disabled — if (!openaiKey) { setErrorMsg(t('meeting_view.no_transcription_key')); setStep('error'); return; }
    if (!openaiKey && !googleKey) {
      setErrorMsg(t('meeting_view.no_transcription_key'));
      setStep('error');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setErrorMsg(t('meeting_view.file_too_large'));
      setStep('error');
      return;
    }

    setStep('transcribing');
    setErrorMsg('');

    try {
      if (openaiKey) {
        // OpenAI gpt-4o-transcribe — best quality
        const formData = new FormData();
        formData.append('file', file);
        // [2026-04-16 01:20] disabled — formData.append('model', 'whisper-1'); // 2022 model, poor Korean quality
        formData.append('model', 'gpt-4o-transcribe'); // [2026-04-16] upgraded: latest model, better Korean
        // [2026-04-17] Fix: gpt-4o-transcribe does not support verbose_json → use json
        formData.append('response_format', 'json');
        const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${openaiKey}` },
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: { message?: string } })?.error?.message || t('meeting_view.transcription_failed', { status: String(res.status) }));
        }
        const data = await res.json();
        const text = data.text ?? '';
        await processTranscript(text, file.name.replace(/\.[^.]+$/, ''), 'file');
      } else {
        // [2026-04-18 01:00] Google STT fallback — works for webm/ogg; m4a/mp4 not supported
        const { sttGoogle } = await import('@/lib/voice-chat');
        const text = await sttGoogle(file as Blob, googleKey!, 'ko');
        await processTranscript(text, file.name.replace(/\.[^.]+$/, ''), 'file');
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : t('meeting_view.transcription_error'));
      setStep('error');
    }
  }, [getKey, processTranscript, t]);

  function extractVideoId(url: string): string | null {
    try {
      const u = new URL(url);
      if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0];
      if (u.hostname.includes('youtube.com')) {
        const v = u.searchParams.get('v');
        if (v) return v;
        const em = u.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/);
        if (em) return em[1];
      }
    } catch {}
    return null;
  }

  async function fetchYouTubeTranscriptClient(videoId: string): Promise<{ rawText: string; title: string }> {
    const langs = ['ko', 'en', ''];
    for (const lang of langs) {
      const langParam = lang ? `&lang=${lang}` : '';
      const url = `https://www.youtube.com/api/timedtext?v=${videoId}&fmt=srv3${langParam}`;
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const xml = await res.text();
        if (!xml || xml.trim() === '') continue;
        const matches = xml.match(/<text[^>]*>([^<]*)<\/text>/g) || [];
        if (matches.length === 0) continue;
        const rawText = matches.map((m) => m.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')).join(' ').replace(/\s+/g, ' ').trim();
        if (rawText) return { rawText, title: t('meeting_view.youtube_title', { id: videoId }) };
      } catch {}
    }
    throw new Error(t('meeting_view.subtitle_not_found'));
  }

  const handleYoutube = useCallback(async () => {
    if (!youtubeUrl.trim()) return;
    setStep('transcribing');
    setErrorMsg('');

    try {
      const videoId = extractVideoId(youtubeUrl.trim());
      if (!videoId) throw new Error(t('meeting_view.invalid_youtube_url'));
      const { rawText, title } = await fetchYouTubeTranscriptClient(videoId);
      await processTranscript(rawText, title || t('meeting_view.youtube_title', { id: videoId }), 'youtube', youtubeUrl.trim());
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : t('meeting_view.youtube_error'));
      setStep('error');
    }
  }, [youtubeUrl, processTranscript, t]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const isProcessing = ['transcribing', 'diarizing', 'analyzing', 'embedding'].includes(step);

  return (
    <div className="flex flex-col md:flex-row h-full overflow-hidden">
      {/* Meeting list sidebar — desktop only */}
      <div className="hidden md:flex md:w-56 flex-shrink-0 bg-surface-2 border-r border-border-token flex-col">
        <div className="p-3 border-b border-border-token">
          <h2 className="text-sm font-semibold text-on-surface flex items-center gap-2">
            <Mic size={14} />
            {t('meeting_view.sidebar_title')}
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {meetings.length === 0 ? (
            <p className="p-3 text-xs text-on-surface-muted">{t('meeting_view.no_meetings')}</p>
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
                  <span className="text-xs text-on-surface-muted">{new Date(m.createdAt).toLocaleDateString()}</span>
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
            {t('meeting_view.new_analysis')}
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* New analysis form */}
        {!currentMeeting && (
          <div className="max-w-2xl mx-auto space-y-5">
            <h1 className="text-lg font-semibold text-on-surface">{t('meeting_view.main_title')}</h1>

            {/* Input tab selector */}
            <div className="flex gap-1 bg-surface-2 rounded-lg p-1 w-fit">
              {([['file', t('meeting_view.file_upload')], ['youtube', t('meeting_view.youtube_link')]] as const).map(([id, label]) => (
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
                <p className="text-sm text-on-surface mb-1">{t('meeting_view.drop_audio')}</p>
                <p className="text-xs text-on-surface-muted">{t('meeting_view.supported_formats')}</p>
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
                    {t('meeting_view.analyze_btn')}
                  </button>
                </div>
                <p className="text-xs text-on-surface-muted">{t('meeting_view.youtube_hint')}</p>
              </div>
            )}

            {/* Processing status */}
            {isProcessing && (
              <div className="flex items-center gap-3 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                <Loader2 size={18} className="animate-spin text-blue-400 flex-shrink-0" />
                <span className="text-sm text-blue-300">{stepLabelMap[step]}</span>
              </div>
            )}

            {/* Error */}
            {step === 'error' && (
              <div className="flex items-start gap-3 p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
                <AlertCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-300">{t('meeting_view.error_label')}</p>
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
                <p className="text-xs text-on-surface-muted">{new Date(currentMeeting.createdAt).toLocaleString()}</p>
              </div>
            </div>

            {/* Result tabs */}
            <div className="flex gap-1 bg-surface-2 rounded-lg p-1 w-fit">
              {([
                ['transcript', t('meeting_view.tab_transcript')],
                ['analysis', t('meeting_view.tab_analysis')],
                ['summary', t('meeting_view.tab_summary')],
                // [2026-04-16 01:20] New: mindmap visualization tab
                ['mindmap', 'Mind Map'],
              ] as const).map(([id, label]) => (
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
                  <h3 className="text-sm font-semibold text-on-surface mb-2 flex items-center gap-2"><Tag size={14} />{t('meeting_view.topics_label')}</h3>
                  <div className="flex flex-wrap gap-2">
                    {currentMeeting.topics.map((topic, i) => (
                      <span key={i} className="px-3 py-1 bg-blue-900/40 text-blue-300 rounded-full text-sm">{topic}</span>
                    ))}
                    {currentMeeting.topics.length === 0 && <p className="text-sm text-on-surface-muted">{t('meeting_view.no_topics')}</p>}
                  </div>
                </div>

                {/* Action items */}
                <div>
                  <h3 className="text-sm font-semibold text-on-surface mb-2 flex items-center gap-2"><CheckSquare size={14} />{t('meeting_view.action_items_label')}</h3>
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
                              {item.owner && `${t('meeting_view.assignee')}: ${item.owner}`}{item.owner && item.deadline && ' · '}{item.deadline && `${t('meeting_view.due_date')}: ${item.deadline}`}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                    {currentMeeting.actionItems.length === 0 && <p className="text-sm text-on-surface-muted">{t('meeting_view.no_action_items')}</p>}
                  </div>
                </div>

                {/* Decisions */}
                <div>
                  <h3 className="text-sm font-semibold text-on-surface mb-2">{t('meeting_view.decisions_label')}</h3>
                  <div className="space-y-2">
                    {currentMeeting.decisions.map((d, i) => (
                      <div key={i} className="flex items-start gap-2 p-3 bg-surface-2 rounded-lg">
                        <span className="text-green-400 mt-0.5">✓</span>
                        <span className="text-sm text-on-surface">{d}</span>
                      </div>
                    ))}
                    {currentMeeting.decisions.length === 0 && <p className="text-sm text-on-surface-muted">{t('meeting_view.no_decisions')}</p>}
                  </div>
                </div>
              </div>
            )}

            {/* Summary tab */}
            {resultTab === 'summary' && (
              <div className="space-y-4">
                <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                  <p className="text-sm font-medium text-blue-300 mb-1">{t('meeting_view.tab_summary')}</p>
                  <p className="text-base text-on-surface">{currentMeeting.summary.oneLiner || '—'}</p>
                </div>
                <div className="p-4 bg-surface-2 rounded-lg">
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
                    <p className="text-sm text-on-surface whitespace-pre-wrap leading-relaxed">{currentMeeting.summary.full}</p>
                  </div>
                )}
              </div>
            )}

            {/* Mind Map tab — [2026-04-16 01:20] New tab */}
            {resultTab === 'mindmap' && (
              <div className="space-y-3">
                {currentMeeting.mindmap ? (
                  <MeetingMindmap markdown={currentMeeting.mindmap} />
                ) : (
                  <div className="p-6 bg-surface-2 rounded-lg text-center text-on-surface-muted text-sm">
                    Mind map not available for this meeting. Re-analyze to generate one.
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
