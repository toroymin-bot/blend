// [2026-04-12 01:07] 기능: Whisper STT 서버 프록시 — 비활성화 이유: output:'export' 정적 빌드
// 클라이언트가 OpenAI Whisper API를 직접 호출하도록 meeting-view.tsx 변환됨

export const dynamic = 'force-static';

export async function GET() {
  return new Response(JSON.stringify({ disabled: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/* ── 원본 서버 핸들러 (비활성화) ─────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('X-API-Key');
  if (!apiKey) return NextResponse.json({ error: 'OpenAI API 키가 필요합니다.' }, { status: 401 });
  let formData: FormData;
  try { formData = await req.formData(); } catch { return NextResponse.json({ error: '요청 파싱 실패' }, { status: 400 }); }
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: '파일 크기가 25MB를 초과합니다.' }, { status: 400 });
  const whisperForm = new FormData();
  whisperForm.append('file', file);
  whisperForm.append('model', 'whisper-1');
  whisperForm.append('response_format', 'verbose_json');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: whisperForm,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return NextResponse.json({ error: err.error?.message || `Whisper API 오류: ${res.status}` }, { status: res.status });
  }
  const data = await res.json();
  return NextResponse.json({ text: data.text ?? '', segments: (data.segments ?? []).map((s: { start: number; end: number; text: string }) => ({ start: s.start, end: s.end, text: s.text })) });
}
─────────────────────────────────────────────────────────────────────────── */
