// [2026-04-18] Toss Payments v2 client-side integration (Korea)
// Requires: NEXT_PUBLIC_TOSS_CLIENT_KEY env var (test_ck_xxxx or live_ck_xxxx)
// Note: payment confirmation (server-side) should be verified via Toss dashboard
//       until a backend endpoint is available.
//
// SDK v2 flow:
//   tossPayments = await loadTossPayments(clientKey)
//   payment = tossPayments.payment({ customerKey: ANONYMOUS })
//   payment.requestPayment({ method: 'CARD', amount: {...}, orderId, orderName, successUrl, failUrl })

import { ANONYMOUS } from '@tosspayments/tosspayments-sdk';

export interface TossCheckoutOptions {
  amount: number;
  orderId: string;
  orderName: string;
  currency?: string;
  successUrl?: string;
  failUrl?: string;
  customerEmail?: string;
  customerName?: string;
}

export async function openTossCheckout(opts: TossCheckoutOptions): Promise<void> {
  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
  if (!clientKey) throw new Error('NEXT_PUBLIC_TOSS_CLIENT_KEY is not configured');

  const { loadTossPayments } = await import('@tosspayments/tosspayments-sdk');
  const tossPayments = await loadTossPayments(clientKey);

  const payment = tossPayments.payment({ customerKey: ANONYMOUS });

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const successUrl = opts.successUrl ?? `${origin}/payment/success`;
  const failUrl = opts.failUrl ?? `${origin}/payment/fail`;

  await payment.requestPayment({
    method: 'CARD',
    amount: {
      value: opts.amount,
      currency: opts.currency ?? 'KRW',
    },
    orderId: opts.orderId,
    orderName: opts.orderName,
    successUrl,
    failUrl,
    ...(opts.customerEmail && { customerEmail: opts.customerEmail }),
    ...(opts.customerName && { customerName: opts.customerName }),
  });
}

export function isTossConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
}
