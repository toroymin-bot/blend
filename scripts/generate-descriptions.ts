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
// Few-shot samples — shown to the model as "existing descriptions
// you must NOT duplicate". Keeps generated output differentiated.
const META_OVERRIDES_SAMPLE: Record<string, { provider: string; description_ko: string; description_en: string }> = {
  'claude-opus-4-7':   { provider: 'anthropic', description_ko: '글을 가장 잘 써요',         description_en: 'Best at writing' },
  'claude-sonnet-4-6': { provider: 'anthropic', description_ko: '매일 쓰기에 좋아요',       description_en: 'Good for daily tasks' },
  'claude-haiku-4-5':  { provider: 'anthropic', description_ko: '가장 빠르고 가벼워요',     description_en: 'Fastest and lightest' },
  'gpt-5.4':           { provider: 'openai',    description_ko: '코딩과 문제 해결을 잘해요', description_en: 'Strong at code and problems' },
  'gpt-5.4-mini':      { provider: 'openai',    description_ko: '저렴하고 가벼워요',         description_en: 'Cheap and light' },
  'gpt-5.2':           { provider: 'openai',    description_ko: '어려운 추론을 해요',         description_en: 'Deep reasoning' },
  'gemini-2.5-flash':  { provider: 'google',    description_ko: '무료로 써볼 수 있어요',     description_en: 'Free to try' },
  'gemini-3.1-pro':    { provider: 'google',    description_ko: '긴 문서를 잘 봐요',         description_en: 'Great with long documents' },
  'deepseek-chat':     { provider: 'deepseek',  description_ko: '저렴한데 잘해요',           description_en: 'Cheap but capable' },
  'deepseek-reasoner': { provider: 'deepseek',  description_ko: '수학과 코딩을 잘 풀어요',   description_en: 'Solves math and code' },
  'llama-3.3-70b-versatile': { provider: 'groq', description_ko: '무료로 아주 빨라요',       description_en: 'Free and very fast' },
};

function buildPrompt(hint: ProviderModelHint): string {
  const created = hint.createdAt
    ? new Date(hint.createdAt * 1000).toISOString().split('T')[0]
    : 'unknown';
  const officialDesc = hint.officialDescription
    ? `\n- Official description: ${hint.officialDescription}`
    : '';
  const sizeMatch = hint.id.match(/\b(\d+)b\b/i)?.[1];
  const sizeHint = sizeMatch ? `${sizeMatch}B params` : 'unknown';

  // Siblings = existing entries from same provider — shown as "do not duplicate"
  const siblings = Object.entries(META_OVERRIDES_SAMPLE)
    .filter(([, v]) => v.provider === hint.provider)
    .slice(0, 6)
    .map(([id, v]) => `  - ${id}: "${v.description_ko}" / "${v.description_en}"`)
    .join('\n');

  return `You write UI copy for an AI chat app used by non-technical Korean and global users.

Generate metadata for this AI model:
- Model ID: ${hint.id}
- Provider: ${hint.provider}
- Model size hint: ${sizeHint}
- Created: ${created}${officialDesc}

EXISTING MODELS FROM SAME FAMILY (avoid duplicating these descriptions):
${siblings || '  (none)'}

Respond with ONLY a JSON object:
{
  "displayName": "Human-readable name",
  "description_ko": "한국어 설명",
  "description_en": "English description",
  "tier": "flagship" | "balanced" | "fast" | "reasoning" | "trial"
}

DIFFERENTIATION RULES — this is critical:

1. Read clues from the model ID:
   - "pro" / "opus" / "ultra" → tier=flagship
   - "mini" / "nano" / "haiku" / "lite" → tier=fast
   - "flash" → tier=fast (or trial if explicitly free)
   - "sonnet" / "chat" / base model → tier=balanced
   - "reasoner" / "thinking" / "o1" / "o3" / "o4" → tier=reasoning
   - "preview" / "experimental" / "exp" → still classify primary tier

2. Each description must answer "WHY pick THIS over the siblings above?":
   - BAD:  "어려운 문제를 풀어요" (generic, likely duplicate)
   - GOOD: "글쓰기에 가장 강해요" (unique angle)
   - GOOD: "저렴한데 잘해요" (price angle)

3. Provider-specific strengths (preferred framing):
   - gpt-5.x:            "문제 해결과 코딩에 강해요"
   - gpt-5.x-mini/nano:  "가볍고 빨라요"
   - o3/o4/gpt-5.2:      "어려운 추론을 해요"
   - claude-opus-x:      "글쓰기가 가장 좋아요"
   - claude-sonnet-x:    "일상 업무에 좋아요"
   - claude-haiku-x:     "가볍고 빨라요"
   - gemini-x-pro:       "긴 문서를 잘 봐요"
   - gemini-x-flash:     "빠르고 저렴해요"
   - deepseek-chat:      "저렴한데 잘해요"
   - deepseek-reasoner:  "수학과 코딩을 잘 풀어요"
   - llama-x:            "무료로 아주 빨라요"
   - gemma-x:            "오픈소스 구글 모델"

STRICT FORMAT RULES:

- displayName:
  - Brand capitalized correctly: "GPT-5.4", "Claude Opus 4.7", "Gemini 2.5 Pro", "DeepSeek V3"
  - NEVER "Gpt" or "Gpt 5 4" — must be "GPT-5.4" with dash
  - NEVER include date stamps like "20250805"
  - Max 40 characters

- description_ko:
  - Max 15 Korean characters (공백 제외)
  - Must end with 해요/예요/어요 (or 이에요/워요/etc. ending in 요)
  - Forbidden: 플래그십, SOTA, 최첨단, 획기적, 최고의, 최상의
  - Must be specific — the reader should know what's different about THIS model

- description_en:
  - Max 40 characters
  - Forbidden: flagship, state-of-the-art, cutting-edge, revolutionary
  - Present tense, simple verbs

- tier: exactly one of [flagship, balanced, fast, reasoning, trial]

Respond with ONLY the JSON. No markdown, no explanation.`;
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
