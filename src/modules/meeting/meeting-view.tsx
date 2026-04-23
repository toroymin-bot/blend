'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, Link, Mic, Loader2, Trash2, FileAudio, CheckSquare, Square, Tag, AlertCircle, Printer, X as XIcon } from 'lucide-react';
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

// ── PDF Preview Modal ─────────────────────────────────────────────────────────
// [2026-04-20 PREV-01] PDF preview modal — shows professional meeting minutes format
// Print via browser window.print() with @media print CSS

function PdfPreviewModal({ meeting, onClose }: { meeting: MeetingAnalysis; onClose: () => void }) {
  const { t } = useTranslation();
  const date = new Date(meeting.createdAt);
  const dateStr = date.toLocaleDateString();
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const handlePrint = () => {
    // Open a print-dedicated popup window
    const pw = window.open('', '_blank', 'width=800,height=900');
    if (!pw) { window.print(); return; }

    const styles = `
      body { font-family: 'Noto Sans KR', Arial, sans-serif; margin: 40px; color: #111; font-size: 13px; }
      h1 { font-size: 20px; font-weight: bold; margin-bottom: 4px; }
      h2 { font-size: 15px; font-weight: bold; margin-top: 20px; margin-bottom: 6px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
      h3 { font-size: 13px; font-weight: 600; margin: 8px 0 4px; }
      .meta { color: #666; font-size: 12px; margin-bottom: 16px; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; margin-right: 4px; }
      .badge-high { background: #fee2e2; color: #b91c1c; }
      .badge-med { background: #fef3c7; color: #92400e; }
      .badge-low { background: #d1fae5; color: #065f46; }
      .segment { margin-bottom: 8px; padding: 6px 10px; background: #f9f9f9; border-radius: 6px; }
      .speaker { font-weight: 600; margin-right: 6px; color: #1d4ed8; }
      ul { margin: 0; padding-left: 18px; }
      li { margin-bottom: 3px; }
      .action-row { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 4px; }
      .action-row .task { flex: 1; }
      .decision { padding: 4px 10px; background: #f0fdf4; border-left: 3px solid #16a34a; margin-bottom: 4px; }
      @media print { body { margin: 20px; } }
    `;

    const priorityBadge = (p: string) => {
      const cls = p === 'high' ? 'badge-high' : p === 'medium' ? 'badge-med' : 'badge-low';
      const label = p === 'high' ? t('meeting_view.priority_high') : p === 'medium' ? t('meeting_view.priority_medium') : t('meeting_view.priority_low');
      return `<span class="badge ${cls}">${label}</span>`;
    };

    const transcriptHtml = meeting.segments.length > 0
      ? meeting.segments.map((s) =>
          `<div class="segment"><span class="speaker">${s.speaker}</span>${s.text}</div>`
        ).join('')
      : `<div class="segment">${meeting.rawTranscript.replace(/\n/g, '<br/>')}</div>`;

    const topicsHtml = meeting.topics.map((t) => `<li>${t}</li>`).join('');

    const actionHtml = meeting.actionItems.map((a) =>
      `<div class="action-row"><span class="task">${a.task}</span>${priorityBadge(a.priority)}${a.owner ? `<span>${a.owner}</span>` : ''}${a.deadline ? `<span>${a.deadline}</span>` : ''}</div>`
    ).join('');

    const decisionHtml = meeting.decisions.map((d) => `<div class="decision">✓ ${d}</div>`).join('');

    const summaryHtml = `
      <p><strong>${meeting.summary.oneLiner || '—'}</strong></p>
      <ul>${meeting.summary.bullets.map((b) => `<li>${b}</li>`).join('')}</ul>
      ${meeting.summary.full ? `<p style="margin-top:8px;white-space:pre-wrap">${meeting.summary.full}</p>` : ''}
    `;

    pw.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${t('meeting_view.pdf_preview_title')} — ${meeting.title}</title><style>${styles}</style></head><body>
      <h1>📋 ${meeting.title}</h1>
      <div class="meta">
        📅 ${t('meeting_view.pdf_date_label')}: ${dateStr} &nbsp;|&nbsp; ⏰ ${t('meeting_view.pdf_time_label')}: ${timeStr} &nbsp;|&nbsp; 📁 ${t('meeting_view.pdf_source_label')}: ${meeting.source === 'youtube' ? 'YouTube' : t('meeting_view.pdf_source_file')}
      </div>
      ${meeting.topics.length > 0 ? `<h2>🏷️ ${t('meeting_view.pdf_topics_label')}</h2><ul>${topicsHtml}</ul>` : ''}
      <h2>💬 ${t('meeting_view.pdf_transcript_label')}</h2>${transcriptHtml}
      <h2>📊 ${t('meeting_view.pdf_analysis_label')}</h2>
      ${meeting.decisions.length > 0 ? `<h3>${t('meeting_view.pdf_decisions_label')}</h3>${decisionHtml}` : ''}
      ${meeting.actionItems.length > 0 ? `<h3>${t('meeting_view.pdf_action_items_label')}</h3>${actionHtml}` : ''}
      <h2>📝 ${t('meeting_view.pdf_summary_label')}</h2>${summaryHtml}
    </body></html>`);
    pw.document.close();
    setTimeout(() => { pw.focus(); pw.print(); }, 300);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Printer size={18} className="text-blue-400" /> {t('meeting_view.pdf_preview_title')}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <XIcon size={20} />
          </button>
        </div>

        {/* Preview content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 text-sm text-gray-200">
          {/* Header info */}
          <div>
            <h1 className="text-xl font-bold text-white mb-1">📋 {meeting.title}</h1>
            <div className="flex flex-wrap gap-3 text-xs text-gray-400">
              <span>📅 {dateStr}</span>
              <span>⏰ {timeStr}</span>
              <span>📁 {meeting.source === 'youtube' ? 'YouTube' : t('meeting_view.pdf_source_file')}</span>
            </div>
          </div>

          {/* Topics */}
          {meeting.topics.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">🏷️ {t('meeting_view.pdf_topics_label')}</h3>
              <div className="flex flex-wrap gap-2">
                {meeting.topics.map((topic, i) => (
                  <span key={i} className="px-2 py-0.5 bg-blue-900/40 text-blue-300 rounded-full text-xs">{topic}</span>
                ))}
              </div>
            </div>
          )}

          {/* Transcript */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">💬 {t('meeting_view.pdf_transcript_label')}</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto bg-gray-800/40 rounded-lg p-3">
              {meeting.segments.length > 0 ? meeting.segments.map((s, i) => (
                <div key={i} className="text-xs">
                  <span className="font-semibold text-blue-300 mr-2">{s.speaker}</span>
                  <span className="text-gray-300">{s.text}</span>
                </div>
              )) : (
                <p className="text-xs text-gray-400 whitespace-pre-wrap line-clamp-6">{meeting.rawTranscript}</p>
              )}
            </div>
          </div>

          {/* Decisions */}
          {meeting.decisions.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">✅ {t('meeting_view.pdf_decisions_label')}</h3>
              <div className="space-y-1">
                {meeting.decisions.map((d, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="text-green-400 shrink-0">✓</span>
                    <span className="text-gray-300">{d}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Items */}
          {meeting.actionItems.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">📌 {t('meeting_view.pdf_action_items_label')}</h3>
              <div className="space-y-1.5">
                {meeting.actionItems.map((a, i) => {
                  const badgeColor = a.priority === 'high' ? 'bg-red-900/40 text-red-300' : a.priority === 'medium' ? 'bg-yellow-900/40 text-yellow-300' : 'bg-green-900/40 text-green-300';
                  return (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className={`px-1.5 py-0.5 rounded ${badgeColor} shrink-0`}>
                        {a.priority === 'high' ? t('meeting_view.priority_high') : a.priority === 'medium' ? t('meeting_view.priority_medium') : t('meeting_view.priority_low')}
                      </span>
                      <span className="text-gray-300 flex-1">{a.task}</span>
                      {a.owner && <span className="text-gray-500">{a.owner}</span>}
                      {a.deadline && <span className="text-gray-500">{a.deadline}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Summary */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">📝 {t('meeting_view.pdf_summary_label')}</h3>
            <p className="text-sm font-medium text-blue-300 mb-2">{meeting.summary.oneLiner || '—'}</p>
            <ul className="space-y-1">
              {meeting.summary.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-gray-300">
                  <span className="text-blue-400 shrink-0">•</span>{b}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-600 hover:border-gray-500 rounded-lg transition-colors"
          >
            {t('meeting_view.pdf_cancel')}
          </button>
          <button
            onClick={handlePrint}
            className="px-5 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center gap-2 transition-colors"
          >
            <Printer size={14} /> {t('meeting_view.pdf_print')}
          </button>
        </div>
      </div>
    </div>
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
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // [2026-04-18] Manual transcript paste fallback (for ASR-only YouTube videos)
  const [showManualPaste, setShowManualPaste] = useState(false);
  const [manualTranscript, setManualTranscript] = useState('');
  // [2026-04-18] Audio transcription sub-label: shown during Whisper audio extraction (can take 30-120s)
  const [audioTranscribingMsg, setAudioTranscribingMsg] = useState<string | null>(null);

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

  // [2026-04-18] disabled — old client-side timedtext API no longer works (YouTube requires signed URLs, empty response)
  // async function fetchYouTubeTranscriptClient_old(videoId: string): Promise<{ rawText: string; title: string }> {
  //   const langs = ['ko', 'en', ''];
  //   for (const lang of langs) {
  //     const langParam = lang ? `&lang=${lang}` : '';
  //     const url = `https://www.youtube.com/api/timedtext?v=${videoId}&fmt=srv3${langParam}`;
  //     try {
  //       const res = await fetch(url);
  //       if (!res.ok) continue;
  //       const xml = await res.text();
  //       if (!xml || xml.trim() === '') continue;
  //       const matches = xml.match(/<text[^>]*>([^<]*)<\/text>/g) || [];
  //       if (matches.length === 0) continue;
  //       const rawText = matches.map((m) => m.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')).join(' ').replace(/\s+/g, ' ').trim();
  //       if (rawText) return { rawText, title: t('meeting_view.youtube_title', { id: videoId }) };
  //     } catch {}
  //   }
  //   throw new Error(t('meeting_view.subtitle_not_found'));
  // }

  // [2026-04-18] New: server-side transcript via Vercel serverless function /api/yt-transcript
  // Root cause fix: YouTube deprecated unsigned timedtext API — now requires server-side extraction
  // [2026-04-18] Audio fallback: when captions unavailable, server returns audio URL → client transcribes via Whisper
  // Manual paste is last resort when both captions and audio extraction fail

  // Transcribe a YouTube audio stream URL using OpenAI Whisper (client-side, uses user's API key)
  async function transcribeYouTubeAudio(audioUrl: string, mimeType: string | undefined, openaiKey: string): Promise<string> {
    setAudioTranscribingMsg(t('meeting_view.audio_transcribing'));
    let audioBlob: Blob;
    try {
      const audioRes = await fetch(audioUrl);
      if (!audioRes.ok) throw new Error('HTTP ' + audioRes.status);
      audioBlob = await audioRes.blob();
    } catch {
      // CORS or network failure → fall through to manual paste
      const e = new Error(t('meeting_view.audio_fetch_failed'));
      (e as Error & { asrRestricted?: boolean }).asrRestricted = true;
      throw e;
    }

    // Whisper API limit: 25 MB (~60-90 min at lowest bitrate)
    if (audioBlob.size > 24.5 * 1024 * 1024) {
      const e = new Error(t('meeting_view.audio_too_large'));
      (e as Error & { asrRestricted?: boolean }).asrRestricted = true;
      throw e;
    }

    // Determine file extension from mimeType for Whisper compatibility
    const ext = mimeType?.includes('webm') ? 'webm' : mimeType?.includes('ogg') ? 'ogg' : 'm4a';

    const formData = new FormData();
    formData.append('file', audioBlob, `audio.${ext}`);
    formData.append('model', 'gpt-4o-transcribe');
    formData.append('response_format', 'json');

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}` },
      body: formData,
    });

    if (!whisperRes.ok) {
      const err = await whisperRes.json().catch(() => ({}));
      throw new Error(
        (err as { error?: { message?: string } })?.error?.message ||
        t('meeting_view.transcription_failed', { status: String(whisperRes.status) })
      );
    }
    const result = await whisperRes.json();
    return result.text || '';
  }

  async function fetchYouTubeTranscriptClient(videoId: string): Promise<{ rawText: string; title: string }> {
    const res = await fetch(`/api/yt-transcript?videoId=${encodeURIComponent(videoId)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string; asrRestricted?: boolean };
      const isAsr = err.asrRestricted === true;
      if (isAsr) {
        // Signal manual paste needed via a special error type
        const e = new Error(t('meeting_view.subtitle_asr_restricted'));
        (e as Error & { asrRestricted?: boolean }).asrRestricted = true;
        throw e;
      }
      throw new Error(err.error || t('meeting_view.subtitle_not_found'));
    }
    const data = await res.json() as {
      rawText?: string;
      source?: string;
      audioUrl?: string;
      audioMimeType?: string;
      contentLength?: number | null;
      segmentCount?: number;
    };

    // [2026-04-18] Audio fallback path: server couldn't get captions but extracted audio stream URL
    if (data.source === 'audio' && data.audioUrl) {
      const openaiKey = getKey('openai');
      if (!openaiKey) {
        // No OpenAI key → cannot Whisper → fall through to manual paste
        const e = new Error(t('meeting_view.subtitle_asr_restricted'));
        (e as Error & { asrRestricted?: boolean }).asrRestricted = true;
        throw e;
      }
      const rawText = await transcribeYouTubeAudio(data.audioUrl, data.audioMimeType, openaiKey);
      return { rawText, title: t('meeting_view.youtube_title', { id: videoId }) };
    }

    if (!data.rawText) throw new Error(t('meeting_view.subtitle_not_found'));
    return { rawText: data.rawText, title: t('meeting_view.youtube_title', { id: videoId }) };
  }

  const handleYoutube = useCallback(async () => {
    if (!youtubeUrl.trim()) return;
    setStep('transcribing');
    setErrorMsg('');
    setShowManualPaste(false);
    setAudioTranscribingMsg(null);

    try {
      const videoId = extractVideoId(youtubeUrl.trim());
      if (!videoId) throw new Error(t('meeting_view.invalid_youtube_url'));
      const { rawText, title } = await fetchYouTubeTranscriptClient(videoId);
      setAudioTranscribingMsg(null);
      await processTranscript(rawText, title || t('meeting_view.youtube_title', { id: videoId }), 'youtube', youtubeUrl.trim());
    } catch (e) {
      const isAsr = (e as Error & { asrRestricted?: boolean }).asrRestricted === true;
      setAudioTranscribingMsg(null);
      setErrorMsg(e instanceof Error ? e.message : t('meeting_view.youtube_error'));
      setStep('error');
      if (isAsr) setShowManualPaste(true);
    }
  }, [youtubeUrl, processTranscript, t]);

  // [2026-04-18] Fallback: analyze manually-pasted transcript text
  const handleManualTranscript = useCallback(async () => {
    if (!manualTranscript.trim()) return;
    setStep('analyzing');
    setErrorMsg('');
    setShowManualPaste(false);
    const videoId = extractVideoId(youtubeUrl.trim());
    const title = videoId ? t('meeting_view.youtube_title', { id: videoId }) : t('meeting_view.manual_transcript_title');
    try {
      await processTranscript(manualTranscript.trim(), title, 'youtube', youtubeUrl.trim() || undefined);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : t('meeting_view.youtube_error'));
      setStep('error');
    }
  }, [manualTranscript, youtubeUrl, processTranscript, t]);

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
            {/* [2026-04-18] disabled YouTube tab — YouTube ASR captions blocked from all server IPs (Vercel/datacenter), no reliable server-side workaround currently */}
            <div className="flex gap-1 bg-surface-2 rounded-lg p-1 w-fit">
              {([['file', t('meeting_view.file_upload')]] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setInputTab(id as InputTab)}
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

                {/* [2026-04-18] Manual transcript paste — shown when ASR captions fail */}
                {showManualPaste && (
                  <div className="mt-2 p-3 bg-yellow-900/20 border border-yellow-500/40 rounded-lg space-y-2">
                    <p className="text-xs text-yellow-300 font-medium">{t('meeting_view.youtube_manual_paste_hint')}</p>
                    <textarea
                      value={manualTranscript}
                      onChange={(e) => setManualTranscript(e.target.value)}
                      placeholder={t('meeting_view.youtube_manual_paste_placeholder')}
                      rows={6}
                      className="w-full bg-surface-2 border border-border-token rounded-lg px-3 py-2 text-sm text-on-surface placeholder-on-surface-muted outline-none resize-y"
                    />
                    <button
                      onClick={handleManualTranscript}
                      disabled={!manualTranscript.trim() || isProcessing}
                      className="w-full px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-40 text-white rounded-lg text-sm"
                    >
                      {t('meeting_view.youtube_manual_paste_btn')}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Processing status */}
            {isProcessing && (
              <div className="flex items-start gap-3 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                <Loader2 size={18} className="animate-spin text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="text-sm text-blue-300">{stepLabelMap[step]}</span>
                  {/* [2026-04-18] Sub-label shown during Whisper audio extraction (slow, needs expectation setting) */}
                  {audioTranscribingMsg && (
                    <p className="text-xs text-blue-400/70 mt-1">{audioTranscribingMsg}</p>
                  )}
                </div>
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
          <>
          {/* [2026-04-20 PREV-01] PDF preview modal */}
          {showPdfPreview && (
            <PdfPreviewModal meeting={currentMeeting} onClose={() => setShowPdfPreview(false)} />
          )}
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
              {/* PDF 출력 버튼 */}
              <button
                onClick={() => setShowPdfPreview(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-xs font-medium transition-colors shrink-0"
              >
                <Printer size={13} /> {t('meeting_view.pdf_export')}
              </button>
            </div>

            {/* Result tabs */}
            <div className="flex gap-1 bg-surface-2 rounded-lg p-1 w-fit">
              {([
                ['transcript', t('meeting_view.tab_transcript')],
                ['analysis', t('meeting_view.tab_analysis')],
                ['summary', t('meeting_view.tab_summary')],
                // [2026-04-16 01:20] New: mindmap visualization tab
                ['mindmap', t('meeting_view.tab_mindmap')],
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
          </>
        )}
      </div>
    </div>
  );
}
