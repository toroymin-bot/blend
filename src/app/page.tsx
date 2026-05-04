'use client';

// Root page — redirects to the localized route (/ko, /en, or /ph).
// The redirect is fully client-side, compatible with output: 'export'.

import { useEffect } from 'react';
import { getCurrentLanguage } from '@/lib/i18n';

export default function Home() {
  useEffect(() => {
    // [2026-04-26 Tori 16220538 §2] design1 트랙으로 통일.
    // [2026-05-04 #17] 첫 방문 PH 사용자 — country cache 없으면 짧은 timeout
    // 으로 ipapi.co 조회. PH면 /design1/ph로, 그 외 fallback 체인. 800ms 안에
    // 응답 안 오면 그냥 default 진행 (UX 지연 차단).
    const knownLang = getCurrentLanguage();
    const hasCountryCache = (() => {
      try { return !!localStorage.getItem('blend:country'); } catch { return false; }
    })();
    const hasUserChoice = (() => {
      try {
        const s = localStorage.getItem('blend:settings');
        if (!s) return false;
        const lang = JSON.parse(s)?.settings?.language;
        return lang === 'ko' || lang === 'en' || lang === 'ph';
      } catch { return false; }
    })();

    if (hasUserChoice || hasCountryCache) {
      window.location.replace(`/design1/${knownLang}/`);
      return;
    }

    // Fast PH detection for fresh visitors. AbortController gives us 800ms cap.
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 800);
    fetch('https://ipapi.co/country/', { signal: ac.signal })
      .then((r) => r.text())
      .then((code) => {
        clearTimeout(timer);
        const c = code.trim().toUpperCase();
        try { localStorage.setItem('blend:country', JSON.stringify({ value: c, ts: Date.now() })); } catch {}
        const target = c === 'PH' ? 'ph' : knownLang;
        window.location.replace(`/design1/${target}/`);
      })
      .catch(() => {
        clearTimeout(timer);
        window.location.replace(`/design1/${knownLang}/`);
      });
  }, []);

  // Render nothing while redirect happens
  return null;
}
