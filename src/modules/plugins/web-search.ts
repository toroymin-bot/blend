// Blend - Web Search Plugin
// [2026-04-12 01:07] 기능: 서버 API → 클라이언트 직접 호출 전환 — 이유: output:'export' 정적 빌드
// DuckDuckGo Instant Answers API는 CORS를 허용하므로 직접 호출 가능

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
  source?: string;
}

// [2026-04-12 01:07] 기존 서버 프록시 버전 비활성화
// async function performWebSearchViaServer(query: string): Promise<WebSearchResponse> {
//   const res = await fetch('/api/web-search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
//   return await res.json();
// }

/** DuckDuckGo Instant Answers API — 브라우저에서 직접 호출 (CORS 허용) */
async function searchDuckDuckGo(query: string): Promise<WebSearchResult[]> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&t=blend`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`DuckDuckGo API 오류: ${res.status}`);
  const data = await res.json();
  const results: WebSearchResult[] = [];

  if (data.AbstractText && data.AbstractURL) {
    results.push({ title: data.Heading || query, url: data.AbstractURL, description: data.AbstractText });
  }

  const topics: Array<{ Text?: string; FirstURL?: string; Topics?: Array<{ Text?: string; FirstURL?: string }> }> =
    data.RelatedTopics || [];
  for (const topic of topics) {
    if (results.length >= 5) break;
    if (topic.Text && topic.FirstURL) {
      results.push({ title: topic.Text.split(' - ')[0] || topic.Text.slice(0, 60), url: topic.FirstURL, description: topic.Text });
    } else if (topic.Topics) {
      for (const sub of topic.Topics) {
        if (results.length >= 5) break;
        if (sub.Text && sub.FirstURL) {
          results.push({ title: sub.Text.split(' - ')[0] || sub.Text.slice(0, 60), url: sub.FirstURL, description: sub.Text });
        }
      }
    }
  }
  return results;
}

export async function performWebSearch(query: string): Promise<WebSearchResponse> {
  try {
    const results = await searchDuckDuckGo(query);
    return { available: true, query, results, source: 'duckduckgo' };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { available: false, error: msg };
  }
}

export async function checkWebSearchAvailable(): Promise<boolean> {
  // DuckDuckGo는 항상 사용 가능 (무료, CORS 허용)
  return true;
}

/**
 * Extract search query from user input.
 * Supports: "!search 검색어", "?검색어"
 */
export function extractSearchQuery(input: string): string | null {
  // Pattern: !search <query>
  const bangMatch = input.match(/^!search\s+(.+)/i);
  if (bangMatch) return bangMatch[1].trim();

  // Pattern: ?<query> (at start of line)
  const questionMatch = input.match(/^\?(.+)/);
  if (questionMatch) return questionMatch[1].trim();

  return null;
}

/**
 * Format search results as a context block to inject into the AI prompt.
 */
export function formatSearchResultsAsContext(query: string, results: WebSearchResult[]): string {
  if (results.length === 0) {
    return `[웹 검색: "${query}" — 결과 없음]`;
  }

  const lines = [
    `[웹 검색 결과: "${query}"]`,
    '',
    ...results.map((r, i) =>
      `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.description}`
    ),
  ];

  return lines.join('\n');
}
