// [lang]/page.tsx — Server Component wrapper
// generateStaticParams must be in a server component (no 'use client').
// The actual rendering is delegated to a client component.

import LangPageClient from './page-client';

export function generateStaticParams() {
  return [{ lang: 'ko' }, { lang: 'en' }];
}

export default function LangPage({ params }: { params: { lang: string } }) {
  return <LangPageClient lang={params.lang} />;
}
