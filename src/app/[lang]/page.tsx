// [lang]/page.tsx — Server Component wrapper
// generateStaticParams must be in a server component (no 'use client').
// The actual rendering is delegated to a client component.

import LangPageClient from './page-client';

export function generateStaticParams() {
  return [{ lang: 'ko' }, { lang: 'en' }, { lang: 'ph' }];
}

export default async function LangPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  return <LangPageClient lang={lang} />;
}
