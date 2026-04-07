// Blend - Web Search API Route (Brave Search)

import { NextRequest, NextResponse } from 'next/server';

export interface WebSearchResult {
  title: string;
  url: string;
  description: string;
}

export interface WebSearchResponse {
  available: boolean;
  query?: string;
  results?: WebSearchResult[];
  error?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse<WebSearchResponse>> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ available: false });
  }

  try {
    const { query } = await req.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ available: true, error: 'query required' }, { status: 400 });
    }

    const searchUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&safesearch=off`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(searchUrl, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json({ available: true, query, error: `Brave API error: ${res.status}` }, { status: 500 });
    }

    const data = await res.json();

    const results: WebSearchResult[] = (data.web?.results || []).slice(0, 5).map((r: {
      title: string;
      url: string;
      description?: string;
    }) => ({
      title: r.title || '',
      url: r.url || '',
      description: r.description || '',
    }));

    return NextResponse.json({ available: true, query, results });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ available: true, error: msg }, { status: 500 });
  }
}

// Availability check
export async function GET(): Promise<NextResponse<{ available: boolean }>> {
  return NextResponse.json({ available: !!process.env.BRAVE_SEARCH_API_KEY });
}
