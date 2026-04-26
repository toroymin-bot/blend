'use client';

// [lang]/page-client.tsx — Client component for localized routes
// Sets language from URL segment, then renders the main app.
//
// [2026-04-26 Tori 16220538 §2] design1 트랙으로 client-side redirect.
// next.config 'output: export' 모드라 middleware 작동 X. useEffect로 처리.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Language } from '@/lib/i18n';

const SUPPORTED_LANGS: Language[] = ['ko', 'en'];

interface Props {
  lang: string;
}

export default function LangPageClient({ lang }: Props) {
  const router = useRouter();
  const typedLang = SUPPORTED_LANGS.includes(lang as Language) ? (lang as Language) : 'ko';

  useEffect(() => {
    // 옛날 URL → design1 URL로 즉시 redirect (히스토리 대체)
    router.replace(`/design1/${typedLang}`);
  }, [router, typedLang]);

  // redirect 직전 깜빡임 방지를 위한 빈 화면
  return null;
}
