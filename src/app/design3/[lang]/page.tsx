// /design3/ko/ and /design3/en/ — Design3 main entry point
import LangPageClient from './page-client';

export function generateStaticParams() {
  return [{ lang: 'ko' }, { lang: 'en' }, { lang: 'ph' }];
}

export default async function Design3LangPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  return <LangPageClient lang={lang} />;
}
