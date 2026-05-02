// Blend - Meeting Plugin
// Speaker diarization, topic/action-item extraction, summarization via LLM

import { TranscriptSegment, ActionItem } from '@/types';
import { recordApiUsage } from '@/lib/analytics';
import { calculateCost, getModelById } from '@/modules/models/model-registry';

type Provider = 'openai' | 'anthropic';

// [2026-05-02 Roy] meeting-plugin이 sendChatRequest 우회해 직접 fetch했었음 →
// 회의 분석 토큰 비용이 어디에도 추적 안 되던 회귀. callOpenAI/callAnthropic
// 응답에서 usage 추출 후 recordApiUsage 호출 — Billing 화면 + 텔레그램 리포트
// 자동 반영. (sendChatRequest로 migrate하는 것이 이상적이지만 회의 plugin은
// streaming 미사용·json_object format 등 비-streaming 호출이라 inline 추적이 더
// 단순.)
function trackLLM(provider: Provider, model: string, inputTokens: number, outputTokens: number): void {
  if (typeof window === 'undefined') return;
  if (inputTokens === 0 && outputTokens === 0) return;
  const m = getModelById(model);
  const cost = m ? calculateCost(m, inputTokens, outputTokens) : 0;
  recordApiUsage({
    provider,
    model,
    inputTokens,
    outputTokens,
    cost,
  });
}

// ── LLM call helpers ──────────────────────────────────────────────────────────

// [2026-04-18 01:00] Fix: added optional format param — mindmap needs 'text', JSON calls use 'json_object'
async function callOpenAI(systemPrompt: string, userContent: string, apiKey: string, format: 'json_object' | 'text' = 'json_object'): Promise<string> {
  const model = 'gpt-4o-mini';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
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
  trackLLM('openai', model, data.usage?.prompt_tokens ?? 0, data.usage?.completion_tokens ?? 0);
  return data.choices?.[0]?.message?.content ?? '{}';
}

// [2026-04-18 01:00] Fix: added optional format param — only strip markdown JSON blocks in json_object mode
async function callAnthropic(systemPrompt: string, userContent: string, apiKey: string, format: 'json_object' | 'text' = 'json_object'): Promise<string> {
  const model = 'claude-haiku-4-5-20251001';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
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
  trackLLM('anthropic', model, data.usage?.input_tokens ?? 0, data.usage?.output_tokens ?? 0);
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

  // CRITICAL (2026-04-27 v2): 영어 시스템 프롬프트로는 gpt-4o-mini/claude-haiku가
  // 한국어 input도 영어로 번역해서 출력하는 경향을 못 막음. 시스템 프롬프트와
  // user 프롬프트를 모델의 출력 기대 언어와 일치시켜 컨텍스트 일관성으로 강제.
  let system: string;
  let user: string;

  if (lang === 'ko') {
    system = `당신은 회의록 분석 전문가입니다. JSON만 반환하세요.

⚠️ 언어 규칙 (절대 위반 금지):
- "text" 필드는 입력 텍스트의 원어를 그대로 유지합니다.
- 번역하지 마세요. 의역하지 마세요. 요약하지 마세요.
- 입력이 한국어면 → "text"도 한국어. 입력이 영어면 → "text"도 영어.
- "speaker" 라벨만 한국어 형식 ("화자 1", "화자 2")으로 작성합니다.`;

    user = `다음 회의록을 화자별로 분리해 주세요.

자연스러운 대화 흐름을 기준으로 화자를 식별하고, 각 발언을 분리하세요.

화자 라벨: "${labelExample1}", "${labelExample2}" 처럼 한국어로.
대본(text)은 입력 원어 유지 — 한국어면 한국어, 영어면 영어. 번역 금지.

응답 형식 (JSON만, 다른 설명 없이):
{"segments": [{"speaker": "${labelExample1}", "text": "<원어 그대로>", "startTime": null}]}

회의록:
${transcript}`;
  } else {
    system = `You are a meeting transcript analysis expert. Return only valid JSON.

⚠️ LANGUAGE RULE — strictly enforced:
- The "text" field MUST preserve the ORIGINAL language of the input verbatim.
- Do NOT translate. Do NOT paraphrase. Do NOT summarize.
- If input is Korean → "text" stays Korean. If English → "text" stays English.
- Only the "speaker" labels use English format ("Speaker 1", "Speaker 2").`;

    user = `Analyze the meeting transcript below and separate it by speaker.

Identify sections spoken by different people using natural conversational flow.

Speaker labels in English: "${labelExample1}", "${labelExample2}", etc.
Transcript text stays in its original language. Never translate.

Return format (JSON only, no other text):
{"segments": [{"speaker": "${labelExample1}", "text": "<original language preserved>", "startTime": null}]}

Meeting transcript:
${transcript}`;
  }

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
