// /design2/ko/ and /design2/en/ — Design2 main entry point
import LangPageClient from './page-client';

export function generateStaticParams() {
  return [{ lang: 'ko' }, { lang: 'en' }, { lang: 'ph' }];
}

export default async function Design2LangPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  return <LangPageClient lang={lang} />;
}
