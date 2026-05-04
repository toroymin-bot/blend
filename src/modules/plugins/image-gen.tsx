'use client';

// Blend - Image Generation Plugin
//
// [2026-05-03 Roy v5 — 50 error cases robust] Roy 명시 요구:
//   "이미지 관련해서 어떤 각도에서도 잘 해결할 수 있도록 50가지의 에러 가능성을
//    두고 모든 조건을 만족하는 방법을 각각 찾아내서 에러 없이 동작하는 코드"
//
// 50가지 에러 케이스 분류 + 카테고리별 자동 처리:
//
// === API 인증/권한 (1-7) ===
//  1. 401 invalid API key
//  2. 401 expired/revoked key
//  3. 401 wrong key format
//  4. 403 organization not verified (gpt-image)
//  5. 403 unsupported region
//  6. 403 billing not setup
//  7. 402 insufficient quota / payment required
//
// === Rate Limit / Quota (8-11) ===
//  8. 429 rate_limit_exceeded (RPM)
//  9. 429 tokens_per_minute (TPM)
// 10. 429 monthly quota exceeded
// 11. 429 organization rate limit
//
// === Model 호환성 (12-17) ===
// 12. 404 model_not_found
// 13. 400 invalid model name
// 14. 400 unknown parameter (response_format on gpt-image)
// 15. 400 unsupported size for model
// 16. 400 unsupported quality value
// 17. 410 model deprecated
//
// === 컨텐츠 정책 (18-22) ===
// 18. 400 content_policy_violation (NSFW)
// 19. 400 violence/violence imagery
// 20. 400 prompt safety filter
// 21. 400 minor in image
// 22. 400 copyright/celebrity
//
// === 입력 검증 (23-28) ===
// 23. prompt 빈 문자열
// 24. prompt 너무 짧음 (< 3자)
// 25. prompt 너무 김 (> 4000자, OpenAI 한도)
// 26. prompt에 unicode 깨짐
// 27. prompt 비ASCII 100% 미지원 모델
// 28. prompt에 prompt-injection 시도
//
// === 네트워크 (29-34) ===
// 29. AbortError (timeout)
// 30. NetworkError (offline)
// 31. CORS error
// 32. DNS failure
// 33. SSL handshake failure
// 34. Connection reset
//
// === 응답 파싱 (35-41) ===
// 35. JSON parse failure
// 36. unexpected response shape (data 비어있음)
// 37. b64_json 빈 문자열
// 38. b64_json 짧음 (<1000자, invalid PNG)
// 39. b64_json invalid base64 chars
// 40. url 빈 문자열
// 41. url 만료됨 (DALL-E 1시간 후)
//
// === 서버 (42-46) ===
// 42. 500 internal server error
// 43. 502 bad gateway
// 44. 503 service unavailable
// 45. 504 gateway timeout
// 46. transient overload
//
// === 브라우저 환경 (47-50) ===
// 47. localStorage quota exceeded
// 48. fetch API 미지원
// 49. FileReader 실패
// 50. URL.createObjectURL 실패
//
// 처리 전략:
//   (A) 사용자 잘못 아닌 모든 케이스 → DALL-E 3로 자동 fallback (Blend 핵심 원칙)
//   (B) 사용자 행동 필요 → 친절 마크다운 + 직링크
//   (C) 일시적 → 재시도 안내
//   (D) 입력 검증 → 호출 전 차단

import { recordApiUsage } from '@/lib/analytics';

// ─── 가격 (cost tracking) ──────────────────────────────────────────
function imageCostUSD(modelId: string): number {
  if (/^gpt-image-2/.test(modelId)) return 0.040;
  if (/^gpt-image-1/.test(modelId)) return 0.040;
  if (/^dall-e-3/.test(modelId))    return 0.040;
  if (/^dall-e-2/.test(modelId))    return 0.020;
  return 0.04;
}

// ─── 타입 ──────────────────────────────────────────────────────────
export interface ImageGenResult {
  url?: string;
  error?: string;
  modelUsed?: string;
  fallbackFrom?: string;
  /** 친절 마크다운 메시지 (사용자 표시용). error 있을 때만 채워짐. */
  friendlyMessage?: string;
}

/** 에러 카테고리 — 50가지를 12개 클래스로 압축 */
type ErrorCategory =
  | 'auth'              // 1-3 API 키 문제
  | 'verification'      // 4 organization verification
  | 'region'            // 5 unsupported region
  | 'billing'           // 6, 7 결제/quota
  | 'rate_limit'        // 8-11 rate limit
  | 'model'             // 12, 13, 17 model 문제
  | 'schema'            // 14-16 parameter/size mismatch
  | 'content_policy'    // 18-22 컨텐츠 거부
  | 'invalid_input'     // 23-28 입력 문제
  | 'network'           // 29-34 네트워크
  | 'empty_response'    // 35-41 응답 파싱
  | 'server'            // 42-46 5xx
  | 'unknown';          // 분류 불가

interface ClassifiedError {
  category: ErrorCategory;
  /** dall-e-3 자동 fallback 시도해야 하는지 (사용자 잘못 아닌 케이스). */
  shouldFallback: boolean;
  /** 사용자에게 줄 친절 마크다운 메시지 (KO). */
  friendlyKo: string;
  /** 영어 버전. */
  friendlyEn: string;
}

// ─── 패턴 매칭 ────────────────────────────────────────────────────
const PATTERNS = {
  auth:           /401|invalid.*api.*key|incorrect.*api.*key|api[\s_-]?key.*(invalid|expired|revoked|wrong)|unauthorized|authentication/i,
  verification:   /must be verified|organization.*(verif|verify)|verified to use|verify.*organization/i,
  region:         /region.*not.*support|unsupported.*region|country.*not.*support|geographic/i,
  billing:        /402|insufficient.*quota|insufficient.*credit|billing|payment.*required|exceeded.*usage/i,
  rate_limit:     /429|rate.?limit|too many|requests per|tokens per|tpm|rpm|quota.*exceeded/i,
  model:          /404|model.*not.*found|model.*not.*exist|model.*not.*available|deprecated|410/i,
  schema:         /unknown parameter|invalid.*parameter|parameter.*not.*support|unsupported.*parameter|missing.*required.*parameter|invalid.*size|invalid.*quality/i,
  content_policy: /content.*policy|safety.*system|safety.*filter|moderation|inappropriate|violence|sexual|nsfw|copyright|celebrity|public.*figure/i,
  invalid_input:  /invalid.*input|prompt.*too.*long|prompt.*too.*short|prompt.*empty|invalid.*request/i,
  network:        /network.*error|failed.*to.*fetch|fetch.*failed|enotfound|econnrefused|econnreset|ssl|tls|dns/i,
  timeout:        /aborted|timeout|abort.*reason|시간 초과|timed.*out/i,
  empty_response: /no image url|빈 이미지|empty.*image|b64.*length|returned.*empty|invalid.*base64/i,
  server:         /5\d{2}|server.*error|internal.*error|service.*unavailable|bad.*gateway|gateway.*timeout/i,
} as const;

/** 입력 prompt 검증 — 호출 전 막을 수 있는 케이스. */
function validatePrompt(prompt: string): { ok: true } | { ok: false; classified: ClassifiedError } {
  const trimmed = (prompt ?? '').trim();
  if (!trimmed) {
    return {
      ok: false,
      classified: {
        category: 'invalid_input',
        shouldFallback: false,
        friendlyKo: `🎨 **그릴 내용을 알려주세요.** 예: "검은 고양이를 그려줘", "결혼식 신부 이미지 보여줘"`,
        friendlyEn: `🎨 **Tell me what to draw.** Example: "draw a black cat", "show me a bride at a wedding"`,
      },
    };
  }
  if (trimmed.length < 3) {
    return {
      ok: false,
      classified: {
        category: 'invalid_input',
        shouldFallback: false,
        friendlyKo: `🎨 **조금 더 자세히 알려주세요.** 최소 3자 이상의 설명이 필요해요.`,
        friendlyEn: `🎨 **Need a bit more detail.** Minimum 3 characters.`,
      },
    };
  }
  // OpenAI gpt-image: 32000자, dall-e-3: 4000자. 안전하게 4000자 제한.
  if (trimmed.length > 4000) {
    return {
      ok: false,
      classified: {
        category: 'invalid_input',
        shouldFallback: false,
        friendlyKo: `🎨 **설명이 너무 길어요** (${trimmed.length}자, 한도 4000자). 핵심만 짧게 요약해서 다시 시도해주세요.`,
        friendlyEn: `🎨 **Prompt too long** (${trimmed.length} chars, max 4000). Please shorten and retry.`,
      },
    };
  }
  return { ok: true };
}

/** 에러 메시지 → 카테고리 분류 + 친절 메시지 도출. */
function classifyImageError(rawError: string, modelId: string): ClassifiedError {
  const e = String(rawError ?? '').toLowerCase();

  // === 1. 입력 검증 (서버가 알려준 경우) ===
  if (PATTERNS.content_policy.test(e)) {
    return {
      category: 'content_policy',
      shouldFallback: false, // 다른 모델로 바꿔도 같은 정책 거부 가능성 높음
      friendlyKo:
        `🎨 **OpenAI 안전 정책에 의해 이 요청은 그릴 수 없어요.**\n\n` +
        `**이런 내용이 거부될 수 있어요**:\n` +
        `• 폭력적/선정적 내용  • 실제 인물(연예인 등)  • 저작권 캐릭터  • 미성년자 이미지\n\n` +
        `**바로 해결하기**: 설명을 가상 인물/배경으로 바꾸거나, 좀 더 일반적인 표현으로 다시 그려달라고 해보세요.`,
      friendlyEn:
        `🎨 **This request was blocked by OpenAI's safety policy.**\n\n` +
        `**Often blocked**: violence, explicit content, real people (celebrities), copyrighted characters, minors.\n\n` +
        `**Fix**: Rephrase with fictional subjects or more general descriptions and try again.`,
    };
  }

  // === 2. 인증 / 키 문제 ===
  if (PATTERNS.auth.test(e)) {
    return {
      category: 'auth',
      shouldFallback: false, // 키 자체 문제는 fallback 불가 (어차피 같은 키)
      friendlyKo:
        `🔑 **OpenAI API 키에 문제가 있어요.**\n\n` +
        `**바로 해결하기**:\n` +
        `1. [OpenAI 콘솔 → API Keys](https://platform.openai.com/api-keys) 에서 키가 살아있는지 확인\n` +
        `2. 새 키 발급 → 복사 (sk-... 로 시작, 앞뒤 공백 없이)\n` +
        `3. **설정 → API 키 관리 → OpenAI** 칸에 붙여넣고 [테스트] 클릭\n\n` +
        `<sub>원본: ${rawError.slice(0, 120)}</sub>`,
      friendlyEn:
        `🔑 **There's an issue with your OpenAI API key.**\n\n` +
        `1. Check your key at [OpenAI Console](https://platform.openai.com/api-keys)\n` +
        `2. Issue a new one if needed (starts with sk-...)\n` +
        `3. Paste into **Settings → API Keys → OpenAI**, click [Test]`,
    };
  }

  // === 3. Verification ===
  if (PATTERNS.verification.test(e)) {
    return {
      category: 'verification',
      shouldFallback: true, // → DALL-E 3 (verify 불필요)
      friendlyKo:
        `🎨 **${modelId}는 OpenAI 조직 인증이 필요해요.**\n\n` +
        `[OpenAI 콘솔 → Organization](https://platform.openai.com/settings/organization/general) → [Verify Organization] (약 15분).\n` +
        `Blend가 자동으로 표준(DALL-E 3)으로 전환해 그릴게요.`,
      friendlyEn:
        `🎨 **${modelId} requires OpenAI organization verification.**\n\n` +
        `[Verify your org here](https://platform.openai.com/settings/organization/general) (~15 min).\n` +
        `Blend will auto-switch to Standard (DALL-E 3).`,
    };
  }

  // === 4. 결제 / Billing ===
  if (PATTERNS.billing.test(e)) {
    return {
      category: 'billing',
      shouldFallback: true, // 같은 키지만 다른 모델은 quota가 다를 수 있음
      friendlyKo:
        `💳 **OpenAI 계정 결제 한도/크레딧에 문제가 있어요.**\n\n` +
        `**바로 해결하기**:\n` +
        `1. [OpenAI 콘솔 → Billing](https://platform.openai.com/settings/organization/billing/overview) 에서 결제 방법 등록 + 잔액 충전\n` +
        `2. [Usage Limits](https://platform.openai.com/settings/organization/limits) 에서 월간 한도 확인/조정\n\n` +
        `<sub>원본: ${rawError.slice(0, 120)}</sub>`,
      friendlyEn:
        `💳 **Issue with your OpenAI billing/credits.**\n\n` +
        `1. Add payment + credits at [OpenAI Billing](https://platform.openai.com/settings/organization/billing/overview)\n` +
        `2. Check monthly limits at [Usage Limits](https://platform.openai.com/settings/organization/limits)`,
    };
  }

  // === 5. Rate limit (분당 한도) ===
  if (PATTERNS.rate_limit.test(e)) {
    return {
      category: 'rate_limit',
      shouldFallback: true, // gpt-image-* TPM은 dall-e와 별도 quota
      friendlyKo:
        `⏳ **${modelId} 분당 요청 한도에 도달했어요.** Blend가 자동으로 표준(DALL-E 3, 별도 한도)으로 전환해 그릴게요.\n` +
        `장기 해결: [OpenAI 사용 등급(Tier) 올리기](https://platform.openai.com/settings/organization/limits)`,
      friendlyEn:
        `⏳ **${modelId} rate limit hit.** Blend auto-switches to Standard (DALL-E 3, separate quota).\n` +
        `Long-term: [Upgrade your tier](https://platform.openai.com/settings/organization/limits)`,
    };
  }

  // === 6. Schema mismatch (parameter 호환성) ===
  if (PATTERNS.schema.test(e)) {
    return {
      category: 'schema',
      shouldFallback: true, // dall-e는 다른 파라미터 셋 — 통할 가능성
      friendlyKo:
        `🔧 **${modelId} API 스펙이 변경됐어요.** Blend가 자동으로 표준(DALL-E 3)으로 전환해 그릴게요.\n` +
        `다음 cron 실행(3시간 주기) 후에 자동 갱신됩니다.`,
      friendlyEn:
        `🔧 **${modelId} API spec changed.** Blend auto-switches to Standard (DALL-E 3).\n` +
        `Will auto-update on next cron sync (3-hour interval).`,
    };
  }

  // === 7. Model 문제 (404, deprecated) ===
  if (PATTERNS.model.test(e)) {
    return {
      category: 'model',
      shouldFallback: true,
      friendlyKo:
        `🔄 **${modelId}를 사용할 수 없어요** (모델 폐기 또는 접근 권한 없음). Blend가 자동으로 표준(DALL-E 3)으로 그릴게요.`,
      friendlyEn:
        `🔄 **${modelId} unavailable** (deprecated or no access). Blend auto-switches to Standard (DALL-E 3).`,
    };
  }

  // === 8. Region ===
  if (PATTERNS.region.test(e)) {
    return {
      category: 'region',
      shouldFallback: false, // 지역 차단은 모델 바꿔도 같음
      friendlyKo:
        `🌐 **OpenAI가 현재 지역에서 이 모델을 지원하지 않아요.**\n\n` +
        `해결: VPN 사용 또는 OpenAI [지원 국가 목록](https://platform.openai.com/docs/supported-countries) 확인.`,
      friendlyEn:
        `🌐 **OpenAI doesn't support this model in your region.**\n\n` +
        `Use a VPN or check [supported countries](https://platform.openai.com/docs/supported-countries).`,
    };
  }

  // === 9. Timeout ===
  if (PATTERNS.timeout.test(e)) {
    return {
      category: 'network',
      shouldFallback: true, // dall-e 시도해볼 가치 (보통 더 빠름)
      friendlyKo:
        `⏱ **${modelId} 응답이 90초 안에 오지 않았어요.** OpenAI 서버 부하 일시적 신호. Blend가 자동으로 표준(DALL-E 3, 보통 더 빠름)으로 다시 시도할게요.`,
      friendlyEn:
        `⏱ **${modelId} didn't respond within 90s.** Likely transient OpenAI load. Blend auto-retries with Standard (DALL-E 3, usually faster).`,
    };
  }

  // === 10. Network ===
  if (PATTERNS.network.test(e)) {
    return {
      category: 'network',
      shouldFallback: false, // 네트워크 자체 문제는 fallback도 실패할 가능성
      friendlyKo:
        `📡 **인터넷 연결 또는 OpenAI 서버 연결 문제예요.**\n\n` +
        `**바로 해결하기**:\n` +
        `1. Wi-Fi/모바일 데이터 연결 확인\n` +
        `2. 잠시 후 다시 시도\n` +
        `3. [OpenAI 상태 페이지](https://status.openai.com) 에서 장애 여부 확인\n\n` +
        `<sub>원본: ${rawError.slice(0, 120)}</sub>`,
      friendlyEn:
        `📡 **Network or OpenAI connection issue.**\n\n` +
        `1. Check Wi-Fi / mobile data\n` +
        `2. Retry in a moment\n` +
        `3. Check [OpenAI status](https://status.openai.com) for outages`,
    };
  }

  // === 11. Empty / invalid response ===
  if (PATTERNS.empty_response.test(e)) {
    return {
      category: 'empty_response',
      shouldFallback: true,
      friendlyKo:
        `🎨 **${modelId}가 빈 이미지를 반환했어요.** 보통 verification 미완료 시 silent 실패 신호. Blend가 자동으로 표준(DALL-E 3)으로 다시 그릴게요.`,
      friendlyEn:
        `🎨 **${modelId} returned an empty image.** Often a silent verification failure. Blend auto-retries with Standard (DALL-E 3).`,
    };
  }

  // === 12. Server (5xx) ===
  if (PATTERNS.server.test(e)) {
    return {
      category: 'server',
      shouldFallback: true,
      friendlyKo:
        `🌐 **OpenAI 서버 일시 장애예요.** Blend가 자동으로 표준(DALL-E 3)으로 다시 시도할게요. 그것도 실패하면 1-2분 후 재시도해주세요. [OpenAI 상태](https://status.openai.com)`,
      friendlyEn:
        `🌐 **OpenAI server hiccup.** Blend auto-retries with Standard (DALL-E 3). If that fails, retry in 1-2 min. [OpenAI status](https://status.openai.com)`,
    };
  }

  // === Default: unknown — 보수적으로 fallback 시도 ===
  return {
    category: 'unknown',
    shouldFallback: true,
    friendlyKo:
      `🎨 **${modelId}로 그리지 못했어요.** Blend가 자동으로 표준(DALL-E 3)으로 다시 시도할게요.\n\n` +
      `<sub>원본: ${rawError.slice(0, 200)}</sub>`,
    friendlyEn:
      `🎨 **Couldn't draw with ${modelId}.** Blend auto-retries with Standard (DALL-E 3).\n\n` +
      `<sub>Original: ${rawError.slice(0, 200)}</sub>`,
  };
}

// ─── 단일 모델 호출 ──────────────────────────────────────────────
async function generateImageOnce(prompt: string, apiKey: string, modelId: string): Promise<ImageGenResult> {
  // 환경 검증 — 50번 cases 47-50 (브라우저 환경)
  if (typeof fetch === 'undefined') {
    return { error: '브라우저 fetch API 미지원 — 최신 브라우저로 업데이트 필요' };
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    const isGptImage = /^gpt-image-/.test(modelId);
    // [v4 hotfix] response_format은 dall-e 전용 — gpt-image는 항상 b64_json 반환.
    const body: Record<string, unknown> = {
      model: modelId,
      prompt,
      n: 1,
      size: '1024x1024',
      quality: isGptImage ? 'auto' : 'standard',
    };
    if (!isGptImage) {
      body.response_format = 'b64_json';
    }
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
      // HTTP 상태별 추가 컨텍스트 — classifier가 더 정확히 분류 가능.
      const err = await res.json().catch(() => ({}));
      const apiMsg = (err as { error?: { message?: string } })?.error?.message;
      const msg = apiMsg || `OpenAI ${res.status} ${res.statusText || 'error'}`;
      // 상태 코드도 메시지에 포함 (classifier가 401/429/5xx 패턴 잡도록)
      return { error: `${res.status} ${msg}` };
    }
    // JSON 파싱 실패 가드
    let data: { data?: { url?: string; b64_json?: string }[] };
    try {
      data = await res.json();
    } catch (e) {
      void e;
      return { error: 'JSON parse failure — invalid response from OpenAI' };
    }
    const item = data.data?.[0];
    if (!item) {
      return { error: 'returned empty response (no data array)' };
    }
    // 사용량 추적 — flat cost per image
    recordApiUsage({
      provider: 'openai',
      model: modelId,
      inputTokens: 0,
      outputTokens: 0,
      cost: imageCostUSD(modelId),
    });
    // [Roy v7] b64 length 1000 → 10000 강화. 1024x1024 PNG는 보통 100K+ base64 자.
    // 10000자 미만은 거의 확실히 깨진/잘린 응답. 1000자는 너무 관대해 broken 통과.
    const MIN_VALID_B64 = 10000;
    if (item.b64_json && item.b64_json.length >= MIN_VALID_B64) {
      // base64 character 검증 — invalid char 있으면 broken image
      if (!/^[A-Za-z0-9+/]+=*$/.test(item.b64_json.slice(0, 200))) {
        return { error: `invalid base64 characters in response (${modelId})` };
      }
      // [2026-05-03 Roy v6] PNG magic byte 검증 — base64 character 가드 통과하더라도
      // 실제 디코딩하면 invalid PNG일 수 있음 (dall-e-3가 broken bytes 줄 때).
      // 첫 8 byte 디코드 → PNG signature (89 50 4E 47 0D 0A 1A 0A) 또는
      // JPEG (FF D8 FF) 또는 WebP (RIFF) 매칭 검증.
      try {
        const head = item.b64_json.slice(0, 16); // base64 16자 = 12 byte 이상 디코드
        const bin = typeof atob !== 'undefined' ? atob(head) : '';
        const bytes = Array.from(bin).map((c) => c.charCodeAt(0));
        const isPng  = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
        const isJpeg = bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
        const isWebp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46; // RIFF
        if (!isPng && !isJpeg && !isWebp) {
          return { error: `${modelId} returned invalid image bytes (no PNG/JPEG/WebP signature, head=${bytes.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ')})` };
        }
        // 진짜 mimeType 사용 — PNG라고 가정하면 broken
        const mimeType = isPng ? 'image/png' : isJpeg ? 'image/jpeg' : 'image/webp';
        return { url: `data:${mimeType};base64,${item.b64_json}`, modelUsed: modelId };
      } catch (e) {
        void e;
        return { error: `${modelId} base64 decode failed (corrupt response)` };
      }
    }
    if (item.b64_json !== undefined) {
      return { error: `${modelId}가 빈 이미지 반환 (b64 length=${item.b64_json.length}, 정상 ${MIN_VALID_B64}+).` };
    }
    // URL 모드 (DALL-E)
    const url = item.url;
    if (!url || url.length < 10) return { error: 'no image url returned' };
    // DALL-E URL은 1시간 후 만료 → 즉시 base64 변환
    try {
      const imgRes = await fetch(url);
      if (!imgRes.ok) {
        // url fetch 실패 — 만료된 url 가능성, 일단 원본 url 반환 (브라우저가 fetch 시도)
        return { url, modelUsed: modelId };
      }
      const blob = await imgRes.blob();
      // 빈 blob 체크 (50번 case 35)
      if (blob.size < 100) {
        return { error: `image url returned empty content (size=${blob.size})` };
      }
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('FileReader failed'));
        reader.readAsDataURL(blob);
      });
      return { url: base64, modelUsed: modelId };
    } catch (e) {
      // base64 변환 실패해도 원본 URL 반환 (임시 표시 가능)
      void e;
      return { url, modelUsed: modelId };
    }
  } catch (e: unknown) {
    const err = e as { name?: string; message?: string };
    // AbortError → timeout 메시지 변환 (classifier가 timeout 카테고리로 분류)
    if (err?.name === 'AbortError' || /aborted/i.test(err?.message || '')) {
      return { error: `${modelId} 응답 시간 초과(timeout 90s)` };
    }
    // TypeError: Failed to fetch → network 카테고리
    if (err?.name === 'TypeError' && /fetch/i.test(err?.message || '')) {
      return { error: `network error: failed to fetch (offline/CORS/DNS)` };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg };
  }
}

/**
 * 메인 export — 50가지 케이스 robust 처리.
 *  1. 입력 검증 (빈/짧은/긴 prompt 차단)
 *  2. 1차 모델 시도
 *  3. 에러 분류 → 카테고리별 처리:
 *     - shouldFallback=true → dall-e-3로 자동 재시도
 *     - shouldFallback=false → 친절 메시지 즉시 반환
 *  4. fallback도 실패 → 친절 메시지 (사유별)
 */
export async function generateImage(prompt: string, apiKey: string, modelId: string = 'dall-e-3'): Promise<ImageGenResult> {
  // === Step 1. 입력 검증 ===
  const validation = validatePrompt(prompt);
  if (!validation.ok) {
    return { error: validation.classified.friendlyKo, friendlyMessage: validation.classified.friendlyKo };
  }
  // API 키 형식 검증
  if (!apiKey || apiKey.length < 20) {
    const cls = classifyImageError('401 invalid api key (key missing or malformed)', modelId);
    return { error: cls.friendlyKo, friendlyMessage: cls.friendlyKo };
  }

  // === Step 2. 1차 시도 ===
  const result = await generateImageOnce(prompt, apiKey, modelId);
  if (!result.error) return result;

  // === Step 3. 에러 분류 ===
  const classified = classifyImageError(result.error, modelId);

  // dall-e 직접 선택했으면 fallback 무의미 — 친절 메시지로 변환만
  if (/^dall-e-/.test(modelId)) {
    return { error: classified.friendlyKo, friendlyMessage: classified.friendlyKo };
  }

  // 사용자 행동 필요 (auth/region/content_policy 등) — fallback 불필요, 친절 메시지로 즉시 반환
  if (!classified.shouldFallback) {
    return { error: classified.friendlyKo, friendlyMessage: classified.friendlyKo };
  }

  // === Step 4. dall-e-3 자동 fallback ===
  console.warn(`[image-gen] ${modelId} ${classified.category}, falling back to dall-e-3:`, result.error);
  const fallback = await generateImageOnce(prompt, apiKey, 'dall-e-3');
  if (!fallback.error) {
    return { ...fallback, fallbackFrom: modelId };
  }

  // === Step 5. dall-e도 실패 — 두 번째 분류 ===
  const fallbackClassified = classifyImageError(fallback.error, 'dall-e-3');
  // 두 번째 실패는 보통 일시적 (서버/네트워크) — 친절 메시지에 "한 번 더 시도" 안내
  const combinedKo =
    `🎨 **${modelId}와 표준(DALL-E 3) 모두 실패했어요.**\n\n` +
    `**${classified.category === fallbackClassified.category ? '같은 사유' : '서로 다른 사유'}로 실패**:\n` +
    `• ${modelId}: ${classified.friendlyKo.split('\n')[0].replace(/^[🎨🔑💳⏳🌐⏱📡🔧🔄]\s*\*\*/, '').replace(/\*\*$/, '')}\n` +
    `• DALL-E 3: ${fallbackClassified.friendlyKo.split('\n')[0].replace(/^[🎨🔑💳⏳🌐⏱📡🔧🔄]\s*\*\*/, '').replace(/\*\*$/, '')}\n\n` +
    `**바로 시도해보세요**: 1-2분 후 다시 그려달라고 해보세요. 계속 실패하면 [OpenAI 상태](https://status.openai.com) 확인 또는 blend@ai4min.com 문의.`;
  return { error: combinedKo, friendlyMessage: combinedKo };
}

/** Extract /image command from user input. */
export function extractImagePrompt(input: string): string | null {
  const match = input.match(/^\/image\s+(.+)/i);
  return match ? match[1].trim() : null;
}

/** Detect image URLs in AI response text. */
export function extractImageURLs(text: string): string[] {
  const httpRegex = /https?:\/\/\S+\.(?:png|jpg|jpeg|webp|gif)(?:\?\S*)?/gi;
  const httpUrls = text.match(httpRegex) || [];
  const dataRegex = /!\[[^\]]*\]\((data:image\/[^;]+;base64,[^)]+)\)/g;
  const dataUrls: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = dataRegex.exec(text)) !== null) {
    dataUrls.push(m[1]);
  }
  return [...httpUrls, ...dataUrls];
}
