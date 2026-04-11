// Blend - URL Reader Plugin
// [2026-04-12 01:07] 기능: 서버 API → 클라이언트 직접 호출 전환 — 이유: output:'export' 정적 빌드
// 브라우저에서 직접 fetch — CORS 미허용 사이트는 에러 반환 (서버 없이 한계)

export interface URLContent {
  url: string;
  title: string;
  text: string;
  description?: string;
  error?: string;
}

// [2026-04-12 01:07] 기존 서버 프록시 버전 비활성화
// async function fetchURLContentViaServer(url: string): Promise<URLContent> {
//   const res = await fetch('/api/url-reader', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
//   return await res.json();
// }

export async function fetchURLContent(url: string): Promise<URLContent> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      headers: { 'Accept': 'text/html,application/xhtml+xml,*/*' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return { url, title: '', text: '', error: `HTTP ${res.status}` };

    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
    const description = descMatch ? descMatch[1].trim() : '';
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length > 5000) text = text.substring(0, 5000) + '...';
    return { url, title, text, description };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    // CORS 오류 발생 시 사용자 친화적 메시지
    const userMsg = msg.includes('Failed to fetch') || msg.includes('CORS')
      ? 'URL 읽기 실패: 이 사이트는 브라우저에서 직접 접근이 차단되어 있습니다 (CORS 제한)'
      : msg;
    return { url, title: '', text: '', error: userMsg };
  }
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

export function isValidURL(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}
