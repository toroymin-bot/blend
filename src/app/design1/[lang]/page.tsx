// /design1/ko/ and /design1/en/ — Design1 main entry point
// Server component wrapper for LangPageClient (page-client.tsx)

import LangPageClient from './page-client';

export function generateStaticParams() {
  return [{ lang: 'ko' }, { lang: 'en' }];
}

export default async function Design1LangPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  return <LangPageClient lang={lang} />;
}
