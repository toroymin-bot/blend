// /design3/ko/qatest, /design3/en/qatest
// Design comparison variant 3 — independent clone of /{lang}/qatest
// Use this URL to test & compare new design changes without affecting the main app.
// isQAPath() detects /qatest in URL → auto-injects env API keys for QA testing.

import LangPageClient from '../page-client';

export function generateStaticParams() {
  return [{ lang: 'ko' }, { lang: 'en' }];
}

export default function Design3LangQATestPage({ params }: { params: { lang: string } }) {
  return <LangPageClient lang={params.lang} />;
}
