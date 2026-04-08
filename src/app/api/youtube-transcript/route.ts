// Blend - YouTube Transcript extraction
// POST: { url: string } → { rawText, title, segments }

import { NextRequest, NextResponse } from 'next/server';
import { YoutubeTranscript } from 'youtube-transcript';

function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    // youtu.be/VIDEO_ID
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0];
    // youtube.com/watch?v=VIDEO_ID
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return v;
      // youtube.com/embed/VIDEO_ID
      const embedMatch = u.pathname.match(/\/embed\/([^/?]+)/);
      if (embedMatch) return embedMatch[1];
      // youtube.com/shorts/VIDEO_ID
      const shortsMatch = u.pathname.match(/\/shorts\/([^/?]+)/);
      if (shortsMatch) return shortsMatch[1];
    }
  } catch {}
  return null;
}

export async function POST(req: NextRequest) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식' }, { status: 400 });
  }

  const url = body.url?.trim();
  if (!url) {
    return NextResponse.json({ error: 'URL이 필요합니다.' }, { status: 400 });
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    return NextResponse.json({ error: '올바른 YouTube URL이 아닙니다.' }, { status: 400 });
  }

  let segments: { text: string; duration: number; offset: number }[] = [];
  let usedLang = 'ko';

  // Try Korean first, fall back to English
  try {
    segments = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'ko' });
  } catch {
    try {
      segments = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
      usedLang = 'en';
    } catch {
      try {
        // Last resort: no lang specified
        segments = await YoutubeTranscript.fetchTranscript(videoId);
        usedLang = 'auto';
      } catch (e) {
        return NextResponse.json(
          { error: '자막을 찾을 수 없습니다. 자막이 없는 영상이거나 비공개 영상입니다.' },
          { status: 422 }
        );
      }
    }
  }

  if (!segments || segments.length === 0) {
    return NextResponse.json({ error: '자막 내용이 비어 있습니다.' }, { status: 422 });
  }

  const rawText = segments.map((s) => s.text).join(' ').replace(/\s+/g, ' ').trim();

  return NextResponse.json({
    rawText,
    title: `YouTube 회의 (${videoId})`,
    lang: usedLang,
    segments: segments.map((s) => ({
      text: s.text,
      offset: s.offset,
      duration: s.duration,
    })),
  });
}
