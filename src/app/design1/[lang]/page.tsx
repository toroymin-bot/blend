// /design1/ko/ and /design1/en/ — Design1 main entry point
// Server component wrapper for LangPageClient (page-client.tsx)

import { notFound } from 'next/navigation';
import LangPageClient from './page-client';

const SUPPORTED_LANGS = ['ko', 'en'] as const;
type SupportedLang = (typeof SUPPORTED_LANGS)[number];

export function generateStaticParams() {
  return SUPPORTED_LANGS.map((lang) => ({ lang }));
}

export const dynamicParams = false;

export default async function Design1LangPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!SUPPORTED_LANGS.includes(lang as SupportedLang)) {
    notFound();
  }
  return <LangPageClient lang={lang as SupportedLang} />;
}
