'use client';

// Blend - Image Generation Plugin (DALL-E 3)

import { recordApiUsage } from '@/lib/analytics';

// [2026-05-02 Roy] OpenAI 이미지 생성 가격표 — 1024x1024 기준.
// 토큰 단위 모델이 아니라 1회 generation 당 flat cost. 사용량 추적용.
// 가격 출처: platform.openai.com/docs/pricing (2026-05).
function imageCostUSD(modelId: string): number {
  if (/^gpt-image-2/.test(modelId)) return 0.040;          // 1024x1024 standard
  if (/^gpt-image-1/.test(modelId)) return 0.040;
  if (/^dall-e-3/.test(modelId))    return 0.040;          // standard 1024x1024 ($0.080 HD)
  if (/^dall-e-2/.test(modelId))    return 0.020;          // 1024x1024
  return 0.04; // 기본 보수적 추정
}

export interface ImageGenResult {
  url?: string;
  error?: string;
  // [2026-05-02 Roy] verification fallback 발동 시 — 원래 모델 / 실제 성공 모델
  modelUsed?: string;
  fallbackFrom?: string;
}

// [2026-05-02 Roy] verification 에러 패턴 — gpt-image-1, gpt-image-2 등 신규
// OpenAI 이미지 모델은 organization verification 필수. 미인증 사용자는 403 또는
// 400 + "must be verified" 메시지 수신. 자동 fallback으로 dall-e-3 사용 (verify
// 불필요).
const VERIFICATION_ERROR_PATTERN = /must be verified|organization.*(verif|verify)|verified to use/i;

/**
 * 단일 모델 시도 — 실패하면 error 반환, fallback은 호출자가 처리.
 */
async function generateImageOnce(prompt: string, apiKey: string, modelId: string): Promise<ImageGenResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
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
    const data = await res.json() as { data?: { url?: string; b64_json?: string }[] };
    const item = data.data?.[0];
    // [2026-05-02 Roy] 성공 시 사용량 추적 — 토큰 단위가 아니라 flat cost(per image).
    // chat 토큰 모델과 같은 store에 기록하기 위해 inputTokens=0, outputTokens=0,
    // cost=imageCostUSD()로 push. Billing 화면 + 텔레그램 리포트 둘 다 자동 반영.
    recordApiUsage({
      provider: 'openai',
      model: modelId,
      inputTokens: 0,
      outputTokens: 0,
      cost: imageCostUSD(modelId),
    });
    if (item?.b64_json) {
      return { url: `data:image/png;base64,${item.b64_json}`, modelUsed: modelId };
    }
    const url = item?.url;
    if (!url) return { error: 'No image URL returned' };
    // [2026-04-13 00:00] BUG-007: DALL-E URL은 1시간 후 만료 → 즉시 base64로 변환하여 로컬 저장
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
        return { url: base64, modelUsed: modelId };
      }
    } catch {
      // base64 변환 실패 시 원본 URL 반환 (임시 표시 가능)
    }
    return { url, modelUsed: modelId };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg };
  }
}

/**
 * [2026-04-12 01:07] 기능: 서버 API → 클라이언트 직접 호출 전환 — 이유: output:'export' 정적 빌드
 * [2026-05-02 Roy] verification 에러 시 자동 fallback chain 추가:
 *   - gpt-image-2 / gpt-image-1 등 신규 모델은 organization verification 필수
 *   - 미인증 계정에서 호출 시 'must be verified' 에러 → dall-e-3로 자동 재시도
 *   - dall-e-3도 실패 시 친절한 안내 메시지 (verify 링크 포함) 반환
 */
export async function generateImage(prompt: string, apiKey: string, modelId: string = 'dall-e-3'): Promise<ImageGenResult> {
  const result = await generateImageOnce(prompt, apiKey, modelId);
  if (!result.error) return result;

  // verification 에러가 아니면 그대로 (rate limit / network / 기타)
  if (!VERIFICATION_ERROR_PATTERN.test(result.error)) return result;

  // 사용자가 명시적으로 dall-e를 지정한 경우는 fallback 의미 없음 (이미 verify 불필요한 모델인데도 다른 사유)
  if (/^dall-e-/.test(modelId)) return result;

  // gpt-image-* 시리즈 verification 실패 → dall-e-3로 자동 fallback
  console.warn(`[image-gen] ${modelId} verification failed, falling back to dall-e-3:`, result.error);
  const fallback = await generateImageOnce(prompt, apiKey, 'dall-e-3');
  if (!fallback.error) {
    return { ...fallback, fallbackFrom: modelId };
  }

  // dall-e-3도 실패 — 사용자에게 verification 안내 + dall-e fallback 사유 함께 노출
  return {
    error:
      `${modelId} 모델은 OpenAI 조직 인증이 필요해요. DALL-E 3로 자동 전환했는데 그것도 실패했어요. ` +
      `해결 방법: https://platform.openai.com/settings/organization/general 에서 [Verify Organization] 클릭 후 약 15분 대기. ` +
      `(원본 사유: ${result.error.slice(0, 120)}, dall-e-3 사유: ${fallback.error?.slice(0, 120) ?? 'unknown'})`,
  };
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
