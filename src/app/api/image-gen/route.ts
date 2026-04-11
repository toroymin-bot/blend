// [2026-04-12 01:07] 기능: DALL-E 3 서버 프록시 — 비활성화 이유: output:'export' 정적 빌드에서 서버 API 불가
// 클라이언트가 OpenAI API를 직접 호출하도록 image-gen.tsx 변환됨

export const dynamic = 'force-static';

export async function GET() {
  return new Response(JSON.stringify({ disabled: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/* ── 원본 서버 핸들러 (비활성화) ─────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';

export interface ImageGenResponse {
  url?: string;
  error?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse<ImageGenResponse>> {
  try {
    const { prompt, apiKey } = await req.json();
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'prompt required' }, { status: 400 });
    }
    if (!apiKey || typeof apiKey !== 'string') {
      return NextResponse.json({ error: 'OpenAI API 키가 필요합니다' }, { status: 400 });
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size: '1024x1024', quality: 'standard' }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = (err as { error?: { message?: string } })?.error?.message || `OpenAI API error: ${res.status}`;
      return NextResponse.json({ error: msg }, { status: res.status });
    }
    const data = await res.json() as { data?: { url?: string }[] };
    const imageUrl = data.data?.[0]?.url;
    if (!imageUrl) return NextResponse.json({ error: '이미지 URL을 받지 못했습니다' }, { status: 500 });
    return NextResponse.json({ url: imageUrl });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
─────────────────────────────────────────────────────────────────────────── */
