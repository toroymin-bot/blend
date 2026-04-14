// /ko/qatest, /en/qatest — QA 테스트 전용 페이지 (언어별)
// isQAPath()가 URL에 /qatest 포함 여부를 감지해 환경변수 API 키 자동 주입

import LangPageClient from '../page-client';

export function generateStaticParams() {
  return [{ lang: 'ko' }, { lang: 'en' }];
}

export default function LangQATestPage({ params }: { params: { lang: string } }) {
  return <LangPageClient lang={params.lang} />;
}
