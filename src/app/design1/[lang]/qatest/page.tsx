// /design1/ko/qatest, /design1/en/qatest
// Design comparison variant 1 — independent clone of /{lang}/qatest
// Use this URL to test & compare new design changes without affecting the main app.
// isQAPath() detects /qatest in URL → auto-injects env API keys for QA testing.

import LangPageClient from '../page-client';

export function generateStaticParams() {
  return [{ lang: 'ko' }, { lang: 'en' }, { lang: 'ph' }];
}

export default async function Design1LangQATestPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  return <LangPageClient lang={lang} />;
}
