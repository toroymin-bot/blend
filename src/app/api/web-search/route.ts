// Blend - Web Search API Route (Brave Search + DuckDuckGo fallback)

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
  source?: 'brave' | 'duckduckgo';
}

async function searchWithBrave(query: string, apiKey: string): Promise<WebSearchResult[]> {
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

  if (!res.ok) throw new Error(`Brave API error: ${res.status}`);

  const data = await res.json();
  return (data.web?.results || []).slice(0, 5).map((r: {
    title: string;
    url: string;
    description?: string;
  }) => ({
    title: r.title || '',
    url: r.url || '',
    description: r.description || '',
  }));
}

async function searchWithDuckDuckGo(query: string): Promise<WebSearchResult[]> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: controller.signal,
  });

  clearTimeout(timeout);

  if (!res.ok) throw new Error(`DuckDuckGo API error: ${res.status}`);

  const data = await res.json();
  const results: WebSearchResult[] = [];

  // AbstractText (direct answer)
  if (data.AbstractText && data.AbstractURL) {
    results.push({
      title: data.Heading || query,
      url: data.AbstractURL,
      description: data.AbstractText,
    });
  }

  // RelatedTopics
  const topics: Array<{ Text?: string; FirstURL?: string; Topics?: Array<{ Text?: string; FirstURL?: string }> }> =
    data.RelatedTopics || [];

  for (const topic of topics) {
    if (results.length >= 5) break;
    if (topic.Text && topic.FirstURL) {
      results.push({
        title: topic.Text.split(' - ')[0] || topic.Text.slice(0, 60),
        url: topic.FirstURL,
        description: topic.Text,
      });
    } else if (topic.Topics) {
      for (const sub of topic.Topics) {
        if (results.length >= 5) break;
        if (sub.Text && sub.FirstURL) {
          results.push({
            title: sub.Text.split(' - ')[0] || sub.Text.slice(0, 60),
            url: sub.FirstURL,
            description: sub.Text,
          });
        }
      }
    }
  }

  return results;
}

export async function POST(req: NextRequest): Promise<NextResponse<WebSearchResponse>> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;

  try {
    const { query } = await req.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ available: true, error: 'query required' }, { status: 400 });
    }

    // Brave Search (primary)
    if (apiKey) {
      try {
        const results = await searchWithBrave(query, apiKey);
        return NextResponse.json({ available: true, query, results, source: 'brave' });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        // Brave failed — fall through to DuckDuckGo
        console.warn('[web-search] Brave failed, falling back to DuckDuckGo:', msg);
      }
    }

    // DuckDuckGo fallback
    try {
      const results = await searchWithDuckDuckGo(query);
      return NextResponse.json({ available: true, query, results, source: 'duckduckgo' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ available: true, error: msg }, { status: 500 });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ available: true, error: msg }, { status: 500 });
  }
}

// Availability check — always available (DuckDuckGo fallback)
export async function GET(): Promise<NextResponse<{ available: boolean }>> {
  return NextResponse.json({ available: true });
}
