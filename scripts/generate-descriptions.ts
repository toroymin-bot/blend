/**
 * Uses Gemini to generate approachable Korean/English descriptions
 * for newly detected models.
 *
 * Input:  provider model metadata (id, official description if any)
 * Output: { displayName, description_ko, description_en, tier } | null
 *
 * Returns null if generation fails validation — caller should fallback
 * to heuristic classification.
 */

export type ModelTier = 'flagship' | 'balanced' | 'fast' | 'reasoning' | 'trial';

export interface GeneratedMeta {
  displayName: string;
  description_ko: string;
  description_en: string;
  tier: ModelTier;
}

export interface ProviderModelHint {
  id: string;
  provider: string;
  officialDescription?: string;  // from provider API if available
  createdAt?: number;
}

// ============================================================
// Gemini call
// ============================================================
async function callGemini(prompt: string, key: string): Promise<string | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2000,       // 2.5-flash thinking tokens need headroom
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 }, // disable thinking for speed + cost
        },
      }),
    });

    if (!res.ok) {
      console.error(`Gemini ${res.status}: ${await res.text()}`);
      return null;
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return typeof text === 'string' ? text : null;
  } catch (err) {
    console.error('Gemini call failed:', err);
    return null;
  }
}

// ============================================================
// Prompt builder — strict constraints for Jobs-style output
// ============================================================
function buildPrompt(hint: ProviderModelHint): string {
  const created = hint.createdAt
    ? new Date(hint.createdAt * 1000).toISOString().split('T')[0]
    : 'unknown';
  const officialDesc = hint.officialDescription
    ? `\n- Official description: ${hint.officialDescription}`
    : '';

  return `You are writing UI copy for an AI chat app model picker (non-technical Korean users).

Generate metadata for: ID=${hint.id}, Provider=${hint.provider}, Created=${created}${officialDesc}

Rules:
- displayName: proper product name (e.g. "Gemma 3 12B", "Claude Sonnet 4.7", "GPT-5.4 mini")
- description_ko: max 15 chars no spaces, ends in 해요/예요/어요, NO jargon (금지: 플래그십, 최첨단, 최고)
- description_en: max 40 chars, plain English, no marketing words (no: flagship, cutting-edge)
- tier: flagship | balanced | fast | reasoning | trial

Examples of good description_ko: "빠르고 가벼워요", "코딩을 잘해요", "무료로 써볼 수 있어요", "어려운 문제를 풀어요"
Tier guide: flagship=best quality, balanced=everyday, fast=mini/lite/nano/haiku, reasoning=thinking/o1, trial=free gemini only

Respond with ONLY the JSON object.`;
}

// ============================================================
// Validation — reject bad AI outputs
// ============================================================
const KO_FORBIDDEN = ['플래그십', 'SOTA', '최첨단', '획기적', '혁신적', 'state-of-the-art', '최고의', '최상의'];
const EN_FORBIDDEN = ['flagship', 'state-of-the-art', 'cutting-edge', 'revolutionary', 'breakthrough'];
const VALID_TIERS: ModelTier[] = ['flagship', 'balanced', 'fast', 'reasoning', 'trial'];

function validate(meta: any): meta is GeneratedMeta {
  if (!meta || typeof meta !== 'object') return false;

  // displayName
  if (typeof meta.displayName !== 'string' || meta.displayName.length === 0) return false;
  if (meta.displayName.length > 40) return false;
  if (/\d{8}/.test(meta.displayName)) return false;  // no date snapshots
  if (/^[a-z]/.test(meta.displayName)) return false;  // must start uppercase

  // description_ko
  if (typeof meta.description_ko !== 'string') return false;
  const koLen = meta.description_ko.replace(/\s/g, '').length;
  if (koLen === 0 || koLen > 15) return false;
  if (!/요$|다$/.test(meta.description_ko)) return false;  // 해요/워요/에요/이에요/etc
  for (const bad of KO_FORBIDDEN) {
    if (meta.description_ko.includes(bad)) return false;
  }

  // description_en
  if (typeof meta.description_en !== 'string') return false;
  if (meta.description_en.length === 0 || meta.description_en.length > 50) return false;
  for (const bad of EN_FORBIDDEN) {
    if (meta.description_en.toLowerCase().includes(bad.toLowerCase())) return false;
  }

  // tier
  if (!VALID_TIERS.includes(meta.tier)) return false;

  return true;
}

// ============================================================
// Main entry
// ============================================================
export async function generateMeta(
  hint: ProviderModelHint,
  geminiKey: string,
  maxRetries = 2
): Promise<GeneratedMeta | null> {
  const prompt = buildPrompt(hint);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const raw = await callGemini(prompt, geminiKey);
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      if (validate(parsed)) {
        console.log(`  ✓ Generated meta for ${hint.id} (attempt ${attempt + 1})`);
        return parsed;
      } else {
        console.warn(`  ✗ Validation failed for ${hint.id} (attempt ${attempt + 1}):`, raw.slice(0, 200));
      }
    } catch {
      console.warn(`  ✗ JSON parse failed for ${hint.id} (attempt ${attempt + 1})`);
    }
  }

  return null;
}
