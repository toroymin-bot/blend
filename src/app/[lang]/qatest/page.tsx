// /ko/qatest, /en/qatest — QA 테스트 전용 페이지 (언어별)
// isQAPath()가 URL에 /qatest 포함 여부를 감지해 환경변수 API 키 자동 주입

import LangPageClient from '../page-client';

export function generateStaticParams() {
  return [{ lang: 'ko' }, { lang: 'en' }, { lang: 'ph' }];
}

export default async function LangQATestPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  return <LangPageClient lang={lang} />;
}
