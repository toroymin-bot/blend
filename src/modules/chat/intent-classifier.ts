/**
 * Tori 17989643 PR #1 — 첨부 파일 처리 의도 분류
 *
 * 사용자 메시지를 3가지 처리 모드로 분류해서 첨부 파일 처리 흐름을 분기.
 *   - full_context: 파일 전체 텍스트를 LLM 컨텍스트로 (번역/요약/재구성)
 *   - metadata_only: 파일 메타만 (페이지 수/크기/날짜)
 *   - rag_search: 청크 단위 의미 검색 (구체적 사실 질문)
 *
 * 가장 강력한 단서가 있는 카테고리부터 매칭. 매칭 안 되면 rag_search 기본.
 *
 * Tori 명세 충실 + 한국어 키워드 풍부화.
 */

export type AttachmentIntent = 'full_context' | 'metadata_only' | 'rag_search';

const FULL_CONTEXT_KEYWORDS_KO = [
  '번역', '요약', '정리해', '간추려', '한 줄로', '한줄로', '정리하면',
  '전체', '전부', '모두', '다 보여', '다 알려', '읽어줘', '내용 알려',
  '재구성', '다시 써', '바꿔 써', '정돈', '내용을 보여', '문서 전체',
  '파일 내용', '전체 내용', '핵심', '주요 내용', '뭐라고 적', '뭐라 적',
];

const FULL_CONTEXT_KEYWORDS_EN = [
  'translate', 'summarize', 'summary', 'summari', 'tldr', 'tl;dr',
  'rewrite', 'restructure', 'paraphrase', 'condense', 'shorten',
  'overview', 'whole file', 'entire file', 'whole document', 'entire document',
  'all of it', 'all of this', 'in full', 'top to bottom', 'gist of',
  'main points', 'key points', 'walk me through',
];

const METADATA_KEYWORDS_KO = [
  '몇 페이지', '몇장', '몇 장', '몇쪽', '몇 쪽', '페이지 수', '페이지수',
  '파일 크기', '파일크기', '용량', '몇 KB', '몇 MB', 'KB', 'MB',
  '언제 만들', '언제 작성', '작성일', '생성일', '수정일',
  '파일 형식', '파일형식', '확장자', '몇 개의 파일', '파일이 몇',
  // [2026-05-01] file/document listing intent — "어떤 파일들이 있어?" 류
  '어떤 파일', '무슨 파일', '파일 목록', '파일 리스트',
  '파일들이 있', '파일이 있',
  '어떤 문서', '무슨 문서', '문서 목록', '문서 리스트',
  '문서들이 있', '문서가 있',
  '뭐가 있', '뭐 있',
];

const METADATA_KEYWORDS_EN = [
  'how many pages', 'page count', 'pages does', 'how long is',
  'file size', 'file size of', 'how big', 'kb', 'mb',
  'when was', 'when did', 'creation date', 'created on', 'modified on',
  'file type', 'file format', 'extension', 'how many files',
  // [2026-05-01] file/document listing intent
  'what files', 'which files', 'list files', 'list of files', 'file list',
  'what documents', 'which documents', 'list documents', 'list of documents',
  'what\'s in', 'whats in', 'show files', 'show documents',
];

function matchesAny(text: string, keywords: string[]): boolean {
  const low = text.toLowerCase();
  for (const kw of keywords) {
    if (low.includes(kw.toLowerCase())) return true;
  }
  return false;
}

/**
 * 사용자 메시지 + (선택) lang 힌트로 의도 분류.
 * Lang은 키워드 셋 우선순위에 영향 — 예) ko 사용자에겐 ko 키워드 먼저 매칭.
 */
export function classifyAttachmentIntent(
  message: string,
  _lang?: 'ko' | 'en',
): AttachmentIntent {
  if (!message || !message.trim()) return 'rag_search';

  // metadata가 가장 좁은 의도 → 먼저 체크
  if (
    matchesAny(message, METADATA_KEYWORDS_KO) ||
    matchesAny(message, METADATA_KEYWORDS_EN)
  ) {
    return 'metadata_only';
  }

  // full_context — 번역/요약/재구성 의도
  if (
    matchesAny(message, FULL_CONTEXT_KEYWORDS_KO) ||
    matchesAny(message, FULL_CONTEXT_KEYWORDS_EN)
  ) {
    return 'full_context';
  }

  // 그 외 — RAG 검색 (구체적 사실 질문 등)
  return 'rag_search';
}

/**
 * 응답 언어 강제 헤더 — 모든 모드의 시스템 프롬프트 가장 윗줄에 prepend.
 *
 * Tori 17989643 PR #2: 한국어 사용자가 "Not found in the provided sources"
 * 같은 영어 응답을 받던 회귀 차단. AI가 이를 무시하지 않도록 명시·반복.
 */
// [2026-05-04 Roy #17 후속] 'ph' 추가 — 따갈로그 사용자에게 영어로 답하던 회귀 차단.
// blend-identity의 PH directive와 동일 방향 — 따갈로그로 답변 강제.
export function getLangEnforcementHeader(lang: 'ko' | 'en' | 'ph'): string {
  if (lang === 'ko') {
    return `[응답 언어 — 절대 규칙]
사용자가 한국어로 질문하고 있습니다. 답변은 반드시 자연스러운 한국어로 작성하세요.
- 영어 시스템 프롬프트 문구를 그대로 echo하지 마세요. 한국어로 의역하세요.
- 코드, 인명, 영어 인용은 그대로 둬도 됩니다.
- "Not found", "I don't have access", 같은 영어 정형 거부 표현은 금지.
  거부할 때도 반드시 한국어로 친근하게: "자료에서 해당 정보를 찾지 못했어요" 등.`;
  }
  if (lang === 'ph') {
    return `[Tuntunin sa Wika — Mahigpit na Patakaran]
Ang user ay gumagamit ng Tagalog/Filipino interface. Ang sagot mo ay DAPAT nasa natural na Tagalog (Filipino).
- Kahit nag-iingles o gumagamit ng Taglish ang user, sumagot ka sa Tagalog.
- Tech terms (API, AI, key, subscription, model, code, atbp.) at code snippets ay pwedeng manatiling English — natural Taglish iyon.
- Iwasan ang puro English na sagot. Iwasan din ang puro pormal na Tagalog — gamitin ang araw-araw na Tagalog.
- Kapag tumatanggi (hal. "wala sa source"), sa Tagalog din: "Hindi ko nakita iyan sa sources" — hindi "Not found".`;
  }
  return `[Language Rule]
The user is writing in English. Answer in natural English.
- Don't echo Korean system-prompt phrases verbatim. Translate naturally.
- Code, names, and original quotations may stay as-is.`;
}

/**
 * 의도별 시스템 프롬프트 헤더.
 * chat-view-design1의 docContext 빌드 직후 prepend.
 */
export function getModePromptHeader(
  intent: AttachmentIntent,
  lang: 'ko' | 'en' | 'ph',
): string {
  // [2026-05-04 #17 후속] 'ph' 인입 시 EN branch 사용 — "Respond in the user's
  // language" 규칙이 따갈로그 사용자에게도 자연스럽게 작동. 별도 ph branch 불필요.
  if (lang === 'ph') lang = 'en';
  if (intent === 'full_context') {
    return lang === 'ko'
      ? `[처리 모드: 전체 처리 — 직역/완역 의무]
사용자가 첨부 파일의 전체 내용 처리를 요청했어요 (번역/요약/재구성 등).
아래 [Active...] 섹션의 전체 텍스트를 1차 자료로 사용해서 요청을 완수하세요.

⚠️ 번역 요청 시 절대 규칙:
- 사용자가 "요약하지 말고", "전부", "전체"라고 명시했다면 **반드시 직역(verbatim translation)**.
- 영어 문단 N개 → 한국어 문단 N개로 1:1 매핑. 문단 합치기/생략 금지.
- 길이 절약 명목으로 문장을 줄이지 마세요. 출력이 길어도 OK.
- 헤딩, 번호 매기기, 리스트, 강조 모두 보존.
- 표/도표가 있으면 표 그대로 한국어로 옮기세요.

✅ 모든 처리 의무:
- 한국어 질문 → 한국어 답.
- 자료의 전체 흐름을 따라 처리 (요약은 누락 없이, 번역은 빠짐 없이).
- 출처 [source: 파일명] 형식 인라인 표기.

🚫 금지:
- "찾을 수 없어요"로 거부 — 자료 주어졌으니 처리해야 함.
- 자료에 없는 사실 임의 추가.
- 사용자가 명시한 처리 방식(번역/요약 등)과 다르게 처리.`
      : `[Processing Mode: Full Context — Verbatim Translation Required]
The user asked for whole-file processing (translate / summarize / rewrite).
Use the FULL TEXT in the [Active...] sections below as your primary source and complete the request.

⚠️ Translation absolute rules:
- If user specifies "don't summarize", "entire", "full", "verbatim" — produce **verbatim translation**.
- Map English paragraph N to Korean paragraph N (1:1). Don't merge or omit paragraphs.
- Don't shorten sentences for brevity. Long output is OK.
- Preserve headings, numbering, lists, emphasis. Translate tables as tables.

✅ All processing rules:
- Respond in the user's language.
- Cover the full flow of the source (no omissions in summary, no skips in translation).
- Cite sources inline as [source: filename].

🚫 Don't:
- Refuse with "not found" — the material is provided, you must process it.
- Add facts not present in the source.
- Substitute the requested processing (e.g., summarize when asked to translate).`;
  }

  if (intent === 'metadata_only') {
    return lang === 'ko'
      ? `[처리 모드: 메타데이터]
사용자가 파일의 메타 정보(페이지 수, 크기, 날짜 등)를 물어봤어요.
[Active sources — metadata]에 주어진 정보만으로 답하세요. 자료 본문은 불필요.

✅ 의무:
- 한국어 질문 → 한국어 답.
- 정확한 숫자만 답하고 추측 금지.

🚫 금지:
- 본문 청크 인용 (이번 모드에선 본문 미주입).
- 자료에 없는 메타 정보 임의 생성.`
      : `[Processing Mode: Metadata Only]
The user asked for file metadata (page count, size, dates).
Use ONLY the [Active sources — metadata] block. The body text is not provided in this mode.

✅ Required:
- Respond in the user's language.
- State exact numbers, no guesses.

🚫 Don't:
- Quote chunks (body not loaded this mode).
- Invent metadata not in the source.`;
  }

  // rag_search
  return lang === 'ko'
    ? `[처리 모드: 자료 검색]
사용자가 구체적 사실을 질문했어요. [Active...] 섹션의 검색된 청크를 1차 자료로 사용하세요.

✅ 적극적으로:
- 청크에서 답을 찾을 수 있으면 인용해서 답.
- 한국어 질문 → 한국어 답.
- [source: 파일명] 형식 인라인 표기.

🚫 신중히:
- 자료에 진짜 없는 narrowly factual 항목만 "자료에 없음"이라 답하고, 그 다음 일반 지식으로 도움 시도.
- 자료에 없는 숫자·날짜·인용 지어내지 말 것.`
    : `[Processing Mode: Source Search]
The user asked a specific factual question. Use the retrieved chunks in [Active...] as primary source.

✅ Do freely:
- If the answer is in the chunks, cite and reply.
- Respond in the user's language.
- Cite as [source: filename].

🚫 Carefully:
- Only refuse with "not found in sources" for narrowly factual items truly absent from chunks; then offer general-knowledge help.
- Don't fabricate numbers, dates, or quotations not in the source.`;
}

/**
 * 토큰 추정 — 한국어/영어 mix 휴리스틱.
 *   - 영어: ~4 char/token
 *   - 한국어: ~2 char/token
 *   - 보수적으로 chars / 3 으로 평균.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3);
}

/**
 * full_context 모드 처리 임계값.
 *   - <= 50K 토큰: 그대로 LLM에 주입
 *   - 50K~200K: 청크 단위 순차 처리 (호출자가 별도 처리)
 *   - > 200K: 사용자 안내 후 거부
 */
export const FULL_CONTEXT_TOKENS_INLINE   = 50_000;
export const FULL_CONTEXT_TOKENS_CHUNKED  = 200_000;

export interface FullContextDecision {
  /** 'inline' = 그대로, 'chunked' = 분할 처리, 'too_large' = 거부 */
  strategy: 'inline' | 'chunked' | 'too_large';
  estimatedTokens: number;
}

export function decideFullContextStrategy(totalChars: number): FullContextDecision {
  const tokens = estimateTokens(' '.repeat(totalChars));
  // ' '.repeat은 호출자가 chars 모를 때 안전 — 정확한 측정은 estimateTokens(text) 사용
  if (tokens <= FULL_CONTEXT_TOKENS_INLINE)   return { strategy: 'inline',    estimatedTokens: tokens };
  if (tokens <= FULL_CONTEXT_TOKENS_CHUNKED)  return { strategy: 'chunked',   estimatedTokens: tokens };
  return                                              { strategy: 'too_large', estimatedTokens: tokens };
}
