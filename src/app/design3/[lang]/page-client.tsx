'use client';

// /design3/[lang]/ — Design variant 3 page client
// AppContentDesign3을 사용 — 원본 AppContent와 완전 독립.
// design3 전용 뷰를 바꾸려면 app-content-design3.tsx의 import만 교체하면 됨.

import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import { Language } from '@/lib/i18n';
import AppContentDesign3 from '@/components/app-content-design3';

const SUPPORTED_LANGS: Language[] = ['ko', 'en', 'ph'];

interface Props {
  lang: string;
}

export default function LangPageClient({ lang }: Props) {
  const { settings, updateSettings, loadFromStorage } = useSettingsStore();

  const typedLang = SUPPORTED_LANGS.includes(lang as Language) ? (lang as Language) : 'ko';

  useEffect(() => {
    loadFromStorage();
  }, []);

  useEffect(() => {
    if (settings.language !== typedLang) {
      updateSettings({ language: typedLang });
    }
  }, [lang, settings.language]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <AppContentDesign3 />
    </div>
  );
}
