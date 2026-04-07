// Blend - Image Generation API Route (DALL-E 3)
// Uses OpenAI API key provided via request body (BYOK)

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
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard',
      }),
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

    if (!imageUrl) {
      return NextResponse.json({ error: '이미지 URL을 받지 못했습니다' }, { status: 500 });
    }

    return NextResponse.json({ url: imageUrl });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
