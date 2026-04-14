'use client';

// [lang]/page-client.tsx — Client component for localized routes
// Sets language from URL segment, then renders the main app.

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

  useEffect(() => {
    // Ensure settings are loaded from localStorage first
    loadFromStorage();
  }, []);

  useEffect(() => {
    const typedLang = lang as Language;
    if (SUPPORTED_LANGS.includes(typedLang) && settings.language !== typedLang) {
      updateSettings({ language: typedLang });
    }
  }, [lang, settings.language]);

  // [2026-04-14] body가 flex flex-col이므로 h-dvh AppContent가 flex item이 됨.
  // flex-1과 min-h-0을 추가해 전체 높이를 올바르게 채우도록 함.
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <AppContent />
    </div>
  );
}
