/**
 * Model auto-classification — Tori 21102594 §3.1 + §2.
 *
 * 7개 사용자 친화적 분류:
 *   - free          : 사용자 키 없이 체험 가능 (trial tier 또는 무료 provider)
 *   - quick_reply   : 빠른 응답 (haiku/flash/mini/nano/fast tier)
 *   - deep_thinking : 추론·심층 (o[0-9], opus, pro, reasoning tier, flagship)
 *   - long_context  : 컨텍스트 200K 이상
 *   - see_images    : 비전 가능
 *   - draw_images   : 이미지 생성 (id pattern: dall-e, gpt-image, imagen, flux, sdxl)
 *   - voice         : 음성 (audio, realtime, tts, whisper, transcribe)
 *
 * 입력: 기존 AvailableModel 그대로 사용. 추가 메타데이터 필요 없음.
 * 출력: 모델이 속하는 분류 배열 (다중 분류 가능 — 한 모델이 여러 칩에 노출).
 */

import type { AvailableModel } from '@/data/available-models';

export type ModelCategory =
  | 'free'
  | 'quick_reply'
  | 'deep_thinking'
  | 'long_context'
  | 'see_images'
  | 'draw_images'
  | 'voice';

export const ALL_CATEGORIES: ModelCategory[] = [
  'free',
  'quick_reply',
  'deep_thinking',
  'long_context',
  'see_images',
  'draw_images',
  'voice',
];

const REGEX_QUICK   = /(haiku|flash|mini|nano|turbo)/i;
const REGEX_DEEP    = /(\bo\d|opus|pro\b|reasoning|sonnet)/i;
const REGEX_DRAW    = /(dall-e|gpt-image|imagen|flux|sdxl|stable-diffusion)/i;
const REGEX_VOICE   = /(audio|realtime|tts|whisper|transcribe|speech)/i;

const LONG_CONTEXT_THRESHOLD = 200_000;

/**
 * 모델 1개 → 해당 분류 배열 (0~N개).
 *
 * 우선순위 — 한 모델이 여러 분류에 속할 수 있음:
 *  - draw_images / voice 는 modality 전용 (해당하면 그것만 표시 권장)
 *  - free는 가격 분류 — 다른 분류와 공존
 *  - quick_reply / deep_thinking / long_context / see_images 는 능력 — 공존 OK
 */
export function classifyModel(m: AvailableModel): ModelCategory[] {
  const id = (m.id || '').toLowerCase();
  const tags: ModelCategory[] = [];

  // 1) 그리기 — id에 image-gen 패턴
  if (REGEX_DRAW.test(id)) tags.push('draw_images');

  // 2) 음성 — id에 audio/realtime/tts/whisper
  if (REGEX_VOICE.test(id)) tags.push('voice');

  // 3) 무료 — trial tier 또는 무료 provider (groq)
  if (m.tier === 'trial' || m.provider === 'groq') tags.push('free');

  // 4) 빠른 답변 — fast tier 또는 id 패턴
  if (m.tier === 'fast' || REGEX_QUICK.test(id)) {
    if (!tags.includes('voice') && !tags.includes('draw_images')) {
      tags.push('quick_reply');
    }
  }

  // 5) 깊이 생각 — reasoning/flagship tier 또는 id 패턴
  if (m.tier === 'reasoning' || m.tier === 'flagship' || REGEX_DEEP.test(id)) {
    // 단, mini/nano/flash/haiku 같은 빠른 변종은 deep 에서 제외
    if (!REGEX_QUICK.test(id) && !tags.includes('voice') && !tags.includes('draw_images')) {
      tags.push('deep_thinking');
    }
  }

  // 6) 긴 글 처리 — 200K 컨텍스트
  if ((m.contextWindow ?? 0) >= LONG_CONTEXT_THRESHOLD) {
    tags.push('long_context');
  }

  // 7) 이미지 보기 — 비전 가능
  if (m.supportsVision && !tags.includes('draw_images')) {
    tags.push('see_images');
  }

  return tags;
}

/**
 * 모델이 특정 분류에 속하는지 (필터 칩 매칭용).
 */
export function modelMatchesCategory(m: AvailableModel, cat: ModelCategory | 'all'): boolean {
  if (cat === 'all') return true;
  return classifyModel(m).includes(cat);
}

/**
 * 분류별 모델 수 — 칩 옆에 카운트 뱃지 노출용.
 */
export function countByCategory(models: AvailableModel[]): Record<ModelCategory, number> {
  const counts: Record<ModelCategory, number> = {
    free: 0, quick_reply: 0, deep_thinking: 0, long_context: 0,
    see_images: 0, draw_images: 0, voice: 0,
  };
  for (const m of models) {
    for (const c of classifyModel(m)) counts[c] += 1;
  }
  return counts;
}
