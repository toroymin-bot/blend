'use client';

// /design1/[lang]/ — Design variant 1 page client
// Independent clone of /[lang]/page-client.tsx for design comparison.
// Modify this file freely to test new design changes.

import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import { Language } from '@/lib/i18n';
import AppContent from '@/components/app-content';

const SUPPORTED_LANGS: Language[] = ['ko', 'en'];

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
      <AppContent />
    </div>
  );
}
