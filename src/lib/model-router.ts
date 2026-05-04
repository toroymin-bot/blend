// Blend - Model Router
// 질문 내용을 분석해서 최적 AI 모델을 자동 선택하는 라우팅 엔진

import { AIModel } from '@/types';
import { getCurrentLanguage } from '@/lib/i18n';

export type RouteCategory =
  | 'coding'       // 코딩/개발/디버깅
  | 'reasoning'    // 추론/수학/논리/심층분석
  | 'creative'     // 창작/글쓰기/카피라이팅
  | 'translation'  // 번역
  | 'vision'       // 이미지 분석 (이미지 첨부 시)
  | 'image_gen'    // 이미지 생성 (DALL-E)
  | 'data'         // 데이터 분석/SQL/통계
  | 'simple'       // 짧은 질문/간단한 답변
  | 'long_doc'     // 긴 문서 분석/요약
  | 'realtime_info' // [2026-05-02] 실시간 정보 (뉴스/주가/날씨/환율) — Gemini grounding 우선
  | 'general';     // 일반 대화

// ── 카테고리별 키워드 (한국어 + 영어) ─────────────────────────────────────
const KW: Record<Exclude<RouteCategory, 'vision' | 'general'>, string[]> = {
  // [2026-05-02 Roy] 실시간 정보 — '오늘/최근/현재/요즘/지금' + '뉴스/주가/환율/날씨/경기/스코어' 등.
  // Gemini grounding으로 Google 검색 자동 → 최신 답변. OpenAI/Anthropic은 search_web 도구 활용.
  realtime_info: [
    // 한국어 — 시간성 + 정보 명사 조합
    '최근 뉴스', '오늘 뉴스', '실시간 뉴스', '속보', '최신 소식',
    '오늘 환율', '현재 환율', '실시간 환율',
    '오늘 주가', '현재 주가', '실시간 주가', '시세',
    '오늘 날씨', '현재 날씨', '내일 날씨', '날씨 예보',
    '경기 결과', '스코어', '오늘 경기',
    '오늘 추천', '오늘 일정', '오늘의', '요즘',
    // 영어
    'latest news', 'today.*news', 'breaking news', 'recent news',
    'current.*price', 'today.*weather', "today's", 'right now',
    'realtime', 'real-time', 'live score', 'stock price',
    'exchange rate', 'currency rate',
  ],
  image_gen: [
    // 한국어 — 동사형 (조사 포함)
    '그려줘', '그려 줘', '그려주세요', '그려봐', '그려봐줘', '그려달라', '그려 달라',
    '그림 그려', '그림을 그려', '그림을 그',
    '이미지 만들어', '이미지를 만들', '이미지 생성', '이미지를 생성',
    '이미지 그려', '이미지를 그려',
    '사진 만들어', '사진을 만들', '사진 생성', '사진을 생성',
    '그림 만들어', '그림을 만들',
    // [2026-05-03 Roy] '이미지로 보여줘' / '사진으로 보여줘' 같은 변형 — Roy 신고.
    // contextual 키워드(이미지/사진/그림)와 '보여' 결합으로 정확히 잡고 일반 '보여줘'(다른 카테고리)와 충돌 회피.
    '이미지로 보여', '이미지를 보여', '사진으로 보여', '사진을 보여',
    '그림으로 보여', '그림을 보여', '이미지로 만들', '사진으로 만들', '그림으로 만들',
    '시각화', '비주얼로',
    '생성해줘', '생성해주세요', '생성해봐', '만들어줘', '만들어주세요',
    '그림체', '삽화', '일러스트', '/image',
    // 영어
    'draw', 'create image', 'generate image', 'make an image',
    'create a picture', 'generate a picture', 'make a picture',
    'create a photo', 'generate a photo',
    'show me an image', 'show me a picture', 'show me a photo',
    'visualize', 'illustrate', 'paint a', 'sketch', 'artwork',
    'image of', 'picture of', 'photo of',
    'dall-e', 'dalle',
  ],
  translation: [
    '번역', '영어로', '한국어로', '일본어로', '중국어로', '영어 번역', '한영',
    '영한', '한글로', '번역해', '번역 해줘', '영문으로',
    'translate', 'translation', 'in english', 'in korean', 'to japanese',
  ],
  coding: [
    '코드', '코딩', '버그', '디버그', '오류', '에러', '함수', '클래스', '메서드',
    '변수', '프로그래밍', '개발', '구현', '배포', '리팩토링', '알고리즘', '자료구조',
    'typescript', 'javascript', 'python', 'react', 'nextjs', 'node', 'sql',
    'api', 'git', 'npm', 'css', 'html', 'java', 'kotlin', 'swift', 'rust', 'go',
    'error', 'debug', 'code', 'function', 'class', 'refactor', 'implement',
    'build', 'compile', 'runtime', 'null', 'undefined', 'import', 'export',
    '스크립트', '쿼리문', '함수 작성', '코드 작성',
  ],
  data: [
    'sql', '쿼리', 'database', '데이터베이스', 'excel', '엑셀',
    '통계', '평균', '분산', '표준편차', '그래프', '차트', '시각화',
    'statistics', 'average', 'chart', 'visualization', 'pivot',
    'pandas', 'numpy', 'tableau', 'power bi', 'bigquery', 'snowflake',
  ],
  reasoning: [
    '수학', '계산', '증명', '논리', '추론', '방정식', '수식', '확률', '미적분',
    '비교 분석', '장단점', '차이점', '분석해', '이유는', '왜냐하면', '근거',
    '최적화', '의사결정', '전략', '시나리오', '예측',
    'math', 'calculate', 'logic', 'proof', 'equation', 'probability',
    'analyze', 'analysis', 'compare', 'pros and cons', 'trade-off',
    'optimize', 'strategy', 'scenario', 'predict',
  ],
  creative: [
    '글 써줘', '소설', '시 써줘', '에세이', '카피', '광고 문구', '슬로건',
    '이메일 작성', '블로그 포스트', '기획안', '보고서 작성', '홍보 문구',
    '스토리', '시나리오', '아이디어', '브레인스토밍',
    'write', 'essay', 'blog post', 'copywriting', 'story', 'poem',
    'creative', 'brainstorm', 'slogan', 'marketing copy',
  ],
  long_doc: [
    '요약해', '요약 해줘', '전체 내용', '핵심만', '문서 분석', '보고서 분석',
    '다 읽어줘', '주요 내용', '요점 정리', '정리해줘', '전문 분석',
    'summarize', 'summary', 'document', 'key points', 'main points',
  ],
  simple: [
    '뭐야', '뭔지', '정의', '뭐에요', '간단히', '짧게', '한줄로',
    'what is', 'define', 'briefly', 'short answer', 'quick',
  ],
};

// ── 카테고리별 우선 모델 목록 (첫 번째 사용 가능한 모델 선택) ────────────
// [2026-04-30 Tori 21102594 PR #5] 회사 권장 flagship 우선 — 가장 최신 안정 모델 먼저.
// 신규 모델이 registry에 추가되면 여기 첫 자리로 옮길 수 있음 (수동 또는 자동 갱신).
const ROUTE_MAP: Record<RouteCategory, string[]> = {
  coding:      ['claude-opus-4-7', 'claude-sonnet-4-6', 'gpt-5.5', 'gpt-5.4', 'gpt-4.1', 'gpt-4o'],
  reasoning:   ['o4-mini', 'claude-opus-4-7', 'gpt-5.5', 'gpt-5.4-pro', 'deepseek-reasoner', 'claude-sonnet-4-6', 'gpt-4o'],
  creative:    ['claude-opus-4-7', 'claude-sonnet-4-6', 'gpt-5.5', 'gpt-5.4', 'gpt-4o', 'gpt-4.1'],
  translation: ['gpt-5.4-mini', 'claude-haiku-4-5', 'gpt-4o-mini', 'gpt-4.1-mini', 'gemini-2.5-flash', 'claude-haiku-4-5-20251001'],
  vision:      ['claude-opus-4-7', 'gpt-5.5', 'gemini-3.1-pro', 'gemini-3-pro-preview', 'gpt-4o', 'claude-sonnet-4-6', 'gemini-2.5-pro'],
  image_gen:   ['gpt-image-2', 'gpt-image-1', 'dall-e-3', 'imagen-3', 'gemini-3.1-pro'],
  data:        ['gemini-3.1-pro', 'claude-opus-4-7', 'gpt-5.5', 'gemini-2.5-pro', 'gpt-4o', 'claude-sonnet-4-6'],
  simple:      ['gpt-5.4-mini', 'claude-haiku-4-5', 'gemini-2.5-flash', 'gpt-4o-mini', 'gpt-4.1-mini', 'claude-haiku-4-5-20251001'],
  long_doc:    ['claude-opus-4-7', 'gemini-3.1-pro', 'gpt-5.5', 'claude-sonnet-4-6', 'gemini-2.5-pro', 'gpt-4o'],
  // [2026-05-02 Roy] realtime_info — Gemini 2.5+ / 3.x 절대 우선 (Google grounding 자동).
  // 사용자 Gemini 키 없으면 OpenAI/Anthropic fallback (search_web 도구로 보강).
  realtime_info: ['gemini-3.1-pro', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gpt-5.5', 'claude-opus-4-7', 'gpt-4o'],
  general:     ['claude-opus-4-7', 'gpt-5.5', 'gpt-5.4', 'gpt-4o', 'claude-sonnet-4-6', 'gpt-4.1'],
};

/**
 * [2026-05-02 Roy] 카테고리별 우선 모델 lookup — chat-view에서 Auto 라우팅 시
 * 호출. 사용자 키 보유 + registry 등록된 모델 중 카테고리 우선순위 첫 번째 반환.
 * 못 찾으면 null (caller가 generic fallback chain 사용).
 */
export function getCategoryPreferredModels(category: RouteCategory): string[] {
  return ROUTE_MAP[category] ?? [];
}

// ── 카테고리 라벨 (UI 표시용) ────────────────────────────────────────────
export function getCategoryLabels(): Record<RouteCategory, string> {
  const isEn = getCurrentLanguage() === 'en';
  return {
    coding:      isEn ? '💻 Coding/Dev'        : '💻 코딩/개발',
    reasoning:   isEn ? '🧠 Reasoning'          : '🧠 추론/분석',
    creative:    isEn ? '✍️ Creative Writing'   : '✍️ 창작/글쓰기',
    translation: isEn ? '🌐 Translation'        : '🌐 번역',
    vision:      isEn ? '👁️ Image Analysis'    : '👁️ 이미지 분석',
    image_gen:   isEn ? '🎨 Image Generation'  : '🎨 이미지 생성',
    data:        isEn ? '📊 Data Analysis'      : '📊 데이터 분석',
    simple:      isEn ? '⚡ Quick Question'     : '⚡ 간단 질문',
    long_doc:    isEn ? '📄 Document Analysis'  : '📄 문서 분석',
    realtime_info: isEn ? '🌐 Realtime Info'    : '🌐 실시간 정보',
    general:     isEn ? '💬 General Chat'       : '💬 일반 대화',
  };
}
/** @deprecated Use getCategoryLabels() instead */
export const CATEGORY_LABELS = getCategoryLabels();

// ── 카테고리 감지 ─────────────────────────────────────────────────────────
export function detectCategory(query: string, hasImages: boolean): RouteCategory {
  if (hasImages) return 'vision';

  const q = query.toLowerCase();

  // 우선순위 순서로 체크 (image_gen 최우선 — 이미지 생성 요청은 명확하므로).
  // [2026-05-02 Roy] realtime_info를 image_gen 다음 우선순위에 — '오늘 환율'
  // '최근 뉴스' 같은 실시간 정보를 일반/data로 오인 안 하게 (Gemini grounding 활용).
  for (const cat of ['image_gen', 'realtime_info', 'translation', 'coding', 'data', 'reasoning', 'creative', 'long_doc', 'simple'] as const) {
    if (KW[cat].some((k) => {
      const kl = k.toLowerCase();
      // realtime_info의 일부 패턴은 정규식 (예: 'today.*news') — regex로 매칭, 아니면 includes.
      return /[.*]/.test(kl) ? new RegExp(kl).test(q) : q.includes(kl);
    })) return cat;
  }

  // 길이 기반 휴리스틱
  if (query.length > 500) return 'long_doc';
  if (query.length < 40) return 'simple';

  return 'general';
}

// ── 라우팅 결과 타입 ─────────────────────────────────────────────────────
export interface RouteResult {
  modelId: string;
  category: RouteCategory;
  label: string;
}

// ── 메인 라우팅 함수 ─────────────────────────────────────────────────────
export function routeToModel(
  query: string,
  hasImages: boolean,
  enabledModels: AIModel[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hasKey: (provider: any) => boolean,
): RouteResult {
  const category = detectCategory(query, hasImages);
  const preferred = ROUTE_MAP[category];
  const labels = getCategoryLabels();

  // 우선순위 모델 중 enabled + API key 보유한 첫 번째 선택
  for (const modelId of preferred) {
    const model = enabledModels.find((m) => m.id === modelId && m.enabled);
    if (model && hasKey(model.provider)) {
      return { modelId, category, label: labels[category] };
    }
  }

  // 폴백: enabled + API key 보유한 아무 모델
  const fallback = enabledModels.find((m) => m.enabled && hasKey(m.provider));
  return {
    modelId: fallback?.id ?? 'gpt-4o-mini',
    category,
    label: labels[category],
  };
}
