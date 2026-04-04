// Blend - URL Reader Plugin (Reusable: any project needing web content extraction)
// Fetches URL content via API route to avoid CORS

export interface URLContent {
  url: string;
  title: string;
  text: string;
  description?: string;
  error?: string;
}

export async function fetchURLContent(url: string): Promise<URLContent> {
  try {
    const res = await fetch('/api/url-reader', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    return await res.json();
  } catch (e: any) {
    return { url, title: '', text: '', error: e.message };
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
