/**
 * providers-design1.ts
 * Design1 전용 PROVIDERS 배열 + API_GUIDE_STEPS_KEYS 공유 파일
 * settings-view-design1.tsx + onboarding-view-design1.tsx에서 공용 사용
 */

import { AIProvider } from '@/types';

export const API_GUIDE_STEPS_KEYS: Record<
  string,
  { emoji: string; titleKey: string; descKey: string }[]
> = {
  openai: [
    { emoji: '🌐', titleKey: 'settings.guide_visit_site',    descKey: 'settings.guide_openai_visit' },
    { emoji: '👤', titleKey: 'settings.guide_signup',         descKey: 'settings.guide_signup_email' },
    { emoji: '💳', titleKey: 'settings.guide_add_card',       descKey: 'settings.guide_openai_card' },
    { emoji: '🗂️', titleKey: 'settings.guide_api_keys_menu', descKey: 'settings.guide_api_keys_menu_desc' },
    { emoji: '➕', titleKey: 'settings.guide_create_key',     descKey: 'settings.guide_openai_create' },
    { emoji: '📋', titleKey: 'settings.guide_copy_key',       descKey: 'settings.guide_openai_copy' },
  ],
  anthropic: [
    { emoji: '🌐', titleKey: 'settings.guide_visit_site',    descKey: 'settings.guide_anthropic_visit' },
    { emoji: '👤', titleKey: 'settings.guide_signup',         descKey: 'settings.guide_signup_email' },
    { emoji: '💳', titleKey: 'settings.guide_add_card',       descKey: 'settings.guide_anthropic_card' },
    { emoji: '🗂️', titleKey: 'settings.guide_api_keys_menu', descKey: 'settings.guide_api_keys_menu_desc' },
    { emoji: '➕', titleKey: 'settings.guide_create_key',     descKey: 'settings.guide_anthropic_create' },
    { emoji: '📋', titleKey: 'settings.guide_copy_key',       descKey: 'settings.guide_anthropic_copy' },
  ],
  google: [
    { emoji: '🌐', titleKey: 'settings.guide_visit_site',      descKey: 'settings.guide_google_visit' },
    { emoji: '👤', titleKey: 'settings.guide_google_login',    descKey: 'settings.guide_google_login_desc' },
    { emoji: '🔑', titleKey: 'settings.guide_google_get_key', descKey: 'settings.guide_google_get_key_desc' },
    { emoji: '➕', titleKey: 'settings.guide_create_key',       descKey: 'settings.guide_google_create' },
    { emoji: '📋', titleKey: 'settings.guide_copy_key',         descKey: 'settings.guide_google_copy' },
    { emoji: '🎉', titleKey: 'settings.guide_free_tier',        descKey: 'settings.guide_free_tier_desc' },
  ],
  deepseek: [
    { emoji: '🌐', titleKey: 'settings.guide_visit_site',    descKey: 'settings.guide_deepseek_visit' },
    { emoji: '👤', titleKey: 'settings.guide_signup',         descKey: 'settings.guide_signup_email' },
    { emoji: '💳', titleKey: 'settings.guide_topup',          descKey: 'settings.guide_deepseek_topup' },
    { emoji: '🗂️', titleKey: 'settings.guide_api_keys_menu', descKey: 'settings.guide_api_keys_menu_desc' },
    { emoji: '➕', titleKey: 'settings.guide_create_key',     descKey: 'settings.guide_deepseek_create' },
    { emoji: '📋', titleKey: 'settings.guide_copy_key',       descKey: 'settings.guide_openai_copy' },
  ],
  groq: [
    { emoji: '🌐', titleKey: 'settings.guide_visit_site',    descKey: 'settings.guide_groq_visit' },
    { emoji: '👤', titleKey: 'settings.guide_signup',         descKey: 'settings.guide_groq_signup' },
    { emoji: '🗂️', titleKey: 'settings.guide_api_keys_menu', descKey: 'settings.guide_api_keys_menu_desc' },
    { emoji: '➕', titleKey: 'settings.guide_create_key',     descKey: 'settings.guide_groq_create' },
    { emoji: '📋', titleKey: 'settings.guide_copy_key',       descKey: 'settings.guide_groq_copy' },
    { emoji: '🎉', titleKey: 'settings.guide_free_tier',      descKey: 'settings.guide_free_tier_desc' },
  ],
};

export const D1_PROVIDERS: {
  id: AIProvider;
  name: string;
  color: string;
  placeholder: string;
  models: string;
  keyUrl: string;
  noteKey?: string;
}[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    color: '#10a37f',
    placeholder: 'sk-...',
    models: 'GPT-4o, GPT-4.1, o3, o4-mini',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    color: '#d4a574',
    placeholder: 'sk-ant-...',
    models: 'Claude Opus 4, Sonnet 4, Haiku 4.5',
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'google',
    name: 'Google Gemini',
    color: '#4285f4',
    placeholder: 'AIza...',
    models: 'Gemini 2.0 Flash, Gemini 2.5 Pro',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    noteKey: 'common.free_tier',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    color: '#4D6BFE',
    placeholder: 'sk-...',
    models: 'DeepSeek-V3, DeepSeek-R1',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    noteKey: 'common.ultra_cheap',
  },
  {
    id: 'groq',
    name: 'Groq',
    color: '#F55036',
    placeholder: 'gsk_...',
    models: 'Llama 3.3 70B, Mixtral 8x7B',
    keyUrl: 'https://console.groq.com/keys',
    noteKey: 'common.free_fast',
  },
];
