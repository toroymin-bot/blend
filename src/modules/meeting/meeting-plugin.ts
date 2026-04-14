// Blend - Meeting Plugin
// Speaker diarization, topic/action-item extraction, summarization via LLM

import { TranscriptSegment, ActionItem } from '@/types';

type Provider = 'openai' | 'anthropic';

// ── LLM call helpers ──────────────────────────────────────────────────────────

async function callOpenAI(systemPrompt: string, userContent: string, apiKey: string): Promise<string> {
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
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI error: ${res.status}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '{}';
}

async function callAnthropic(systemPrompt: string, userContent: string, apiKey: string): Promise<string> {
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
  // Extract JSON from response (may be wrapped in markdown)
  const match = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  return match ? match[1] : text;
}

async function callLLM(systemPrompt: string, userContent: string, apiKey: string, provider: Provider): Promise<string> {
  // Truncate to avoid token limits
  const truncated = userContent.length > 8000 ? userContent.slice(0, 8000) + '\n...(truncated)' : userContent;
  return provider === 'openai'
    ? callOpenAI(systemPrompt, truncated, apiKey)
    : callAnthropic(systemPrompt, truncated, apiKey);
}

function safeParseJSON<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ── Speaker Diarization ───────────────────────────────────────────────────────

export async function diarizeSpeakers(
  transcript: string,
  apiKey: string,
  provider: Provider
): Promise<TranscriptSegment[]> {
  const system = `You are a meeting transcript analysis expert. Return only valid JSON.`;
  const user = `Analyze the following meeting transcript and separate it by speaker.

Identify sections spoken by different people and label them as "Speaker 1", "Speaker 2", etc.
Use natural conversational flow as the basis for separation.

Return format (JSON):
{"segments": [{"speaker": "Speaker 1", "text": "...", "startTime": null}]}

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

  // Fallback: split by sentence as single speaker
  const sentences = transcript.split(/(?<=[.!?。])\s+/).filter((s) => s.trim());
  return sentences.map((text) => ({ speaker: 'Speaker 1', text }));
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
