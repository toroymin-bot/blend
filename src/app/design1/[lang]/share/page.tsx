// [2026-04-26 Tori 16220538 §2] design1 prefix 통일 — share 라우트도 design1 트랙으로.
// 컴포넌트는 기존 /[lang]/share/client.tsx를 재사용 (단일 source of truth).

import SharePageClient from '@/app/[lang]/share/client';

export function generateStaticParams() {
  return [{ lang: 'ko' }, { lang: 'en' }];
}

export default function SharePage() {
  return <SharePageClient />;
}
