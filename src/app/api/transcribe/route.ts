// Blend - Whisper STT API route
// POST: FormData { file } → { text, segments }
// Requires X-API-Key header with OpenAI key

import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 120; // 2 min timeout for large files

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('X-API-Key');
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI API 키가 필요합니다.' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: '요청 파싱 실패' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  if (!file) {
    return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });
  }

  // Whisper 25MB limit
  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: '파일 크기가 25MB를 초과합니다.' }, { status: 400 });
  }

  const whisperForm = new FormData();
  whisperForm.append('file', file);
  whisperForm.append('model', 'whisper-1');
  whisperForm.append('response_format', 'verbose_json');
  whisperForm.append('language', 'ko');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: whisperForm,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: err.error?.message || `Whisper API 오류: ${res.status}` },
      { status: res.status }
    );
  }

  const data = await res.json();
  // verbose_json returns { text, segments: [{id, start, end, text, ...}] }
  return NextResponse.json({
    text: data.text ?? '',
    segments: (data.segments ?? []).map((s: { start: number; end: number; text: string }) => ({
      start: s.start,
      end: s.end,
      text: s.text,
    })),
  });
}
