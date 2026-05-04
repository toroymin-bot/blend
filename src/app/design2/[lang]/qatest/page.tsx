// /design2/ko/qatest, /design2/en/qatest
// Design comparison variant 2 — independent clone of /{lang}/qatest
// Use this URL to test & compare new design changes without affecting the main app.
// isQAPath() detects /qatest in URL → auto-injects env API keys for QA testing.

import LangPageClient from '../page-client';

export function generateStaticParams() {
  return [{ lang: 'ko' }, { lang: 'en' }, { lang: 'ph' }];
}

export default async function Design2LangQATestPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  return <LangPageClient lang={lang} />;
}
