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
    throw new Error(err.error?.message || `OpenAI 오류: ${res.status}`);
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
    throw new Error(err.error?.message || `Anthropic 오류: ${res.status}`);
  }
  const data = await res.json();
  const text = data.content?.[0]?.text ?? '{}';
  // Extract JSON from response (may be wrapped in markdown)
  const match = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  return match ? match[1] : text;
}

async function callLLM(systemPrompt: string, userContent: string, apiKey: string, provider: Provider): Promise<string> {
  // Truncate to avoid token limits
  const truncated = userContent.length > 8000 ? userContent.slice(0, 8000) + '\n...(이하 생략)' : userContent;
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
  const system = `당신은 회의 텍스트 분석 전문가입니다. 반드시 JSON만 반환하세요.`;
  const user = `다음 회의 텍스트를 분석하여 화자별로 분리해주세요.

문맥상 서로 다른 사람이 말하는 부분을 "화자 1", "화자 2" 등으로 구분하세요.
자연스러운 대화의 흐름을 기준으로 나누세요.

반환 형식 (JSON):
{"segments": [{"speaker": "화자 1", "text": "...", "startTime": null}]}

회의 텍스트:
${transcript}`;

  try {
    const raw = await callLLM(system, user, apiKey, provider);
    const parsed = safeParseJSON<{ segments?: TranscriptSegment[] }>(raw, {});
    if (Array.isArray(parsed.segments) && parsed.segments.length > 0) {
      return parsed.segments;
    }
  } catch {
    // 화자 분리 실패 시 전체를 단일 화자로
  }

  // Fallback: split by sentence as single speaker
  const sentences = transcript.split(/(?<=[.!?。])\s+/).filter((s) => s.trim());
  return sentences.map((text) => ({ speaker: '화자 1', text }));
}

// ── Meeting Analysis ──────────────────────────────────────────────────────────

export async function analyzeMeeting(
  transcript: string,
  apiKey: string,
  provider: Provider
): Promise<{ topics: string[]; actionItems: ActionItem[]; decisions: string[] }> {
  const system = `당신은 회의 분석 전문가입니다. 반드시 JSON만 반환하세요.`;
  const user = `다음 회의 내용을 분석하여 JSON 형식으로 반환해주세요.

반환 형식:
{
  "topics": ["주제1", "주제2"],
  "actionItems": [
    {"task": "할일", "owner": "담당자 또는 null", "deadline": "기한 또는 null", "priority": "high|medium|low"}
  ],
  "decisions": ["결정사항1", "결정사항2"]
}

- topics: 회의에서 논의된 주요 주제들 (3~7개)
- actionItems: 명확한 할일 항목들 (없으면 빈 배열)
- decisions: 회의에서 내려진 결정사항들 (없으면 빈 배열)

회의 텍스트:
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
  const system = `당신은 회의 요약 전문가입니다. 반드시 JSON만 반환하세요.`;
  const user = `다음 회의 내용을 요약해주세요.

반환 형식:
{
  "oneLiner": "한 문장 요약",
  "bullets": ["핵심 포인트 1", "핵심 포인트 2", "핵심 포인트 3"],
  "full": "2-3 문단의 전체 요약"
}

회의 텍스트:
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
