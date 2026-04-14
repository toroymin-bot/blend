'use client';

// Root page — redirects to the localized route (/ko or /en).
// The redirect is fully client-side, compatible with output: 'export'.

import { useEffect } from 'react';
import { getCurrentLanguage } from '@/lib/i18n';

export default function Home() {
  useEffect(() => {
    const lang = getCurrentLanguage();
    window.location.replace(`/${lang}/`);
  }, []);

  // Render nothing while redirect happens
  return null;
}
