'use client';

// Blend - Image Generation Plugin (DALL-E 3)

export interface ImageGenResult {
  url?: string;
  error?: string;
}

/**
 * Call the server-side DALL-E 3 image generation route.
 * apiKey is the OpenAI key from api-key-store (BYOK).
 */
export async function generateImage(prompt: string, apiKey: string): Promise<ImageGenResult> {
  try {
    const res = await fetch('/api/image-gen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, apiKey }),
    });

    const data: ImageGenResult = await res.json();
    return data;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg };
  }
}

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
  const regex = /https?:\/\/\S+\.(?:png|jpg|jpeg|webp|gif)(?:\?\S*)?/gi;
  return (text.match(regex) || []);
}
