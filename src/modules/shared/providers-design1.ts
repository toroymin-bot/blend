/**
 * providers-design1.ts
 * Design1 전용 PROVIDERS 배열 + API_GUIDE_STEPS_KEYS 공유 파일
 * settings-view-design1.tsx + onboarding-view-design1.tsx에서 공용 사용
 *
 * [2026-04-26] 안내 모달 통일: emoji 제거(노이즈 감소) + cost indicator 추가
 */

import { AIProvider } from '@/types';
import { getFeaturedModels } from '@/data/available-models';

export type ProviderCost = 'free' | 'trial' | 'paid';

export const API_GUIDE_STEPS_KEYS: Record<
  string,
  { titleKey: string; descKey: string }[]
> = {
  openai: [
    { titleKey: 'settings.guide_visit_site',    descKey: 'settings.guide_openai_visit' },
    { titleKey: 'settings.guide_signup',         descKey: 'settings.guide_signup_email' },
    { titleKey: 'settings.guide_add_card',       descKey: 'settings.guide_openai_card' },
    { titleKey: 'settings.guide_api_keys_menu',  descKey: 'settings.guide_api_keys_menu_desc' },
    { titleKey: 'settings.guide_create_key',     descKey: 'settings.guide_openai_create' },
    { titleKey: 'settings.guide_copy_key',       descKey: 'settings.guide_openai_copy' },
  ],
  anthropic: [
    { titleKey: 'settings.guide_visit_site',    descKey: 'settings.guide_anthropic_visit' },
    { titleKey: 'settings.guide_signup',         descKey: 'settings.guide_signup_email' },
    { titleKey: 'settings.guide_add_card',       descKey: 'settings.guide_anthropic_card' },
    { titleKey: 'settings.guide_api_keys_menu',  descKey: 'settings.guide_api_keys_menu_desc' },
    { titleKey: 'settings.guide_create_key',     descKey: 'settings.guide_anthropic_create' },
    { titleKey: 'settings.guide_copy_key',       descKey: 'settings.guide_anthropic_copy' },
  ],
  google: [
    { titleKey: 'settings.guide_visit_site',     descKey: 'settings.guide_google_visit' },
    { titleKey: 'settings.guide_google_login',   descKey: 'settings.guide_google_login_desc' },
    { titleKey: 'settings.guide_google_get_key', descKey: 'settings.guide_google_get_key_desc' },
    { titleKey: 'settings.guide_create_key',     descKey: 'settings.guide_google_create' },
    { titleKey: 'settings.guide_copy_key',       descKey: 'settings.guide_google_copy' },
    { titleKey: 'settings.guide_free_tier',      descKey: 'settings.guide_free_tier_desc' },
  ],
  deepseek: [
    { titleKey: 'settings.guide_visit_site',    descKey: 'settings.guide_deepseek_visit' },
    { titleKey: 'settings.guide_signup',         descKey: 'settings.guide_signup_email' },
    { titleKey: 'settings.guide_topup',          descKey: 'settings.guide_deepseek_topup' },
    { titleKey: 'settings.guide_api_keys_menu',  descKey: 'settings.guide_api_keys_menu_desc' },
    { titleKey: 'settings.guide_create_key',     descKey: 'settings.guide_deepseek_create' },
    { titleKey: 'settings.guide_copy_key',       descKey: 'settings.guide_openai_copy' },
  ],
  groq: [
    { titleKey: 'settings.guide_visit_site',    descKey: 'settings.guide_groq_visit' },
    { titleKey: 'settings.guide_signup',         descKey: 'settings.guide_groq_signup' },
    { titleKey: 'settings.guide_api_keys_menu',  descKey: 'settings.guide_api_keys_menu_desc' },
    { titleKey: 'settings.guide_create_key',     descKey: 'settings.guide_groq_create' },
    { titleKey: 'settings.guide_copy_key',       descKey: 'settings.guide_groq_copy' },
    { titleKey: 'settings.guide_free_tier',      descKey: 'settings.guide_free_tier_desc' },
  ],
};

// [2026-05-02 Roy] models 필드를 정적 string에서 동적 함수로 — registry
// (available-models)에서 provider별 featured 모델을 도출. 3시간 cron이 새 모델
// 등록하면 settings/onboarding 라벨도 자동 동기화. 이전엔 'GPT-4o, GPT-4.1' 같이
// 하드코딩돼 실제 등록된 GPT-5.4 / Claude Opus 4.7과 안 맞았음.
//
// fallback static label은 유지 — registry 비어있을 때(빌드 직후) 표시.

const STATIC_FALLBACK_LABEL: Record<AIProvider, string> = {
  openai:    'GPT-5, GPT-4o',
  anthropic: 'Claude Opus, Sonnet, Haiku',
  google:    'Gemini Pro, Flash',
  deepseek:  'DeepSeek Chat, Reasoner',
  groq:      'Llama 3.3 70B',
  custom:    'Custom endpoint',
};

/**
 * provider별 featured 모델 라벨 — registry-derived.
 * 예: 'OpenAI' → 'GPT-5.4, GPT-5.4 mini, GPT-5.2'
 *     'Anthropic' → 'Claude Opus 4.7, Sonnet 4.6, Haiku 4.5'
 */
export function getProviderModelsLabel(providerId: AIProvider): string {
  try {
    const featured = getFeaturedModels();
    const ofProvider = featured
      .filter((m) => m.provider === providerId)
      .map((m) => m.displayName);
    if (ofProvider.length === 0) return STATIC_FALLBACK_LABEL[providerId];
    return ofProvider.join(', ');
  } catch {
    return STATIC_FALLBACK_LABEL[providerId];
  }
}

export const D1_PROVIDERS: {
  id: AIProvider;
  name: string;
  color: string;
  placeholder: string;
  /** @deprecated 정적 fallback. 실제 표시는 getProviderModelsLabel(id) 사용. */
  models: string;
  keyUrl: string;
  noteKey?: string;
  cost: ProviderCost;
}[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    color: '#10a37f',
    placeholder: 'sk-...',
    models: STATIC_FALLBACK_LABEL.openai,
    keyUrl: 'https://platform.openai.com/api-keys',
    cost: 'trial',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    color: '#d4a574',
    placeholder: 'sk-ant-...',
    models: STATIC_FALLBACK_LABEL.anthropic,
    keyUrl: 'https://console.anthropic.com/settings/keys',
    cost: 'trial',
  },
  {
    id: 'google',
    name: 'Google Gemini',
    color: '#4285f4',
    placeholder: 'AIza...',
    models: STATIC_FALLBACK_LABEL.google,
    keyUrl: 'https://aistudio.google.com/app/apikey',
    noteKey: 'common.free_tier',
    cost: 'free',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    color: '#4D6BFE',
    placeholder: 'sk-...',
    models: STATIC_FALLBACK_LABEL.deepseek,
    keyUrl: 'https://platform.deepseek.com/api_keys',
    noteKey: 'common.ultra_cheap',
    cost: 'paid',
  },
  {
    id: 'groq',
    name: 'Groq',
    color: '#F55036',
    placeholder: 'gsk_...',
    models: STATIC_FALLBACK_LABEL.groq,
    keyUrl: 'https://console.groq.com/keys',
    noteKey: 'common.free_fast',
    cost: 'free',
  },
];
