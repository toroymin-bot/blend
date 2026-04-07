// Blend - Web Search Plugin
// Calls the /api/web-search route to run Brave Search queries

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

export async function performWebSearch(query: string): Promise<WebSearchResponse> {
  try {
    const res = await fetch('/api/web-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    return await res.json();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { available: false, error: msg };
  }
}

export async function checkWebSearchAvailable(): Promise<boolean> {
  try {
    const res = await fetch('/api/web-search');
    if (!res.ok) return false;
    const data: { available: boolean } = await res.json();
    return data.available === true;
  } catch {
    return false;
  }
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
