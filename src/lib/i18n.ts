// Blend - i18n (Internationalization) Hook
// Client-side only — compatible with output: 'export' static builds
// Language preference is stored in localStorage via settings-store

'use client';

import { useMemo } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import ko from '@/locales/ko.json';
import en from '@/locales/en.json';

export type Language = 'ko' | 'en';

type NestedStringRecord = { [key: string]: string | NestedStringRecord };
const translations: Record<Language, NestedStringRecord> = { ko, en };

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
  const seg = window.location.pathname.split('/')[1];
  if (seg === 'en') return 'en';
  if (seg === 'ko') return 'ko';
  return null;
}

/**
 * Primary hook for translations.
 * Usage:
 *   const { t, lang, setLang } = useTranslation();
 *   <h1>{t('settings.title')}</h1>
 */
export function useTranslation(): UseTranslationResult {
  const { settings, updateSettings } = useSettingsStore();
  // URL path takes priority over stored setting so /en/ always renders in English
  // even before the useEffect in page-client.tsx fires.
  const lang: Language = getLangFromPath() ?? (settings.language as Language) ?? 'ko';

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
 * URL path takes priority (same logic as getLangFromPath), then falls back to localStorage.
 */
export function getCurrentLanguage(): Language {
  if (typeof window === 'undefined') return 'ko';
  // URL takes priority — same rule as getLangFromPath()
  const seg = window.location.pathname.split('/')[1];
  if (seg === 'en') return 'en';
  if (seg === 'ko') return 'ko';
  // Fallback: read from localStorage
  try {
    const stored = localStorage.getItem('blend:settings');
    if (stored) {
      const data = JSON.parse(stored);
      if (data.settings?.language === 'en') return 'en';
    }
  } catch {}
  return 'ko';
}
