// Share Link 읽기 전용 페이지 (Tori 16384367 §4.3)
//
// /:lang/share?t=<token> — token은 base64 URL-safe 페이로드 (pako gzip).
// next.config.ts output: 'export' 호환 위해 query string 사용 (dynamic path 회피).

import SharePageClient from './client';

export function generateStaticParams() {
  return [{ lang: 'ko' }, { lang: 'en' }];
}

export default function SharePage() {
  return <SharePageClient />;
}
