'use client';

// Blend - Image Generation Plugin (DALL-E 3)

export interface ImageGenResult {
  url?: string;
  error?: string;
}

// [2026-04-12 01:07] 기능: 서버 API → 클라이언트 직접 호출 전환 — 이유: output:'export' 정적 빌드
// OpenAI API는 브라우저 CORS를 허용하므로 직접 호출 가능
export async function generateImage(prompt: string, apiKey: string): Promise<ImageGenResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size: '1024x1024', quality: 'standard' }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = (err as { error?: { message?: string } })?.error?.message || `OpenAI API error: ${res.status}`;
      return { error: msg };
    }
    const data = await res.json() as { data?: { url?: string }[] };
    const url = data.data?.[0]?.url;
    if (!url) return { error: 'No image URL returned' };
    // [2026-04-13 00:00] BUG-007: DALL-E URL은 1시간 후 만료 → 즉시 base64로 변환하여 로컬 저장
    // 기존: return { url };  — 히스토리에서 이미지 사라지는 문제
    try {
      const imgRes = await fetch(url);
      if (imgRes.ok) {
        const blob = await imgRes.blob();
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        return { url: base64 };
      }
    } catch {
      // base64 변환 실패 시 원본 URL 반환 (임시 표시 가능)
    }
    return { url };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg };
  }
}

// [2026-04-12 01:07] 기존 서버 프록시 버전 비활성화
// async function generateImageViaServer(prompt: string, apiKey: string): Promise<ImageGenResult> {
//   const res = await fetch('/api/image-gen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, apiKey }) });
//   return await res.json();
// }

/**
 * Extract /image command from user input.
 * Pattern: /image <prompt>
 * Returns the prompt string or null if not matched.
 */
export function extractImagePrompt(input: string): string | null {
  const match = input.match(/^\/image\s+(.+)/i);
  return match ? match[1].trim() : null;
}

/**
 * Detect image URLs in AI response text.
 * Returns all https image URLs found in the text.
 */
export function extractImageURLs(text: string): string[] {
  // Match https:// image URLs
  const httpRegex = /https?:\/\/\S+\.(?:png|jpg|jpeg|webp|gif)(?:\?\S*)?/gi;
  const httpUrls = text.match(httpRegex) || [];
  // Also match markdown image syntax with data: URLs — ![...](data:image/...;base64,...)
  const dataRegex = /!\[[^\]]*\]\((data:image\/[^;]+;base64,[^)]+)\)/g;
  const dataUrls: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = dataRegex.exec(text)) !== null) {
    dataUrls.push(m[1]);
  }
  return [...httpUrls, ...dataUrls];
}
