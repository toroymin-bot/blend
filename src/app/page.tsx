'use client';

// Root page — redirects to the localized route (/ko or /en).
// The redirect is fully client-side, compatible with output: 'export'.

import { useEffect } from 'react';
import { getCurrentLanguage } from '@/lib/i18n';

export default function Home() {
  useEffect(() => {
    // [2026-04-26 Tori 16220538 §2] design1 트랙으로 통일.
    const lang = getCurrentLanguage();
    window.location.replace(`/design1/${lang}/`);
  }, []);

  // Render nothing while redirect happens
  return null;
}
