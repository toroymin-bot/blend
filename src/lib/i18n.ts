// Blend - i18n (Internationalization) Hook
// Client-side only — compatible with output: 'export' static builds
// Language preference is stored in localStorage via settings-store

'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useSettingsStore } from '@/stores/settings-store';
import ko from '@/locales/ko.json';
import en from '@/locales/en.json';
import ph from '@/locales/ph.json';

// [2026-05-04 Roy #17] Filipino market — URL `/ph`, Tagalog (with English
// fallback for un-translated keys via JSON merge at build time). 'ph' is a
// market code (matches /ph URL) not a strict ISO 639 lang tag.
export type Language = 'ko' | 'en' | 'ph';

type NestedStringRecord = { [key: string]: string | NestedStringRecord };
const translations: Record<Language, NestedStringRecord> = { ko, en, ph };

/**
 * Resolve a dot-notation key like "settings.title" from the translation object.
 * Returns the key string itself if not found (fallback).
 */
function resolve(obj: NestedStringRecord, key: string): string {
  const parts = key.split('.');
  let cur: string | NestedStringRecord = obj;
  for (const part of parts) {
    if (typeof cur !== 'object' || cur === null) return key;
    cur = (cur as NestedStringRecord)[part];
  }
  return typeof cur === 'string' ? cur : key;
}

/**
 * Simple template interpolation: replaces {{variable}} placeholders.
 * e.g. t('sidebar.messages_count', { count: 5 }) → "5개 메시지"
 */
function interpolate(str: string, params?: Record<string, string | number>): string {
  if (!params) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) =>
    params[k] !== undefined ? String(params[k]) : `{{${k}}}`
  );
}

export interface UseTranslationResult {
  t: (key: string, params?: Record<string, string | number>) => string;
  lang: Language;
  setLang: (lang: Language) => void;
}

/**
 * Derive language from the URL path (/en/... → 'en', /ko/... → 'ko').
 * Returns null if the path doesn't start with a known lang segment.
 * Only works in browser environments.
 */
function getLangFromPath(): Language | null {
  if (typeof window === 'undefined') return null;
  const segs = window.location.pathname.split('/').filter(Boolean);
  // /(ko|en)/...           → segs[0]
  // /design1/(ko|en)/...   → segs[1]
  for (const s of segs.slice(0, 2)) {
    if (s === 'en') return 'en';
    if (s === 'ko') return 'ko';
    if (s === 'ph') return 'ph';
  }
  return null;
}

/**
 * Primary hook for translations.
 * Usage:
 *   const { t, lang, setLang } = useTranslation();
 *   <h1>{t('settings.title')}</h1>
 */
export function useTranslation(): UseTranslationResult {
  const params = useParams();
  const { settings, updateSettings } = useSettingsStore();
  // Route params take priority — works during both SSR and client hydration.
  const urlLang = params?.lang as string | undefined;
  const lang: Language =
    urlLang === 'en' ? 'en' : urlLang === 'ko' ? 'ko' : urlLang === 'ph' ? 'ph' :
    (settings.language as Language) ?? 'ko';

  const dict = useMemo(() => translations[lang] ?? translations.ko, [lang]);

  const t = useMemo(
    () =>
      (key: string, params?: Record<string, string | number>): string => {
        const raw = resolve(dict, key);
        return interpolate(raw, params);
      },
    [dict]
  );

  const setLang = (newLang: Language) => {
    updateSettings({ language: newLang });
  };

  return { t, lang, setLang };
}

/**
 * Standalone helper for getting the current language without React hooks.
 * URL path takes priority (same logic as getLangFromPath), then falls back to
 * localStorage, then country geo-cache (PH → 'ph' for first-visit Filipinos).
 */
export function getCurrentLanguage(): Language {
  if (typeof window === 'undefined') return 'ko';
  // URL takes priority — same rule as getLangFromPath()
  const segs = window.location.pathname.split('/').filter(Boolean);
  for (const s of segs.slice(0, 2)) {
    if (s === 'en') return 'en';
    if (s === 'ko') return 'ko';
    if (s === 'ph') return 'ph';
  }
  // Fallback 1: explicit user choice in localStorage
  try {
    const stored = localStorage.getItem('blend:settings');
    if (stored) {
      const data = JSON.parse(stored);
      if (data.settings?.language === 'en') return 'en';
      if (data.settings?.language === 'ph') return 'ph';
      if (data.settings?.language === 'ko') return 'ko';
    }
  } catch {}
  // Fallback 2: country geo-cache (set by useCountry hook). PH → ph default.
  try {
    const cached = localStorage.getItem('blend:country');
    if (cached) {
      const { value } = JSON.parse(cached);
      if (value === 'PH') return 'ph';
    }
  } catch {}
  return 'ko';
}

/**
 * Inline 3-way branching helper for design1 components that don't use t().
 * Usage:
 *   pickLang(lang, '한국어', 'English', 'Filipino')
 *   pickLang(lang, '저장됨', 'Saved', 'Naka-save')
 * If `ph` is omitted, falls back to `en` (Filipino IT/Taglish convention —
 * many tech terms remain English).
 */
export function pickLang<T>(lang: Language | string | undefined, ko: T, en: T, ph?: T): T {
  if (lang === 'ko') return ko;
  if (lang === 'ph') return ph !== undefined ? ph : en;
  return en;
}
