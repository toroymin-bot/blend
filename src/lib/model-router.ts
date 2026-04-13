// Blend - Model Router
// 질문 내용을 분석해서 최적 AI 모델을 자동 선택하는 라우팅 엔진

import { AIModel } from '@/types';

export type RouteCategory =
  | 'coding'       // 코딩/개발/디버깅
  | 'reasoning'    // 추론/수학/논리/심층분석
  | 'creative'     // 창작/글쓰기/카피라이팅
  | 'translation'  // 번역
  | 'vision'       // 이미지 분석 (이미지 첨부 시)
  | 'data'         // 데이터 분석/SQL/통계
  | 'simple'       // 짧은 질문/간단한 답변
  | 'long_doc'     // 긴 문서 분석/요약
  | 'general';     // 일반 대화

// ── 카테고리별 키워드 (한국어 + 영어) ─────────────────────────────────────
const KW: Record<Exclude<RouteCategory, 'vision' | 'general'>, string[]> = {
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
const ROUTE_MAP: Record<RouteCategory, string[]> = {
  coding:      ['claude-sonnet-4-6', 'gpt-4.1', 'gpt-4o'],
  reasoning:   ['deepseek-reasoner', 'claude-sonnet-4-6', 'gpt-4o'],
  creative:    ['claude-sonnet-4-6', 'gpt-4o', 'gpt-4.1'],
  translation: ['gpt-4o-mini', 'gpt-4.1-mini', 'claude-haiku-4-5-20251001'],
  vision:      ['gpt-4o', 'claude-sonnet-4-6', 'gemini-2.5-pro'],
  data:        ['gemini-2.5-pro', 'gpt-4o', 'claude-sonnet-4-6'],
  simple:      ['gpt-4o-mini', 'gpt-4.1-mini', 'claude-haiku-4-5-20251001'],
  long_doc:    ['claude-sonnet-4-6', 'gemini-2.5-pro', 'gpt-4o'],
  general:     ['gpt-4o', 'claude-sonnet-4-6', 'gpt-4.1'],
};

// ── 카테고리 라벨 (UI 표시용) ────────────────────────────────────────────
export const CATEGORY_LABELS: Record<RouteCategory, string> = {
  coding:      '💻 코딩/개발',
  reasoning:   '🧠 추론/분석',
  creative:    '✍️ 창작/글쓰기',
  translation: '🌐 번역',
  vision:      '👁️ 이미지 분석',
  data:        '📊 데이터 분석',
  simple:      '⚡ 간단 질문',
  long_doc:    '📄 문서 분석',
  general:     '💬 일반 대화',
};

// ── 카테고리 감지 ─────────────────────────────────────────────────────────
export function detectCategory(query: string, hasImages: boolean): RouteCategory {
  if (hasImages) return 'vision';

  const q = query.toLowerCase();

  // 우선순위 순서로 체크
  for (const cat of ['translation', 'coding', 'data', 'reasoning', 'creative', 'long_doc', 'simple'] as const) {
    if (KW[cat].some((k) => q.includes(k.toLowerCase()))) return cat;
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

  // 우선순위 모델 중 enabled + API key 보유한 첫 번째 선택
  for (const modelId of preferred) {
    const model = enabledModels.find((m) => m.id === modelId && m.enabled);
    if (model && hasKey(model.provider)) {
      return { modelId, category, label: CATEGORY_LABELS[category] };
    }
  }

  // 폴백: enabled + API key 보유한 아무 모델
  const fallback = enabledModels.find((m) => m.enabled && hasKey(m.provider));
  return {
    modelId: fallback?.id ?? 'gpt-4o-mini',
    category,
    label: CATEGORY_LABELS[category],
  };
}
