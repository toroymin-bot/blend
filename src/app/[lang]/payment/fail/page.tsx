// [2026-04-18] Toss Payments fail redirect page
// Toss redirects here with ?code=&message=&orderId=

import PaymentFailClient from './client';

export function generateStaticParams() {
  return [{ lang: 'ko' }, { lang: 'en' }, { lang: 'ph' }];
}

export default function PaymentFailPage() {
  return <PaymentFailClient />;
}
