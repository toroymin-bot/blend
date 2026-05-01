'use client';

// Blend - Image Generation Plugin (DALL-E 3)

export interface ImageGenResult {
  url?: string;
  error?: string;
}

// [2026-04-12 01:07] 기능: 서버 API → 클라이언트 직접 호출 전환 — 이유: output:'export' 정적 빌드
// OpenAI API는 브라우저 CORS를 허용하므로 직접 호출 가능
// [2026-05-01 Roy] modelId 인자 추가 — 호출자가 GPT Image 2.0/3.0/dall-e-3 등 선택 가능.
// quality 등 옵션은 모델별로 차이가 있을 수 있어 매핑 — gpt-image 시리즈는 quality 'high'/'medium'/'low'/'auto',
// dall-e-3는 'standard'/'hd'. 단순화 위해 모델별 적절한 default 사용.
export async function generateImage(prompt: string, apiKey: string, modelId: string = 'dall-e-3'): Promise<ImageGenResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    // gpt-image-* 시리즈는 'auto' quality 지원, dall-e-3는 'standard'
    const isGptImage = /^gpt-image-/.test(modelId);
    const body: Record<string, unknown> = {
      model: modelId,
      prompt,
      n: 1,
      size: '1024x1024',
      quality: isGptImage ? 'auto' : 'standard',
    };
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = (err as { error?: { message?: string } })?.error?.message || `OpenAI API error: ${res.status}`;
      return { error: msg };
    }
    // [2026-05-01] gpt-image 시리즈는 b64_json 기본, dall-e-3는 url 기본 — 둘 다 처리.
    const data = await res.json() as { data?: { url?: string; b64_json?: string }[] };
    const item = data.data?.[0];
    if (item?.b64_json) {
      // OpenAI는 image/png를 default로 반환
      return { url: `data:image/png;base64,${item.b64_json}` };
    }
    const url = item?.url;
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
