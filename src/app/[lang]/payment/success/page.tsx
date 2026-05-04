// [2026-04-18] Toss Payments success redirect page
// Toss redirects here with ?paymentKey=&orderId=&amount=
// [2026-04-26] F-1 — 백엔드 confirm + 라이센스 발급은 별도 Cloudflare Worker(후속) 책임

import PaymentSuccessClient from './client';

export function generateStaticParams() {
  return [{ lang: 'ko' }, { lang: 'en' }, { lang: 'ph' }];
}

export default function PaymentSuccessPage() {
  return <PaymentSuccessClient />;
}
