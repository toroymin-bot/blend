// [2026-05-02 Roy] AI 도구 정의 + 실행 layer.
// 사용자 명시 요청: "별도 메뉴 없이 자연 통합. BYOK이라 비용은 사용자."
// 모든 provider(OpenAI/Anthropic/Gemini) 공통 spec → 각자 format 변환.
//
// 첫 sprint: 4개 기본 도구 (시간/날씨/환율/계산기). 모두 무료 외부 API 또는
// 클라이언트 계산. 사용자 API 비용은 추가 turn에 따른 LLM 호출만 (도구 자체 무료).
//
// 향후 확장: 캘린더(Gmail), 검색(외부), 이메일, 자료 변환 등.

// ─── 공통 도구 spec (OpenAI format 기준) ─────────────────────────────

export interface AITool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
}

export const AI_TOOLS: AITool[] = [
  {
    name: 'get_current_time',
    description: '현재 시간을 알려줍니다. 시간/날짜 관련 질문(지금 몇 시?, 오늘 날짜, 며칠 남았어?)에 사용. timezone 미지정 시 사용자 브라우저 기본 timezone 사용.',
    parameters: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description: 'IANA timezone (예: Asia/Seoul, America/New_York). 미지정 시 브라우저 기본값.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_weather',
    description: '특정 지역의 현재 날씨를 가져옵니다. 날씨/기온/비 관련 질문(서울 날씨, 오늘 비 와?, 도쿄 기온)에 사용.',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: '도시 이름 또는 지역 (예: Seoul, Tokyo, New York, 부산)',
        },
      },
      required: ['location'],
    },
  },
  {
    name: 'get_currency_rate',
    description: '실시간 환율을 가져옵니다. 환율/통화 변환 질문(100달러 원화로, USD KRW, 엔화 환율)에 사용.',
    parameters: {
      type: 'object',
      properties: {
        from: {
          type: 'string',
          description: '기준 통화 ISO 코드 (USD, KRW, JPY, EUR, GBP, CNY 등)',
        },
        to: {
          type: 'string',
          description: '대상 통화 ISO 코드',
        },
        amount: {
          type: 'number',
          description: '변환할 금액 (옵션, 미지정 시 1)',
        },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'calculate',
    description: '수학 계산을 수행합니다. 단순 산술/복리/퍼센트 등 정확한 숫자 답이 필요한 경우 사용. 자체 계산 대신 이 도구 사용 권장 (정확도 ↑).',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'JavaScript 수학 표현식 (예: "1234 * 5 + 100", "Math.pow(1.05, 10) * 1000000"). +,-,*,/,(,),Math.* 지원.',
        },
      },
      required: ['expression'],
    },
  },
];

// ─── 도구 실행 ────────────────────────────────────────────────────────

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * 도구 호출 — name + args → 실제 실행 → result.
 * caller(chat-api)가 tool_call 받아 이 함수 호출, 결과를 다시 LLM에 전달.
 */
export async function executeAITool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  try {
    switch (name) {
      case 'get_current_time': return await execGetCurrentTime(args.timezone as string | undefined);
      case 'get_weather':      return await execGetWeather(String(args.location ?? ''));
      case 'get_currency_rate': return await execGetCurrencyRate(
        String(args.from ?? '').toUpperCase(),
        String(args.to ?? '').toUpperCase(),
        typeof args.amount === 'number' ? args.amount : 1,
      );
      case 'calculate':        return execCalculate(String(args.expression ?? ''));
      default:                 return { success: false, error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── 개별 도구 구현 ──────────────────────────────────────────────────

async function execGetCurrentTime(timezone?: string): Promise<ToolResult> {
  const now = new Date();
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    const formatter = new Intl.DateTimeFormat('ko-KR', {
      timeZone: tz,
      dateStyle: 'full',
      timeStyle: 'long',
    });
    return {
      success: true,
      data: {
        iso: now.toISOString(),
        local: formatter.format(now),
        timezone: tz,
        timestamp: now.getTime(),
      },
    };
  } catch (e) {
    return { success: false, error: `Invalid timezone: ${tz} (${e instanceof Error ? e.message : ''})` };
  }
}

async function execGetWeather(location: string): Promise<ToolResult> {
  if (!location.trim()) return { success: false, error: 'Location required' };
  // wttr.in — free, no key, CORS 허용. j1 format = JSON.
  const url = `https://wttr.in/${encodeURIComponent(location)}?format=j1&lang=ko`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return { success: false, error: `wttr.in ${res.status}` };
    const j = await res.json();
    const cur = j?.current_condition?.[0];
    if (!cur) return { success: false, error: 'No current weather data' };
    return {
      success: true,
      data: {
        location,
        temp_c: cur.temp_C,
        feels_like_c: cur.FeelsLikeC,
        condition: cur.lang_ko?.[0]?.value || cur.weatherDesc?.[0]?.value,
        humidity_pct: cur.humidity,
        wind_kmh: cur.windspeedKmph,
        observation_time: cur.observation_time,
      },
    };
  } catch (e) {
    clearTimeout(timer);
    return { success: false, error: e instanceof Error ? e.message : 'Weather fetch failed' };
  }
}

async function execGetCurrencyRate(from: string, to: string, amount: number): Promise<ToolResult> {
  if (!from || !to) return { success: false, error: 'from and to required' };
  // open.er-api.com — free, no key, CORS 허용
  const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return { success: false, error: `er-api ${res.status}` };
    const j = await res.json();
    const rate = j?.rates?.[to];
    if (typeof rate !== 'number') return { success: false, error: `Rate not found: ${to}` };
    return {
      success: true,
      data: {
        from,
        to,
        amount,
        rate,
        converted: amount * rate,
        last_update: j.time_last_update_utc,
      },
    };
  } catch (e) {
    clearTimeout(timer);
    return { success: false, error: e instanceof Error ? e.message : 'Currency fetch failed' };
  }
}

function execCalculate(expression: string): ToolResult {
  if (!expression.trim()) return { success: false, error: 'expression required' };
  // [2026-05-02 Roy] 안전한 수학 표현식 파서 — eval/Function 우회.
  // 허용: 숫자, +, -, *, /, %, (, ), ., 공백, Math.* 메서드.
  // 금지: 변수, 키워드, 함수 호출(Math.* 외), 대괄호, 세미콜론, 따옴표, ;, =.
  const sanitized = expression.replace(/\s+/g, '');
  const allowedPattern = /^(?:[\d.+\-*/%()]|Math\.(?:abs|ceil|floor|round|sqrt|pow|log|log10|log2|exp|sin|cos|tan|asin|acos|atan|atan2|min|max|PI|E|LN2|LN10|LOG2E|LOG10E|SQRT2|SQRT1_2|sign|trunc|cbrt|hypot)(?:\([^=;'"\[\]]*\))?)+$/;
  if (!allowedPattern.test(sanitized)) {
    return {
      success: false,
      error: `Disallowed expression. Only +,-,*,/,%,(,), digits, and Math.* methods allowed. Got: ${expression}`,
    };
  }
  try {
    // Function constructor — 격리된 스코프, sanitize 통과한 식만 실행.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const result = new Function(`"use strict"; return (${expression});`)();
    if (typeof result !== 'number' || !isFinite(result)) {
      return { success: false, error: `Result is not a finite number: ${result}` };
    }
    return { success: true, data: { expression, result } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Calculation failed' };
  }
}

// ─── Provider별 spec 변환 ───────────────────────────────────────────

/** OpenAI tools array format */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toOpenAITools(): any[] {
  return AI_TOOLS.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

/** Anthropic tools array format */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toAnthropicTools(): any[] {
  return AI_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

/** Gemini function declarations format (tools가 google_search와 동시 X — caller가 분기) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toGeminiFunctionDeclarations(): any[] {
  return [{
    function_declarations: AI_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
  }];
}
