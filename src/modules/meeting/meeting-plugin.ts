// Blend - Meeting Plugin
// Speaker diarization, topic/action-item extraction, summarization via LLM

import { TranscriptSegment, ActionItem } from '@/types';

type Provider = 'openai' | 'anthropic';

// ── LLM call helpers ──────────────────────────────────────────────────────────

// [2026-04-18 01:00] Fix: added optional format param — mindmap needs 'text', JSON calls use 'json_object'
async function callOpenAI(systemPrompt: string, userContent: string, apiKey: string, format: 'json_object' | 'text' = 'json_object'): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.3,
      ...(format === 'json_object' && { response_format: { type: 'json_object' } }),
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI error: ${res.status}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '{}';
}

// [2026-04-18 01:00] Fix: added optional format param — only strip markdown JSON blocks in json_object mode
async function callAnthropic(systemPrompt: string, userContent: string, apiKey: string, format: 'json_object' | 'text' = 'json_object'): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic error: ${res.status}`);
  }
  const data = await res.json();
  const text = data.content?.[0]?.text ?? '{}';
  if (format === 'json_object') {
    // Extract JSON from markdown code block wrapper if present
    const match = text.match(/```(?:json)\s*([\s\S]+?)\s*```/);
    return match ? match[1] : text;
  }
  // text mode: return as-is (strip only outer markdown fences for markdown responses)
  return text.replace(/^```(?:markdown)?\s*/i, '').replace(/\s*```$/, '').trim() || text;
}

// [2026-04-18 01:00] Fix: added format param propagation to support text mode for mindmap
async function callLLM(systemPrompt: string, userContent: string, apiKey: string, provider: Provider, format: 'json_object' | 'text' = 'json_object'): Promise<string> {
  // Truncate to avoid token limits
  const truncated = userContent.length > 8000 ? userContent.slice(0, 8000) + '\n...(truncated)' : userContent;
  return provider === 'openai'
    ? callOpenAI(systemPrompt, truncated, apiKey, format)
    : callAnthropic(systemPrompt, truncated, apiKey, format);
}

function safeParseJSON<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ── Speaker Diarization ───────────────────────────────────────────────────────

/**
 * Localized speaker label generator.
 * Note: only affects the label string. The transcript text itself is
 * NEVER translated — the AI is instructed to preserve the input language
 * verbatim (Tori 2026-04-26 P0 fix, Bug A).
 */
function speakerLabel(lang: 'ko' | 'en', n: number): string {
  return lang === 'ko' ? `화자 ${n}` : `Speaker ${n}`;
}

export async function diarizeSpeakers(
  transcript: string,
  apiKey: string,
  provider: Provider,
  lang: 'ko' | 'en' = 'en'
): Promise<TranscriptSegment[]> {
  const labelExample1 = speakerLabel(lang, 1);
  const labelExample2 = speakerLabel(lang, 2);

  // CRITICAL: instruct the model to preserve the original language of the
  // transcript content. Without this clause, an English system prompt causes
  // gpt-4o-mini / claude-haiku to silently translate Korean speech to English.
  const system = `You are a meeting transcript analysis expert. Return only valid JSON.

LANGUAGE RULE — strictly enforced:
- Preserve the ORIGINAL language of the input transcript verbatim in the "text" field.
- Do NOT translate. Do NOT paraphrase. Do NOT summarize.
- If the input is Korean, output Korean text. If English, output English text.
- Only the "speaker" labels follow the requested label language.`;

  const user = `Analyze the following meeting transcript and separate it by speaker.

Identify sections spoken by different people. Use natural conversational flow as the basis for separation.

Speaker labels MUST be in ${lang === 'ko' ? 'Korean' : 'English'} format:
"${labelExample1}", "${labelExample2}", etc.

Transcript text MUST stay in its original language. Never translate.

Return format (JSON):
{"segments": [{"speaker": "${labelExample1}", "text": "<original language preserved>", "startTime": null}]}

Meeting transcript:
${transcript}`;

  try {
    const raw = await callLLM(system, user, apiKey, provider);
    const parsed = safeParseJSON<{ segments?: TranscriptSegment[] }>(raw, {});
    if (Array.isArray(parsed.segments) && parsed.segments.length > 0) {
      return parsed.segments;
    }
  } catch {
    // Fallback on diarization failure
  }

  // Fallback: split by sentence as single speaker (text is original — no translation)
  const sentences = transcript.split(/(?<=[.!?。])\s+/).filter((s) => s.trim());
  const fallbackLabel = speakerLabel(lang, 1);
  return sentences.map((text) => ({ speaker: fallbackLabel, text }));
}

// ── Meeting Analysis ──────────────────────────────────────────────────────────

export async function analyzeMeeting(
  transcript: string,
  apiKey: string,
  provider: Provider
): Promise<{ topics: string[]; actionItems: ActionItem[]; decisions: string[] }> {
  const system = `You are a meeting analysis expert. Return only valid JSON.`;
  const user = `Analyze the following meeting content and return it in JSON format.

Return format:
{
  "topics": ["topic1", "topic2"],
  "actionItems": [
    {"task": "task description", "owner": "owner or null", "deadline": "deadline or null", "priority": "high|medium|low"}
  ],
  "decisions": ["decision1", "decision2"]
}

- topics: Main topics discussed in the meeting (3–7 items)
- actionItems: Clear action items (empty array if none)
- decisions: Decisions made in the meeting (empty array if none)

Meeting transcript:
${transcript}`;

  try {
    const raw = await callLLM(system, user, apiKey, provider);
    const parsed = safeParseJSON<{
      topics?: string[];
      actionItems?: ActionItem[];
      decisions?: string[];
    }>(raw, {});

    return {
      topics: Array.isArray(parsed.topics) ? parsed.topics : [],
      actionItems: Array.isArray(parsed.actionItems)
        ? parsed.actionItems.map((item) => ({
            task: item.task ?? '',
            owner: item.owner ?? undefined,
            deadline: item.deadline ?? undefined,
            priority: (['high', 'medium', 'low'] as const).includes(item.priority as ActionItem['priority'])
              ? (item.priority as ActionItem['priority'])
              : 'medium',
          }))
        : [],
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
    };
  } catch {
    return { topics: [], actionItems: [], decisions: [] };
  }
}

// ── Summarization ─────────────────────────────────────────────────────────────

export async function summarizeMeeting(
  transcript: string,
  apiKey: string,
  provider: Provider
): Promise<{ oneLiner: string; bullets: string[]; full: string }> {
  const system = `You are a meeting summarization expert. Return only valid JSON.`;
  const user = `Summarize the following meeting content.

Return format:
{
  "oneLiner": "one-sentence summary",
  "bullets": ["key point 1", "key point 2", "key point 3"],
  "full": "full summary in 2–3 paragraphs"
}

Meeting transcript:
${transcript}`;

  try {
    const raw = await callLLM(system, user, apiKey, provider);
    const parsed = safeParseJSON<{
      oneLiner?: string;
      bullets?: string[];
      full?: string;
    }>(raw, {});

    return {
      oneLiner: parsed.oneLiner ?? '',
      bullets: Array.isArray(parsed.bullets) ? parsed.bullets : [],
      full: parsed.full ?? '',
    };
  } catch {
    return { oneLiner: '', bullets: [], full: '' };
  }
}

// ── Mindmap Generation ────────────────────────────────────────────────────────
// [2026-04-16] New function: generate markdown mindmap from meeting analysis

export async function generateMindmap(
  rawTranscript: string,
  title: string,
  apiKey: string,
  provider: Provider
): Promise<string> {
  const system = `You are a meeting analysis expert. Convert meeting content into a markdown mindmap structure.`;
  const user = `Convert the following meeting analysis into a markdown mind map structure.
Root: "${title}"
Branches: Key Decisions, Action Items (with owner), Discussion Topics, Next Steps
Use markdown heading levels (# ## ###) for hierarchy.
Keep each node concise (under 10 words).
Return only the markdown, no explanation.

Meeting transcript:
${rawTranscript}`;

  try {
    // [2026-04-18 01:00] Fix: use format:'text' — json_object mode caused OpenAI to reject markdown responses
    const raw = await callLLM(system, user, apiKey, provider, 'text');
    return raw || `# ${title}\n## No content generated`;
  } catch {
    return `# ${title}\n## Error generating mindmap`;
  }
}
